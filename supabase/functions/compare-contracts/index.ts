declare const Deno: any;

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";
import { createTrace, traceOpenAIChatCompletion } from "../_shared/langfuse.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8083",
  ] : []),
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

  console.log(`Authenticated user: ${user.id}`);

  return { user, supabase };
}

serve(async (req) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request
    const { user, supabase } = await authenticateRequest(req);
    console.log(`Processing contract comparison for user ${user.id}`);

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

    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { primaryText, comparisonText } = body ?? {};

    if (!primaryText || !comparisonText) {
      throw new HttpError('Both documents are required for comparison', 400, 'INVALID_INPUT');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new HttpError('OPENAI_API_KEY not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    const systemPrompt = `You are an expert legal contract analyst. Compare two contract versions and identify differences with high precision.

Your analysis must be returned as valid JSON matching this exact structure:
{
  "differences": [
    {
      "type": "added" | "removed" | "modified",
      "section": "string (e.g., 'Payment Terms')",
      "page": number,
      "line": number,
      "content": "string describing the change",
      "severity": "high" | "medium" | "low"
    }
  ],
  "summary": {
    "totalChanges": number,
    "addedSections": number,
    "removedSections": number,
    "modifiedSections": number,
    "riskLevel": "high" | "medium" | "low"
  }
}

CRITICAL RULES:
- Return ONLY valid JSON, no markdown formatting
- Identify specific, actionable differences
- Assess severity based on legal and financial impact
- Provide accurate section names
- Count changes accurately`;

    const userPrompt = `Compare these two contract versions and identify all meaningful differences:

PRIMARY DOCUMENT:
${primaryText}

COMPARISON DOCUMENT:
${comparisonText}

Provide a detailed JSON comparison following the specified structure.`;

    // Create Langfuse trace for this request
    const traceId = await createTrace({
      name: 'compare-contracts',
      userId: user.id,
      metadata: {
        primaryTextLength: primaryText.length,
        comparisonTextLength: comparisonText.length,
      },
      tags: ['contract-comparison', 'legal-ai'],
    });

    console.log('Requesting contract comparison from OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new HttpError('OpenAI API request failed', 502, 'OPENAI_UPSTREAM_ERROR', {
        status: response.status,
      });
    }

    const data = await response.json();
    let analysis = data.choices[0].message.content;

    // Trace the OpenAI chat completion
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    await traceOpenAIChatCompletion(traceId, {
      model: 'gpt-4o',
      messages,
      response: data,
      metadata: {
        primaryTextLength: primaryText.length,
        comparisonTextLength: comparisonText.length,
        maxTokens: 4000,
        temperature: 0.3,
      },
    });

    // Clean up markdown formatting if present
    analysis = analysis.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse the JSON response
    let comparisonResult;
    try {
      comparisonResult = JSON.parse(analysis);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', analysis);
      throw new HttpError('Invalid response format from AI', 502, 'OPENAI_INVALID_RESPONSE');
    }

    console.log('Contract comparison completed successfully');

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(comparisonResult, {
      cors: corsOptions,
      headers: rateLimitHeaders,
    });

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'compare-contracts',
    });
  }
});
