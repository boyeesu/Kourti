import { Router } from 'express';
import { z } from 'zod';

import { db } from '../../db/pool.js';
import {
  requestChatCompletion,
  streamChatCompletion,
  generateEmbedding,
  generateEmbeddingsBatch,
} from '../../lib/openai.js';
import { ApiError, asyncHandler } from '../../lib/http.js';
import { checkRateLimit } from '../../lib/rateLimit.js';

const analysisRequestSchema = z.object({
  text: z.string().min(1).max(200_000),
  analysisType: z.enum(['summarize', 'general', 'risk', 'extract', 'compare']).default('general'),
  goal: z.string().optional(),
  stream: z.boolean().optional(),
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
  stream: z.boolean().optional(),
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
  const goalDirective = goal ? `\nFocus: ${goal}` : '';
  return `Analyze this legal document (analysis type: ${analysisType}).${goalDirective}

You MUST return ONLY a JSON code block — no text, explanation, or commentary before or after it. Start your response with \`\`\`json and end with \`\`\`.

\`\`\`json
{
  "summary": "2-4 sentence executive summary of the document and its key risks",
  "riskScore": 0-100,
  "findings": [
    {
      "severity": "critical|warning|info|positive",
      "title": "Short finding title (max 80 chars)",
      "description": "Detailed explanation of why this matters and the legal implication",
      "matchText": "Exact quote from the document this finding references (copy verbatim, 20-200 chars)",
      "recommendation": "Specific actionable suggestion to address the issue",
      "section": "Section/clause reference if identifiable (e.g. 'Section 4.2', 'Clause 7')",
      "category": "One of: Liability, Termination, Payment, IP, Confidentiality, Non-Compete, Indemnification, Compliance, Force Majeure, General"
    }
  ]
}
\`\`\`

Rules:
- matchText MUST be an exact verbatim substring from the document (not paraphrased)
- Include 5-15 findings covering the most important issues
- Use "critical" sparingly — only for genuinely dangerous clauses
- Every finding must have a recommendation
- Categories should reflect the actual clause topic

Document:
${text}`;
}

export const aiRouter = Router();

// ── Chunking utility ────────────────────────────────────────────────────────

const CHUNK_MAX_TOKENS = 600;
const CHUNK_OVERLAP_TOKENS = 80;

function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.4);
}

function chunkText(
  text: string,
  maxTokens = CHUNK_MAX_TOKENS,
  overlapTokens = CHUNK_OVERLAP_TOKENS
): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maxTokens && current) {
      chunks.push(current.trim());
      // Overlap: keep the tail of the current chunk
      const words = current.split(/\s+/);
      const overlapWords = Math.floor(overlapTokens / 1.4);
      current = words.slice(-overlapWords).join(' ') + ' ' + sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks;
}

// ── RAG search helpers ──────────────────────────────────────────────────────

type ChunkRow = {
  id: string;
  document_id: string | null;
  contract_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  document_name: string | null;
  contract_title: string | null;
};

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

type RagResult = {
  id: string;
  document_id: string | null;
  contract_id: string | null;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  documentName: string;
  documentType: string;
};

/**
 * Vector-based RAG search using pgvector. Falls back to text search if
 * pgvector is not available or embedding generation fails.
 */
async function ragSearch(
  query: string,
  organizationId: string,
  limit: number,
  matchThreshold = 0.6
): Promise<RagResult[]> {
  // Try vector search first
  try {
    const queryEmbedding = await generateEmbedding(query);
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    const sql = `
      SELECT
        dc.id,
        dc.document_id,
        dc.contract_id,
        dc.content,
        dc.metadata,
        1 - (dc.embedding <=> $1::vector) AS similarity,
        d.name AS document_name,
        c.title AS contract_title
      FROM public.document_chunks dc
      LEFT JOIN public.documents d ON d.id = dc.document_id
      LEFT JOIN public.contracts c ON c.id = dc.contract_id
      WHERE dc.organization_id = $2
        AND dc.embedding IS NOT NULL
        AND 1 - (dc.embedding <=> $1::vector) > $3
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $4
    `;

    const result = await db.query<ChunkRow & { similarity: number }>(sql, [
      vectorStr,
      organizationId,
      matchThreshold,
      limit,
    ]);

    if (result.rows.length > 0) {
      return result.rows.map((row) => ({
        id: row.id,
        document_id: row.document_id,
        contract_id: row.contract_id,
        content: row.content,
        similarity: row.similarity,
        metadata: (row.metadata as Record<string, unknown>) || {},
        documentName: row.document_id
          ? row.document_name || 'Unknown Document'
          : row.contract_title || 'Unknown Contract',
        documentType: row.document_id ? 'document' : 'contract',
      }));
    }
  } catch {
    // pgvector not available or embedding failed — fall through to text search
  }

  return textRagSearch(query, organizationId, limit);
}

