import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { db } from '../../db/pool.js';
import { requestChatCompletion } from '../../lib/openai.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';

const analysisRequestSchema = z.object({
  text: z.string().min(1).max(200_000),
  analysisType: z.enum(['summarize', 'general', 'risk', 'extract', 'compare']).default('general'),
  goal: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .max(20)
    .optional(),
  ragContext: z.string().max(100_000).optional(),
});

const reamAssistantRequestSchema = z.object({
  message: z.string().min(1).max(20_000),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .max(30)
    .optional(),
  context: z
    .object({
      documentId: z.string().optional(),
      documentContent: z.string().max(100_000).optional(),
    })
    .optional(),
});

const ragSearchRequestSchema = z.object({
  query: z.string().min(3).max(1000),
  matchThreshold: z.number().min(0).max(1).optional(),
  matchCount: z.number().int().min(1).max(50).optional(),
});

const processDocumentRequestSchema = z
  .object({
    documentId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    content: z.string().min(1).max(800_000),
    documentType: z.enum(['document', 'contract']).default('document'),
  })
  .refine((value) => value.documentId || value.contractId, {
    message: 'documentId or contractId is required',
  });

const aiConversationIdParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const updateConversationSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

const createAiMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
});

const extractDocumentTextSchema = z.object({
  documentId: z.string().uuid(),
  filePath: z.string().min(1),
});

function buildPrompt(text: string, analysisType: string, goal?: string) {
  const base = `Analyze this legal document and return clear, structured findings with practical recommendations.`;
  const typeDirective = `Analysis type: ${analysisType}.`;
  const goalDirective = goal ? `Goal: ${goal}` : '';
  return [base, typeDirective, goalDirective, `Document:\n${text}`].filter(Boolean).join('\n\n');
}

export const aiRouter = Router();

let cachedSupabaseAdmin: ReturnType<typeof createClient> | null = null;

function getSupabaseAdminClient() {
  if (cachedSupabaseAdmin) {
    return cachedSupabaseAdmin;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError('Supabase function integration is not configured', 503, 'CONFIG_ERROR');
  }

  cachedSupabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedSupabaseAdmin;
}

type FallbackChunkRow = {
  id: string;
  document_id: string | null;
  contract_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  document_name: string | null;
  contract_title: string | null;
};

async function fallbackRagSearch(query: string, organizationId: string, limit: number) {
  const sql = `
    select
      dc.id,
      dc.document_id,
      dc.contract_id,
      dc.content,
      dc.metadata,
      d.name as document_name,
      c.title as contract_title
    from public.document_chunks dc
    left join public.documents d on d.id = dc.document_id
    left join public.contracts c on c.id = dc.contract_id
    where dc.organization_id = $1
      and dc.content ilike $2
    order by dc.updated_at desc nulls last
    limit $3
  `;

  const rows = await db
    .query<FallbackChunkRow>(sql, [organizationId, `%${query}%`, limit])
    .then((result) => result.rows)
    .catch(() => [] as FallbackChunkRow[]);

  return rows.map((row) => ({
    id: row.id,
    document_id: row.document_id,
    contract_id: row.contract_id,
    content: row.content,
    similarity: 0.75,
    metadata: row.metadata || {},
    documentName: row.document_id
      ? row.document_name || 'Unknown Document'
      : row.contract_title || 'Unknown Contract',
    documentType: row.document_id ? 'document' : 'contract',
  }));
}

aiRouter.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const parsed = createConversationSchema.parse(req.body);
    const auth = req.auth!;

    const result = await db.query<{
      id: string;
      organization_id: string;
      user_id: string;
      title: string;
      created_at: string;
      updated_at: string;
    }>(
      `
      insert into public.ai_conversations (organization_id, user_id, title)
      values ($1, $2, $3)
      returning id, organization_id, user_id, title, created_at, updated_at
      `,
      [auth.organizationId, auth.userId, parsed.title]
    );

    res.status(201).json(result.rows[0]);
  })
);

aiRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const auth = req.auth!;

    const result = await db.query(
      `
      select id, organization_id, user_id, title, created_at, updated_at
      from public.ai_conversations
      where organization_id = $1 and user_id = $2
      order by updated_at desc
      `,
      [auth.organizationId, auth.userId]
    );

    res.status(200).json(result.rows);
  })
);

aiRouter.patch(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const { conversationId } = aiConversationIdParamsSchema.parse(req.params);
    const parsed = updateConversationSchema.parse(req.body);
    const auth = req.auth!;

    const result = await db.query(
      `
      update public.ai_conversations
      set title = $1, updated_at = now()
      where id = $2 and organization_id = $3 and user_id = $4
      returning id, organization_id, user_id, title, created_at, updated_at
      `,
      [parsed.title, conversationId, auth.organizationId, auth.userId]
    );

    if (!result.rows[0]) {
      throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
    }

    res.status(200).json(result.rows[0]);
  })
);

