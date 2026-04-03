declare const Deno: any;

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { HttpError, createErrorResponse } from '../_shared/httpError.ts';
import {
  checkRateLimitDistributed,
  createRateLimitHeaders,
  RATE_LIMIT_PRESETS,
  getRateLimitIdentifier,
} from '../_shared/rateLimiting.ts';
import { requireCsrfTokenForUser } from '../_shared/csrfProtection.ts';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import { createTrace, traceOpenAIChatCompletion } from '../_shared/langfuse.ts';

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
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

const DEFAULT_CHAT_MODEL = 'gpt-5.4-2026-03-05';
const DEFAULT_FALLBACK_MODEL = 'gpt-4o';

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

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new HttpError('Supabase configuration missing', 500, 'SUPABASE_CONFIG_MISSING');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

async function requestChatCompletion(body: Record<string, unknown>) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

  if (!openAIApiKey) {
    throw new HttpError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const modelCandidates = getChatModelCandidates();
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, model }),
      });

      if (response.ok) {
        const data = await response.json();
        return { data, modelUsed: model };
      }

      const errorText = await response.text();
      console.error(`OpenAI API error for model ${model}:`, response.status, errorText);

      if ([400, 404, 422].includes(response.status)) {
        lastError = new HttpError(
          `Model ${model} unavailable: ${errorText}`,
          424,
          'OPENAI_MODEL_UNAVAILABLE',
          { status: response.status }
        );
        continue;
      }

      throw new HttpError(
        `OpenAI API error: ${response.status} - ${errorText}`,
        502,
        'OPENAI_UPSTREAM_ERROR',
        { status: response.status }
      );
    } catch (error) {
      const normalizedError =
        error instanceof HttpError
          ? error
          : new HttpError(String(error), 502, 'OPENAI_UPSTREAM_ERROR');
      lastError = normalizedError;
      console.error(`OpenAI request failed for model ${model}:`, normalizedError.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new HttpError('Unable to reach OpenAI API', 502, 'OPENAI_UPSTREAM_ERROR');
}

async function handleStreamingResponse(
  messages: Array<{ role: string; content: string }>,
  corsOptions: any,
  rateLimitHeaders: Record<string, string>
) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new HttpError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const modelCandidates = getChatModelCandidates();
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: 4000,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`OpenAI streaming error for model ${model}:`, response.status, errorText);

        if ([400, 404, 422].includes(response.status)) {
          lastError = new HttpError(
            `Model ${model} unavailable: ${errorText}`,
            424,
            'OPENAI_MODEL_UNAVAILABLE',
            { status: response.status }
          );
          continue;
        }

        throw new HttpError(
          `OpenAI API error: ${response.status} - ${errorText}`,
          502,
          'OPENAI_UPSTREAM_ERROR',
          { status: response.status }
        );
      }

      // Return streaming response with proper CORS headers
      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      // Add CORS headers (use corsOptions.origin, not the non-existent corsOptions.allowOrigin)
      if (corsOptions) {
        headers.set('Access-Control-Allow-Origin', corsOptions.origin || 'https://app.kourti.com');
        headers.set(
          'Access-Control-Allow-Methods',
          corsOptions.allowMethods?.join(',') || 'POST, OPTIONS'
        );
        headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        headers.set('Access-Control-Allow-Credentials', 'true');
      }

      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });

      return new Response(response.body, { headers });
    } catch (error) {
      const normalizedError =
        error instanceof HttpError
          ? error
          : new HttpError(String(error), 502, 'OPENAI_UPSTREAM_ERROR');
      lastError = normalizedError;
      console.error(`OpenAI streaming request failed for model ${model}:`, normalizedError.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new HttpError('Unable to reach OpenAI API for streaming', 502, 'OPENAI_UPSTREAM_ERROR');
}

async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    throw new HttpError('Authorization header required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    throw new HttpError('Invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const supabase = getSupabaseClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
  }

  return { user, supabase };
}