async function textRagSearch(query: string, organizationId: string, limit: number) {
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
    .query<ChunkRow>(sql, [organizationId, `%${escapeIlike(query)}%`, limit])
    .then((result) => result.rows)
    .catch(() => [] as ChunkRow[]);

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

    // Try to get stored content from the documents table
    const docResult = await db.query<{ content: string | null }>(
      `SELECT content FROM public.documents WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [parsed.documentId, auth.organizationId]
    );

    const content = docResult.rows[0]?.content;
    if (content && content.trim()) {
      res.status(200).json({ success: true, content });
      return;
    }

    // Try contract terms
    const contractResult = await db.query<{ terms: string | null }>(
      `SELECT terms FROM public.contracts WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [parsed.documentId, auth.organizationId]
    );

    const terms = contractResult.rows[0]?.terms;
    if (terms && terms.trim()) {
      res.status(200).json({ success: true, content: terms });
      return;
    }

    // Check if we have any processed chunks for this document
    const chunksResult = await db.query<{ content: string }>(
      `SELECT content FROM public.document_chunks
       WHERE (document_id = $1 OR contract_id = $1) AND organization_id = $2
       ORDER BY chunk_index ASC`,
      [parsed.documentId, auth.organizationId]
    );

    if (chunksResult.rows.length > 0) {
      const reconstructed = chunksResult.rows.map((r) => r.content).join('\n\n');
      res.status(200).json({ success: true, content: reconstructed });
      return;
    }

    res.status(200).json({
      success: false,
      error: 'No text content available. Upload a text-based document (TXT, DOCX) for extraction.',
      warning: 'PDF server-side extraction requires the document to be re-uploaded as text.',
    });
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

    const results = await ragSearch(
      parsed.query,
      auth.organizationId,
      limit,
      parsed.matchThreshold ?? 0.6
    );

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

    // Delete existing chunks before re-processing to prevent duplicates
    const entityCol = parsed.documentId ? 'document_id' : 'contract_id';
    const entityId = parsed.documentId || parsed.contractId;
    await db
      .query(
        `DELETE FROM public.document_chunks WHERE ${entityCol} = $1 AND organization_id = $2`,
        [entityId, auth.organizationId]
      )
      .catch(() => {
        // Table may not exist yet; ignore
      });

    // Chunk the document text
    const chunks = chunkText(parsed.content);

    // Generate embeddings in batches of 20
    const BATCH_SIZE = 20;
    let chunksProcessed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);

      let embeddings: number[][] | null = null;
      try {
        embeddings = await generateEmbeddingsBatch(batch);
      } catch {
        // Embedding generation failed — store chunks without embeddings
      }

      for (let j = 0; j < batch.length; j++) {
        const chunkIndex = i + j;
        const embedding = embeddings?.[j] ?? null;
        const embeddingStr = embedding ? `[${embedding.join(',')}]` : null;

        await db.query(
          `INSERT INTO public.document_chunks
            (document_id, contract_id, organization_id, content, chunk_index, embedding, token_count, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
          [
            parsed.documentId || null,
            parsed.contractId || null,
            auth.organizationId,
            batch[j],
            chunkIndex,
            embeddingStr,
            estimateTokens(batch[j]),
            JSON.stringify({
              documentType: parsed.documentType,
              processedAt: new Date().toISOString(),
            }),
          ]
        );
        chunksProcessed++;
      }
    }

    res.status(200).json({
      success: true,
      chunksProcessed,
      totalChunks: chunks.length,
    });
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

    // Auto-search RAG knowledge base for relevant context (unless inline document content is provided)
    let ragContext = '';
    if (!parsed.context?.documentContent) {
      try {
        const ragResults = await ragSearch(parsed.message, auth.organizationId, 5);
        if (ragResults.length > 0) {
          ragContext = ragResults
            .map((r) => `[Source: ${r.documentName}]\n${r.content}`)
            .join('\n\n---\n\n');
        }
      } catch {
        // RAG search failure should not block the assistant response
      }
    }

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are REAM AI, a legal assistant. Provide concise, practical, and risk-aware legal guidance. If information is missing, clearly state assumptions. When referencing knowledge base context, cite the source document name.',
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
      ...(ragContext
        ? [
            {
              role: 'system' as const,
              content: `Relevant context from the organization's knowledge base:\n${ragContext}`,
            },
          ]
        : []),
      ...(parsed.conversationHistory ?? []).slice(-12),
      {
        role: 'user' as const,
        content: parsed.message,
      },
    ];

    // Stream response via SSE when requested
    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        const completion = await streamChatCompletion(
          messages,
          (delta) => {
            res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
          },
          3000
        );

        res.write(
          `data: ${JSON.stringify({ type: 'done', tokensUsed: completion.tokensUsed, modelUsed: completion.modelUsed })}\n\n`
        );
        res.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Streaming failed';
        res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
        res.end();
      }
      return;
    }

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
      ...(parsed.conversationHistory ?? []).slice(-12),
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

    if (parsed.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        const completion = await streamChatCompletion(
          messages,
          (delta) => {
            res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
          },
          8000
        );

        res.write(
          `data: ${JSON.stringify({ type: 'done', tokensUsed: completion.tokensUsed, modelUsed: completion.modelUsed })}\n\n`
        );
        res.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Streaming failed';
        res.write(`data: ${JSON.stringify({ type: 'error', error: msg })}\n\n`);
        res.end();
      }
      return;
    }

    const completion = await requestChatCompletion(messages, 8000);

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
    z.object({
      audio: z.string().min(1),
      format: z.string().default('webm'),
    }).parse(req.body);

    // Placeholder -- real transcription via Whisper/OpenAI to be wired
    res.status(200).json({
      success: true,
      transcription: '',
      message: 'Voice transcription endpoint pending Whisper integration',
    });
  })
);