aiRouter.delete(
  '/conversations/:conversationId',
  asyncHandler(async (req, res) => {
    const { conversationId } = aiConversationIdParamsSchema.parse(req.params);
    const auth = req.auth!;

    const result = await db.query(
      'delete from public.ai_conversations where id = $1 and organization_id = $2 and user_id = $3',
      [conversationId, auth.organizationId, auth.userId]
    );

    if ((result.rowCount || 0) === 0) {
      throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
    }

    res.status(204).send();
  })
);

aiRouter.get(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const { conversationId } = aiConversationIdParamsSchema.parse(req.params);
    const auth = req.auth!;

    const ownerCheck = await db.query(
      'select id from public.ai_conversations where id = $1 and organization_id = $2 and user_id = $3 limit 1',
      [conversationId, auth.organizationId, auth.userId]
    );

    if (!ownerCheck.rows[0]) {
      throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
    }

    const messages = await db.query(
      `
      select id, conversation_id, role, content, created_at
      from public.ai_conversation_messages
      where conversation_id = $1
      order by created_at asc
      `,
      [conversationId]
    );

    res.status(200).json(messages.rows);
  })
);

aiRouter.post(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const { conversationId } = aiConversationIdParamsSchema.parse(req.params);
    const parsed = createAiMessageSchema.parse(req.body);
    const auth = req.auth!;

    const ownerCheck = await db.query(
      'select id from public.ai_conversations where id = $1 and organization_id = $2 and user_id = $3 limit 1',
      [conversationId, auth.organizationId, auth.userId]
    );

    if (!ownerCheck.rows[0]) {
      throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
    }

    const inserted = await db.query(
      `
      insert into public.ai_conversation_messages (conversation_id, role, content)
      values ($1, $2, $3)
      returning id, conversation_id, role, content, created_at
      `,
      [conversationId, parsed.role, parsed.content]
    );

    await db.query('update public.ai_conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);

    res.status(201).json(inserted.rows[0]);
  })
);

aiRouter.delete(
  '/conversations/:conversationId/messages',
  asyncHandler(async (req, res) => {
    const { conversationId } = aiConversationIdParamsSchema.parse(req.params);
    const auth = req.auth!;

    const ownerCheck = await db.query(
      'select id from public.ai_conversations where id = $1 and organization_id = $2 and user_id = $3 limit 1',
      [conversationId, auth.organizationId, auth.userId]
    );

    if (!ownerCheck.rows[0]) {
      throw new ApiError('Conversation not found', 404, 'NOT_FOUND');
    }

    await db.query('delete from public.ai_conversation_messages where conversation_id = $1', [
      conversationId,
    ]);

    await db.query('update public.ai_conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);

    res.status(204).send();
  })
);

aiRouter.post(
  '/extract-document-text',
  asyncHandler(async (req, res) => {
    const parsed = extractDocumentTextSchema.parse(req.body);
    const auth = req.auth!;

    if (!parsed.filePath.startsWith(`${auth.organizationId}/`)) {
      throw new ApiError('Invalid file path for organization', 403, 'FORBIDDEN_FILE_PATH');
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const response = await supabaseAdmin.functions.invoke('extract-document-text', {
      body: {
        documentId: parsed.documentId,
        filePath: parsed.filePath,
      },
    });

    if (response.error) {
      throw new ApiError(
        response.error.message || 'Failed to extract document text',
        502,
        'UPSTREAM_ERROR'
      );
    }

    res.status(200).json(response.data || { success: false, error: 'No extraction response' });
  })
);

aiRouter.post(
  '/rag/search',
  asyncHandler(async (req, res) => {
    const parsed = ragSearchRequestSchema.parse(req.body);
    const auth = req.auth!;
    const limit = parsed.matchCount ?? 15;

    const rate = checkRateLimit(auth.userId, 60, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(rate.resetAt).toISOString());

    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    let results: Array<Record<string, unknown>> = [];

    try {
      const supabaseAdmin = getSupabaseAdminClient();
      const response = await supabaseAdmin.functions.invoke('rag-search', {
        body: {
          query: parsed.query,
          matchThreshold: parsed.matchThreshold ?? 0.6,
          matchCount: limit,
        },
      });

      if (!response.error && response.data?.success && Array.isArray(response.data.results)) {
        results = response.data.results;
      }
    } catch {
      // Ignore and fallback to SQL text search
    }

    if (!results.length) {
      results = await fallbackRagSearch(parsed.query, auth.organizationId, limit);
    }

    res.status(200).json({
      success: true,
      results,
      source: results.length ? 'node' : 'none',
    });
  })
);

aiRouter.post(
  '/rag/process-document',
  asyncHandler(async (req, res) => {
    const parsed = processDocumentRequestSchema.parse(req.body);
    const auth = req.auth!;

    const rate = checkRateLimit(auth.userId, 20, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(rate.resetAt).toISOString());

    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const response = await supabaseAdmin.functions.invoke('process-document-chunks', {
      body: {
        documentId: parsed.documentId,
        contractId: parsed.contractId,
        content: parsed.content,
        documentType: parsed.documentType,
        organizationId: auth.organizationId,
      },
    });

    if (response.error) {
      throw new ApiError(
        response.error.message || 'Failed to process document',
        502,
        'UPSTREAM_ERROR'
      );
    }

    if (!response.data) {
      throw new ApiError('No response from processing function', 502, 'UPSTREAM_ERROR');
    }

    res.status(200).json(response.data);
  })
);

aiRouter.post(
  '/ream-assistant',
  asyncHandler(async (req, res) => {
    const parsed = reamAssistantRequestSchema.parse(req.body);
    const auth = req.auth!;

    const limit = checkRateLimit(auth.userId, 30, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(limit.resetAt).toISOString());

    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are REAM AI, a legal assistant. Provide concise, practical, and risk-aware legal guidance. If information is missing, clearly state assumptions.',
      },
      {
        role: 'system' as const,
        content: `User organization: ${auth.organizationId}`,
      },
      ...(parsed.context?.documentContent
        ? [
            {
              role: 'system' as const,
              content: `Document context (ID: ${parsed.context.documentId || 'unknown'}):\n${parsed.context.documentContent}`,
            },
          ]
        : []),
      ...(parsed.conversationHistory ?? []).slice(-12),
      {
        role: 'user' as const,
        content: parsed.message,
      },
    ];

    const completion = await requestChatCompletion(messages, 3000);

    res.status(200).json({
      success: true,
      response: completion.analysis,
      tokensUsed: completion.tokensUsed,
      modelUsed: completion.modelUsed,
    });
  })
);

