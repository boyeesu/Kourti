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

interface AnalysisPayload {
  text?: string;
  goal?: string;
  analysisType?: string;
}

const personas: Record<string, { persona: string; guidance: string }> = {
  contract_review: {
    persona: "REAM AI Legal Strategist",
    guidance:
      "Provide a contract review that highlights obligations, risks, liability allocation, termination triggers, compliance considerations, and recommended next steps.",
  },
  document_review: {
    persona: "REAM AI Document Analyst",
    guidance:
      "Deliver a structured document review that summarizes purpose, key provisions, stakeholders, timelines, financial terms, and potential gaps.",
  },
  key_information: {
    persona: "REAM AI Insights Specialist",
    guidance:
      "Extract key facts, critical clauses, involved parties, monetary values, deadlines, and any action items that require attention.",
  },
};

const basePersona = {
  persona: "REAM AI Legal Analyst",
  guidance:
    "Provide a clear, professional legal analysis that surfaces obligations, risks, and suggested follow-up actions.",
};

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === "OPTIONS") {
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

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
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

    const { text, goal, analysisType = "contract_review" } = payload;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new HttpError('Document text is required', 400, 'INVALID_INPUT');
    }

    const typeDetails = personas[analysisType] ?? basePersona;

    const systemPrompt = `You are ${typeDetails.persona}, a senior legal expert assisting with contract and document analysis.

CRITICAL WRITING RULES - STRICTLY ENFORCE:
- Respond using plain text paragraphs with blank lines between sections
- NEVER use markdown headings (#, ##, ###, etc.) - write section titles naturally within the text flow
- NEVER use bullet points with - or * or • characters - use numbered lists (1., 2., 3.) written as complete sentences or integrate into paragraphs
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-), commas, or colons instead
- NEVER use special unicode characters or symbols (—, –, •, →, ←, ↔, "", '', …, etc.)
- NEVER use ** bold formatting or * italic formatting or __ underline formatting
- NEVER use markdown formatting of any kind
- Use regular hyphens (-) only for compound words, not for lists
- Use regular quotes (") not smart quotes ("")
- Use regular apostrophes (') not smart apostrophes ('')
- Write section labels naturally within paragraphs, not as separate headers with colons
- Be extremely detailed and comprehensive in your analysis - provide thorough explanations, context, and practical implications
- Keep the tone professional, practical, and easy to follow for legal and business stakeholders
- Structure responses with clear, flowing paragraphs that naturally transition between topics`;

    const goalInstruction = goal && goal.trim().length > 0
      ? `\n\nUSER GOAL:\n${goal.trim()}`
      : "";

    const guidance = `\n\nANALYSIS FOCUS:\n${typeDetails.guidance}`;

    const userPrompt = `DOCUMENT TO ANALYZE:\n${text.trim()}${goalInstruction}${guidance}

Please provide a comprehensive, detailed response that covers all of the following areas. Write each section as flowing paragraphs with thorough explanations, not as lists or bullet points:

1. SUMMARY AND CONTEXT - Provide a detailed overview of the document, its purpose, the parties involved, and the overall context. Be specific and comprehensive.

2. KEY TERMS AND OBLIGATIONS - Explain all key terms, conditions, obligations, and important provisions in detail. Describe what each party must do, when, and under what conditions. Be thorough and specific.

3. RISKS OR ISSUES - Identify and explain all potential risks, issues, concerns, or problematic areas in detail. Explain why each is a concern and what the implications might be. Be comprehensive in your risk assessment.

4. RECOMMENDATIONS OR NEXT STEPS - Provide detailed, actionable recommendations and next steps. Explain what should be done, why, and how. Be specific and practical.

Remember: Write in plain text paragraphs, be extremely detailed, avoid all markdown formatting, and structure your response naturally with clear transitions between sections.`;

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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
    await traceOpenAIChatCompletion(traceId, {
      model: "gpt-5.1",
      messages,
      response: data,
      metadata: {
        analysisType,
        hasGoal: !!goal,
        textLength: text.length,
        maxTokens: 2000,
      },
    });

    const cleanAnalysis = analysis
      .replace(/^#{1,6}\s+/gm, "") // Remove markdown headers
      .replace(/^\s*[-*+•]\s+/gm, "") // Remove bullet points (including bullet symbol)
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold formatting
      .replace(/\*(.*?)\*/g, "$1") // Remove italic formatting
      .replace(/__(.*?)__/g, "$1") // Remove underline formatting
      .replace(/`([^`]+)`/g, "$1") // Remove inline code
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/^\s*>\s+/gm, "") // Remove blockquotes
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove markdown links, keep text
      .replace(/—/g, " ") // Replace em dashes with spaces
      .replace(/–/g, "-") // Replace en dashes with hyphens
      .replace(/…/g, "...") // Replace ellipsis
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes with regular apostrophes
      .replace(/•/g, "") // Remove bullet symbols
      .replace(/→/g, "to") // Replace arrows
      .replace(/←/g, "from")
      .replace(/↔/g, "to and from")
      .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ") // Replace various unicode spaces
      .replace(/\*\s+/g, " ") // Remove any remaining asterisks used as bullets
      .replace(/^\s*[-*+•]\s+/gm, "") // Second pass for bullet points
      .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double newlines
      .replace(/([A-Z][A-Z\s]+):\s*\n/g, "$1: ") // Convert section headers with colons to inline text
      .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up excessive spacing
      .trim();

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
      },
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