/**
 * Stream a long-form completion as SSE if the caller passed `stream: true`,
 * otherwise return the full response as JSON. Long-running batch endpoints
 * (compare-contracts, contract-generator) benefit from streaming because
 * the user otherwise sees a 30s+ blank screen.
 */
async function respondWithCompletion(
  res: import('express').Response,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  opts: { stream: boolean; maxTokens?: number; jsonKey: string }
) {
  if (opts.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    try {
      const completion = await streamChatCompletion(
        messages,
        (delta) => {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
        },
        opts.maxTokens ?? 4000
      );
      res.write(
        `data: ${JSON.stringify({ type: 'done', tokensUsed: completion.tokensUsed, modelUsed: completion.modelUsed })}\n\n`
      );
      res.end();
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : 'Streaming failed' })}\n\n`
      );
      res.end();
    }
    return;
  }
  const completion = await requestChatCompletion(messages, opts.maxTokens);
  res.status(200).json({
    success: true,
    [opts.jsonKey]: completion.analysis,
    tokensUsed: completion.tokensUsed,
    modelUsed: completion.modelUsed,
  });
}

aiRouter.post(
  '/compare-contracts',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        contractA: z.string().min(1),
        contractB: z.string().min(1),
        stream: z.boolean().optional().default(false),
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

    await respondWithCompletion(res, messages, {
      stream: body.stream,
      maxTokens: 4000,
      jsonKey: 'comparison',
    });
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
        stream: z.boolean().optional().default(false),
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

    await respondWithCompletion(res, messages, {
      stream: body.stream,
      maxTokens: 4000,
      jsonKey: 'contract',
    });
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
    const body = z
      .object({
        documentId: z.string().uuid().optional(),
        contractId: z.string().uuid().optional(),
        documentType: z.enum(['document', 'contract']).default('document'),
        content: z.string().min(1).max(800_000),
      })
      .refine((v) => v.documentId || v.contractId, {
        message: 'documentId or contractId is required',
      })
      .parse(req.body);
    const auth = req.auth!;

    const rate = checkRateLimit(auth.userId, 20, 60_000);
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      throw new ApiError('Too many requests. Please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
    }

    // Delete existing chunks then chunk + embed directly
    const entityCol = body.documentId ? 'document_id' : 'contract_id';
    const entityId = body.documentId || body.contractId;
    await db
      .query(
        `DELETE FROM public.document_chunks WHERE ${entityCol} = $1 AND organization_id = $2`,
        [entityId, auth.organizationId]
      )
      .catch(() => undefined);

    const chunks = chunkText(body.content);
    let chunksProcessed = 0;
    const BATCH_SIZE = 20;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      let embeddings: number[][] | null = null;
      try {
        embeddings = await generateEmbeddingsBatch(batch);
      } catch {
        // Store without embeddings
      }

      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings?.[j] ?? null;
        const embeddingStr = embedding ? `[${embedding.join(',')}]` : null;
        await db.query(
          `INSERT INTO public.document_chunks
            (document_id, contract_id, organization_id, content, chunk_index, embedding, token_count, metadata)
           VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)`,
          [
            body.documentId || null,
            body.contractId || null,
            auth.organizationId,
            batch[j],
            i + j,
            embeddingStr,
            estimateTokens(batch[j]),
            JSON.stringify({
              documentType: body.documentType,
              processedAt: new Date().toISOString(),
            }),
          ]
        );
        chunksProcessed++;
      }
    }

    res.status(200).json({ success: true, chunksProcessed });
  })
);