aiRouter.post(
  '/advanced-contract-analysis',
  asyncHandler(async (req, res) => {
    const parsed = analysisRequestSchema.parse(req.body);
    const auth = req.auth!;

    const limit = checkRateLimit(auth.userId, 20, 60_000);
    res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    res.setHeader('X-RateLimit-Reset', new Date(limit.resetAt).toISOString());

    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are an expert legal AI assistant. Provide concise, practical, and risk-aware guidance based only on the supplied content.',
      },
      ...(parsed.conversationHistory ?? []).slice(-10),
      ...(parsed.ragContext
        ? [
            {
              role: 'user' as const,
              content: `Relevant context from knowledge base:\n${parsed.ragContext}`,
            },
          ]
        : []),
      {
        role: 'user' as const,
        content: buildPrompt(parsed.text, parsed.analysisType, parsed.goal),
      },
    ];

    const completion = await requestChatCompletion(messages);

    res.status(200).json({
      success: true,
      analysis: completion.analysis,
      tokensUsed: completion.tokensUsed,
      modelUsed: completion.modelUsed,
    });
  })
);

// ── Additional AI endpoints ─────────────────────────────────────────────────

aiRouter.post(
  '/voice-transcription',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        audio: z.string().min(1),
        format: z.string().default('webm'),
      })
      .parse(req.body);

    // Placeholder -- real transcription via Whisper/OpenAI to be wired
    res.status(200).json({
      success: true,
      transcription: '',
      message: 'Voice transcription endpoint pending Whisper integration',
    });
  })
);

aiRouter.post(
  '/compare-contracts',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        contractA: z.string().min(1),
        contractB: z.string().min(1),
      })
      .parse(req.body);

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a legal contract comparison expert. Compare the two contracts and highlight key differences, risks, and important clauses.',
      },
      {
        role: 'user' as const,
        content: `Compare these two contracts:\n\n**Contract A:**\n${body.contractA.slice(0, 50000)}\n\n**Contract B:**\n${body.contractB.slice(0, 50000)}`,
      },
    ];

    const completion = await requestChatCompletion(messages);
    res.status(200).json({ success: true, comparison: completion.analysis });
  })
);

aiRouter.post(
  '/contract-generator',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        contractType: z.string().min(1),
        parties: z.array(z.string()).optional(),
        terms: z.string().optional(),
        jurisdiction: z.string().optional(),
      })
      .parse(req.body);

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a legal contract drafting expert. Generate a professional contract based on the specifications.',
      },
      {
        role: 'user' as const,
        content: `Generate a ${body.contractType} contract. Parties: ${(body.parties || []).join(', ')}. Terms: ${body.terms || 'Standard'}. Jurisdiction: ${body.jurisdiction || 'Not specified'}.`,
      },
    ];

    const completion = await requestChatCompletion(messages);
    res.status(200).json({ success: true, contract: completion.analysis });
  })
);

aiRouter.post(
  '/generate-invoice-pdf',
  asyncHandler(async (req, res) => {
    // Placeholder -- PDF generation to be wired
    res
      .status(200)
      .json({ success: true, message: 'PDF generation pending integration', pdfUrl: null });
  })
);

aiRouter.post(
  '/generate-embeddings',
  asyncHandler(async (req, res) => {
    // Placeholder -- embedding generation pending vector store integration
    res.status(200).json({ success: true, message: 'Embedding generation pending integration' });
  })
);
