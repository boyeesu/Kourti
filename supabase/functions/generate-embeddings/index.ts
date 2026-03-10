declare const Deno: any;

import { HttpError, createErrorResponse } from '../_shared/httpError.ts';
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
import { createErrorResponse as createSanitizedErrorResponse } from '../_shared/errorHandling.ts';
// @ts-ignore: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createTrace, traceOpenAIEmbedding } from '../_shared/langfuse.ts';

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
        'http://localhost:8087',
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

export const generateEmbeddingsHandler = async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  // Rate limiting - prevent AI cost abuse
  const rateLimitId = getRateLimitIdentifier(req);
  const rateLimitResult = checkRateLimit({
    ...RATE_LIMIT_PRESETS.AI,
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

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!OPENAI_API_KEY) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    // --- Authentication: require valid JWT ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new HttpError('Authorization header required', 401, 'UNAUTHORIZED');
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      throw new HttpError('Invalid Authorization header', 401, 'UNAUTHORIZED');
    }

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    let payload: any;

    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { documentId, documentType, content } = payload ?? {};

    if (!documentId || !content || !documentType) {
      throw new HttpError(
        'Missing required parameters: documentId, documentType, content',
        400,
        'INVALID_INPUT'
      );
    }

    // Create Langfuse trace for this request
    const traceId = await createTrace({
      name: 'generate-embeddings',
      metadata: {
        documentId,
        documentType,
      },
      tags: ['embeddings', 'document-processing'],
    });

    console.log(`Generating embedding for ${documentType} ${documentId}`);

    // Generate embedding using OpenAI
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: content.substring(0, 8000), // Limit content length
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      let message = 'Unknown error';
      try {
        const errorData = await response.json();
        console.error('OpenAI embedding error:', errorData);
        message = errorData.error?.message || JSON.stringify(errorData);
      } catch {
        const errorText = await response.text();
        console.error('OpenAI embedding error:', errorText);
        message = errorText;
      }

      throw new HttpError(`OpenAI API error: ${message}`, 502, 'OPENAI_UPSTREAM_ERROR', {
        status: response.status,
      });
    }

    const embeddingData = await response.json();
    const embedding = embeddingData.data[0].embedding;

    // Trace the embedding generation
    await traceOpenAIEmbedding(traceId, {
      model: 'text-embedding-3-small',
      input: content.substring(0, 8000),
      response: embeddingData,
      metadata: {
        documentId,
        documentType,
      },
    });

    console.log(`Generated embedding with ${embedding.length} dimensions`);

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        success: true,
        documentId,
        documentType,
        embedding,
        embeddingLength: embedding.length,
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
      function: 'generate-embeddings',
    });
  }
};

// @ts-ignore - Deno-specific property
if (import.meta.main) {
  Deno.serve(generateEmbeddingsHandler);
}
