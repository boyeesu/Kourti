declare const Deno: any;

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMIT_PRESETS,
  createRateLimitHeaders,
} from '../_shared/rateLimiting.ts';
import { HttpError, createErrorResponse } from '../_shared/httpError.ts';
import { createErrorResponse as createSanitizedErrorResponse } from '../_shared/errorHandling.ts';
import { requireCsrfTokenForUser } from '../_shared/csrfProtection.ts';
import { createTrace, traceOpenAIChatCompletion } from '../_shared/langfuse.ts';

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8082',
        'http://localhost:8083',
      ]
    : []),
  'https://app.kourti.com',
]
  .flatMap((value) => (value ? value.split(',') : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] || 'https://app.kourti.com';

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ['POST', 'OPTIONS'],
  };
}

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw new HttpError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new HttpError('Server configuration error', 503, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError?.message);
    throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
  }

  console.log(`Authenticated user: ${user.id}`);

  return { user, supabase };
}

interface AnalysisPayload {
  text?: string;
  goal?: string;
  analysisType?: string;
}

const personas: Record<string, { persona: string; guidance: string }> = {
  contract_review: {
    persona: 'REAM AI Legal Strategist',
    guidance:
      'Provide a contract review that highlights obligations, risks, liability allocation, termination triggers, compliance considerations, and recommended next steps.',
  },
  document_review: {
    persona: 'REAM AI Document Analyst',
    guidance:
      'Deliver a structured document review that summarizes purpose, key provisions, stakeholders, timelines, financial terms, and potential gaps.',
  },
  key_information: {
    persona: 'REAM AI Insights Specialist',
    guidance:
      'Extract key facts, critical clauses, involved parties, monetary values, deadlines, and any action items that require attention.',
  },
};

const basePersona = {
  persona: 'REAM AI Legal Analyst',
  guidance:
    'Provide a clear, professional legal analysis that surfaces obligations, risks, and suggested follow-up actions.',
};

serve(async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request
    const { user, supabase } = await authenticateRequest(req);
    console.log(`Processing contract analysis for user ${user.id}`);

    // CSRF Protection
    await requireCsrfTokenForUser(supabase, user.id, req);

    // Rate limiting - prevent AI abuse
    const rateLimitId = user.id;
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AI, // 20 requests per minute
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    // Parse request body
    let payload: AnalysisPayload;
    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { text, goal, analysisType = 'contract_review' } = payload;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new HttpError('Document text is required', 400, 'INVALID_INPUT');
    }

    const typeDetails = personas[analysisType] ?? basePersona;

    const systemPrompt = `You are ${typeDetails.persona}, a senior legal expert assisting with contract and document analysis.

CRITICAL OUTPUT FORMAT - YOU MUST RESPOND WITH A JSON CODE BLOCK:
Your response MUST be a JSON object wrapped in a \`\`\`json code block. No text before or after the JSON block.

The JSON structure must be:
\`\`\`json
{
  "summary": "A detailed executive summary of the document (2-4 sentences)",
  "riskScore": <number 0-100>,
  "findings": [
    {
      "severity": "critical" | "warning" | "info" | "positive",
      "title": "Short title of the finding (under 60 chars)",
      "description": "Detailed explanation of the finding with context and implications",
      "matchText": "Exact quoted text from the document this finding refers to",
      "recommendation": "Specific actionable recommendation or suggested replacement text",
      "section": "Section or clause reference",
      "category": "Category like 'Liability', 'Termination', 'Payment', 'IP', 'Compliance', 'Confidentiality', 'General'"
    }
  ]
}
\`\`\`

FINDING RULES:
- Include 8-20 findings covering all important aspects
- matchText MUST be an exact quote from the document (10-100 chars)
- severity: "critical" for significant risks, "warning" for concerns, "info" for observations, "positive" for good practices
- recommendation should be specific and actionable
- riskScore: 0-30 = low risk, 31-60 = moderate, 61-100 = high risk`;

    const goalInstruction = goal && goal.trim().length > 0 ? `\n\nUSER GOAL:\n${goal.trim()}` : '';

    const guidance = `\n\nANALYSIS FOCUS:\n${typeDetails.guidance}`;

    const userPrompt = `Analyze this document and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text.trim()}${goalInstruction}${guidance}

Include 10-20 findings covering: summary and context, key terms and obligations, risks and issues, and recommendations. Each finding must have an exact matchText quote from the document.`;

    // Create Langfuse trace for this request
    const traceId = await createTrace({
      name: 'contract-analysis-ai',
      userId: user.id,
      metadata: {
        analysisType,
        hasGoal: !!goal,
        textLength: text.length,
      },
      tags: ['contract-analysis', 'legal-ai'],
    });

    const requestStartTime = Date.now();
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_CHAT_MODEL') || 'gpt-5.4-2026-03-05',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: 2000,
      }),
    });

    console.log(`OpenAI request completed in ${Date.now() - requestStartTime}ms`);

    if (!response.ok) {
      const errorMessage = await response.text();
      console.error('OpenAI API error:', response.status, errorMessage);
      throw new HttpError('OpenAI API request failed', 502, 'OPENAI_UPSTREAM_ERROR', {
        status: response.status,
      });
    }

    const data = await response.json();
    const analysis = data?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      throw new HttpError('Failed to generate analysis', 502, 'OPENAI_EMPTY_RESPONSE');
    }

    // Trace the OpenAI chat completion
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];
    await traceOpenAIChatCompletion(traceId, {
      model: 'gpt-5.1',
      messages,
      response: data,
      metadata: {
        analysisType,
        hasGoal: !!goal,
        textLength: text.length,
        maxTokens: 2000,
      },
    });

    let cleanAnalysis = analysis
      .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers
      .replace(/^\s*[-*+•]\s+/gm, '') // Remove bullet points (including bullet symbol)
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/__(.*?)__/g, '$1') // Remove underline formatting
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/^\s*>\s+/gm, '') // Remove blockquotes
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove markdown links, keep text
      .replace(/—/g, ' ') // Replace em dashes with spaces
      .replace(/–/g, '-') // Replace en dashes with hyphens
      .replace(/…/g, '...') // Replace ellipsis
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes with regular apostrophes
      .replace(/•/g, '') // Remove bullet symbols
      .replace(/→/g, 'to') // Replace arrows
      .replace(/←/g, 'from')
      .replace(/↔/g, 'to and from')
      .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Replace various unicode spaces
      .replace(/\*\s+/g, ' ') // Remove any remaining asterisks used as bullets
      .replace(/^\s*[-*+•]\s+/gm, '') // Second pass for bullet points
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
      .replace(/([A-Z][A-Z\s]+):\s*\n/g, '$1: ') // Convert section headers with colons to inline text
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up excessive spacing
      .trim();

    // Safety net: if cleanup resulted in empty string, revert to raw analysis
    if (!cleanAnalysis && analysis.length > 0) {
      console.warn('Cleanup resulted in empty string, reverting to raw analysis');
      cleanAnalysis = analysis;
    }

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        analysis: cleanAnalysis,
        persona: typeDetails.persona,
        analysisType,
      },
      {
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'contract-analysis-ai',
    });
  }
});
