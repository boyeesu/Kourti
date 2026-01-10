declare const Deno: any;

import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
// @ts-ignore - Deno-compatible import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

const DEFAULT_CHAT_MODEL = 'gpt-4.1';
const DEFAULT_FALLBACK_MODEL = 'gpt-4o-mini';

function getChatModelCandidates() {
  const configuredModel = Deno.env.get('OPENAI_CHAT_MODEL')?.trim();
  const configuredFallbackModel = Deno.env.get('OPENAI_FALLBACK_CHAT_MODEL')?.trim();

  const models = [
    configuredModel || DEFAULT_CHAT_MODEL,
    configuredFallbackModel || DEFAULT_FALLBACK_MODEL,
    DEFAULT_CHAT_MODEL,
    DEFAULT_FALLBACK_MODEL,
  ];

  return Array.from(new Set(models.filter(Boolean)));
}

async function requestChatCompletion(apiKey: string, body: Record<string, unknown>) {
  const modelCandidates = getChatModelCandidates();
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, modelUsed: model };
      }

      const errorData = await response.text();
      console.error(`OpenAI chat error for model ${model}:`, response.status, errorData);

      if ([400, 404, 422].includes(response.status)) {
        lastError = new HttpError(
          `Model ${model} unavailable: ${errorData}`,
          424,
          'OPENAI_MODEL_UNAVAILABLE',
          { status: response.status },
        );
        continue;
      }

      throw new HttpError(
        `OpenAI API error: ${response.status} - ${errorData}`,
        502,
        'OPENAI_UPSTREAM_ERROR',
        { status: response.status },
      );
    } catch (error) {
      const normalizedError =
        error instanceof HttpError
          ? error
          : new HttpError(String(error), 502, 'OPENAI_UPSTREAM_ERROR');
      lastError = normalizedError;
      console.error(`Failed to call OpenAI model ${model}:`, normalizedError.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new HttpError('Unable to reach OpenAI API for summarization', 502, 'OPENAI_UPSTREAM_ERROR');
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
  
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError?.message);
    throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
  }

  // Verify user has an organization
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    console.error('Profile lookup failed:', profileError?.message);
    throw new HttpError('User not associated with an organization', 403, 'FORBIDDEN');
  }

  console.log(`Authenticated user: ${user.id}, org: ${profile.organization_id}`);
  
  return { user, organizationId: profile.organization_id, supabase };
}

export const voiceTranscriptionHandler = async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request first
    const { user, organizationId: _orgId, supabase: authSupabase } = await authenticateRequest(req);
    console.log(`Processing voice transcription for user ${user.id}`);

    // CSRF Protection - validate token for authenticated mutation
    await requireCsrfTokenForUser(authSupabase, user.id, req);

    // Rate limiting - prevent resource exhaustion
    const rateLimitId = user.id || getRateLimitIdentifier(req);
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

    let body: any;

    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { audio, action, transcript } = body ?? {};
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    if (action === 'transcribe') {
      if (!audio) {
        throw new HttpError('Audio data is required for transcription', 400, 'INVALID_INPUT');
      }

      console.log('Starting voice transcription...');

      // Decode base64 audio
      const binaryAudio = Uint8Array.from(atob(audio), c => c.charCodeAt(0));
      
      // Prepare form data for OpenAI Whisper
      const formData = new FormData();
      const blob = new Blob([binaryAudio], { type: 'audio/webm' });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');

      // Send to OpenAI Whisper
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI transcription error:', errorText);
        throw new HttpError(`OpenAI transcription failed: ${errorText}`, 502, 'OPENAI_UPSTREAM_ERROR', {
          status: response.status,
        });
      }

      const transcriptionResult = await response.json();
      console.log('Transcription completed successfully');

      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse({ 
        success: true,
        transcript: transcriptionResult.text,
        duration: transcriptionResult.duration || null
      }, {
        cors: corsOptions,
        headers: rateLimitHeaders,
      });

    } else if (action === 'summarize') {
      if (!transcript) {
        throw new HttpError('Transcript is required for summarization', 400, 'INVALID_INPUT');
      }

      console.log('Generating summary for transcript...');

      const { data: summaryResult, modelUsed } = await requestChatCompletion(OPENAI_API_KEY, {
        messages: [
          {
            role: 'system',
            content: 'You are a legal assistant. Summarize the following transcript of legal proceedings in a clear, professional format. Focus on key points, decisions, actions required, and important details.'
          },
          {
            role: 'user',
            content: `Please summarize this legal proceeding transcript:\n\n${transcript}`
          }
        ],
        max_completion_tokens: 1000,
      });

      const summary = summaryResult.choices?.[0]?.message?.content;

      if (!summary) {
        throw new HttpError('Summary generation failed: Empty response from OpenAI', 502, 'OPENAI_UPSTREAM_ERROR');
      }

      console.log('Summary generated successfully');

      const rateLimitHeaders2 = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse({
        success: true,
        summary,
        modelUsed,
      }, {
        cors: corsOptions,
        headers: rateLimitHeaders2,
      });

    } else {
      throw new HttpError('Invalid action. Must be "transcribe" or "summarize"', 400, 'INVALID_ACTION');
    }

  } catch (error: unknown) {
    // Use HttpError if available, otherwise use sanitized error response
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'voice-transcription',
    });
  }
};

// @ts-ignore - Deno-specific property
if (import.meta.main) {
  Deno.serve(voiceTranscriptionHandler);
}