export const advancedContractAnalysisHandler = async (req: Request) => {
  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);
  let rateLimitHeaders: Record<string, string> = {};

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    console.log('Advanced contract analysis request received');

    let payload: any;

    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { text, analysisType, goal, documentId, conversationHistory, ragContext, stream } =
      payload ?? {};

    console.log('Request payload:', { text: text?.length || 0, analysisType, goal });

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('No text provided or empty text');
      throw new HttpError('Document text is required and cannot be empty', 400, 'INVALID_INPUT');
    }

    // Input size limits to prevent cost abuse
    if (text.length > 200000) {
      throw new HttpError(
        'Document text exceeds maximum length of 200,000 characters',
        400,
        'INPUT_TOO_LARGE'
      );
    }
    if (ragContext && typeof ragContext === 'string' && ragContext.length > 100000) {
      throw new HttpError(
        'RAG context exceeds maximum length of 100,000 characters',
        400,
        'INPUT_TOO_LARGE'
      );
    }
    if (Array.isArray(conversationHistory) && conversationHistory.length > 20) {
      throw new HttpError(
        'Conversation history exceeds maximum of 20 messages',
        400,
        'INPUT_TOO_LARGE'
      );
    }

    const { user, supabase } = await authenticateRequest(req);
    const userId = user.id;

    await requireCsrfTokenForUser(supabase, userId, req);

    const rateLimitResult = await checkRateLimitDistributed({
      ...RATE_LIMIT_PRESETS.AI,
      identifier: getRateLimitIdentifier(req, userId),
    });

    rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

    if (!rateLimitResult.allowed) {
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

    console.log('Processing analysis request for user:', userId);

    // Create Langfuse trace for this request
    const traceId = await createTrace({
      name: 'advanced-contract-analysis',
      userId: userId || undefined,
      metadata: {
        analysisType,
        hasDocumentId: !!documentId,
        hasConversationHistory: !!conversationHistory,
        hasRAGContext: !!ragContext,
        stream: stream === true,
      },
      tags: ['contract-analysis', 'legal-ai'],
    });

    // Enhanced system prompt for better legal analysis with RAG support
    const systemPrompt = `You are an expert legal AI assistant specializing in contract and document analysis. Your role is to provide comprehensive, structured, and actionable legal insights.

CRITICAL: You MUST base your analysis ONLY on the document content provided. Reference specific clauses, sections, and terms from the actual document text.

RAG CONTEXT HANDLING:
- When relevant document chunks are provided from the knowledge base, prioritize information from those chunks
- Cite the source document name when referencing information from RAG context
- If RAG context is provided, use it to answer the question even if it's not in the main document text
- Combine information from multiple sources when relevant
- If information conflicts between sources, note the discrepancy

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
      "section": "Section or clause reference (e.g. 'Section 5.2', 'Termination Clause')",
      "category": "Category like 'Liability', 'Termination', 'Payment', 'IP', 'Compliance', 'Confidentiality', 'General'"
    }
  ]
}
\`\`\`

FINDING RULES:
- Include 8-20 findings covering all important aspects of the document
- severity "critical": provisions that expose parties to significant legal/financial risk
- severity "warning": areas of concern, ambiguous terms, missing protections
- severity "info": neutral observations, standard provisions worth noting
- severity "positive": well-drafted clauses, strong protections, good practices
- matchText MUST be an exact quote from the document (copy verbatim, 10-100 chars)
- recommendation should be specific and actionable; for critical/warning findings, suggest replacement text when possible
- riskScore: 0-30 = low risk, 31-60 = moderate risk, 61-100 = high risk

Your analysis should be:
1. Based EXCLUSIVELY on the provided document content
2. Reference specific sections and language from the document
3. Legally accurate and practical
4. Easy to understand for both legal professionals and non-lawyers
5. Action-oriented with specific recommendations
6. Comprehensive - cover all key aspects of the document`;

    let userPrompt = '';

    switch (analysisType) {
      case 'summarize':
      case 'general':
        userPrompt = `Analyze this legal document and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text}

Cover these areas in your findings: document overview, key provisions, parties and roles, financial terms, timeframes, risk assessment, compliance, and recommendations. Include 10-20 findings with exact quotes from the document as matchText.`;
        break;

      case 'risk':
        userPrompt = `Conduct a thorough risk analysis of this legal document and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text}

Focus on: high risk areas, liability concerns, enforcement issues, compliance gaps, missing protections, ambiguous terms, and mitigation strategies. Weight findings toward critical and warning severity. Include 10-20 findings with exact quotes from the document as matchText.`;
        break;

      case 'extract':
        userPrompt = `Extract and organize the key legal elements from this document and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text}

Focus on extracting: parties involved, contractual obligations, payment terms, important dates, termination conditions, governing law, dispute resolution, confidentiality, IP rights, and regulatory requirements. Use "info" severity for extracted facts and "warning" for missing elements. Include 10-20 findings with exact quotes from the document as matchText.`;
        break;

      case 'compare':
        userPrompt = `Analyze this document for comparison purposes and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text}

Focus on: document classification, standard provisions, unique/non-standard terms, missing elements, structural analysis, legal completeness, and industry standards. Include 10-20 findings with exact quotes from the document as matchText.`;
        break;

      default:
        userPrompt =
          goal ||
          `Analyze this legal document and return your findings as a JSON code block following the exact schema from your instructions.

DOCUMENT:
${text}

Provide a comprehensive analysis covering key terms, risks, and recommendations. Include 10-20 findings with exact quotes from the document as matchText.`;
    }

    // Build messages array with conversation history if provided
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history if provided (last 10 messages to manage context)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-10); // Keep last 10 messages
      messages.push(
        ...recentHistory.map((msg: any) => ({
          role: msg.role || 'user',
          content: msg.content || '',
        }))
      );
    }

    // Add RAG context if provided
    if (ragContext && typeof ragContext === 'string' && ragContext.trim()) {
      messages.push({
        role: 'user',
        content: `RELEVANT DOCUMENT CONTEXT FROM KNOWLEDGE BASE:\n\n${ragContext}\n\n---\n\nNow answer the user's question based on this context.`,
      });
    }

    // Add the current user prompt
    messages.push({ role: 'user', content: userPrompt });

    console.log('Making request to OpenAI for advanced contract analysis', {
      messageCount: messages.length,
      hasHistory: conversationHistory?.length > 0,
      hasRAGContext: !!ragContext,
      stream: stream === true,
    });

    // If streaming is requested, handle streaming response
    if (stream === true) {
      return handleStreamingResponse(messages, corsOptions, rateLimitHeaders);
    }

    const { data, modelUsed } = await requestChatCompletion({
      messages,
      max_completion_tokens: 4000,
    });

    // Trace the OpenAI chat completion
    await traceOpenAIChatCompletion(traceId, {
      model: modelUsed,
      messages,
      response: data,
      userId: userId || undefined,
      metadata: {
        analysisType,
        documentId,
        hasRAGContext: !!ragContext,
        maxTokens: 4000,
      },
    });

    console.log(`OpenAI response received using model ${modelUsed}`);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI response structure:', data);
      throw new Error('Unexpected response from OpenAI API');
    }

    let analysis = data.choices[0].message.content;
    const rawAnalysisLength = analysis.length;
    console.log('Raw analysis received (first 100 chars):', analysis.substring(0, 100));

    // Enhanced cleanup of analysis by removing ALL markdown formatting and special symbols
    let cleanedAnalysis = analysis
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

    // If cleanup resulted in empty string (over-aggressive regex), revert to raw analysis
    if (!cleanedAnalysis && rawAnalysisLength > 0) {
      console.warn('Cleanup resulted in empty string, reverting to raw analysis');
      cleanedAnalysis = analysis;
    }

    // Update the analysis variable to strict logic
    analysis = cleanedAnalysis;

    // Log successful completion
    console.log('Analysis processing completed, final length:', analysis.length);

    // Store analysis if documentId is provided
    if (documentId && userId && supabase) {
      try {
        await supabase.from('document_analyses' as any).insert({
          document_id: documentId,
          analysis_type: analysisType || 'general',
          content: analysis,
          status: 'completed',
          created_by: userId,
          organization_id: null, // Will be set by RLS if needed
        } as any);
        console.log('Analysis stored in database');
      } catch (dbError) {
        console.error('Failed to store analysis:', dbError);
        // Continue even if storage fails
      }
    }

    return createJsonResponse(
      {
        analysis,
        success: true,
        tokensUsed: data.usage?.total_tokens || 0,
        modelUsed,
      },
      { cors: corsOptions, headers: rateLimitHeaders }
    );
  } catch (error: any) {
    console.error('Error in advanced contract analysis:', error);
    return createErrorResponse(error, corsOptions, 'Analysis failed');
  }
};

// @ts-ignore - Deno-specific property
if (import.meta.main) {
  serve(advancedContractAnalysisHandler);
}
