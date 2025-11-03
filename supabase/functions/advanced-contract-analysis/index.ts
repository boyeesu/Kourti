import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
};

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
          'Authorization': `Bearer ${openAIApiKey}`,
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
          { status: response.status },
        );
        continue;
      }

      throw new HttpError(
        `OpenAI API error: ${response.status} - ${errorText}`,
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
      console.error(`OpenAI request failed for model ${model}:`, normalizedError.message);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new HttpError('Unable to reach OpenAI API', 502, 'OPENAI_UPSTREAM_ERROR');
}

export const advancedContractAnalysisHandler = async (req: Request) => {
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

    const { text, analysisType, goal, documentId } = payload ?? {};

    console.log('Request payload:', { text: text?.length || 0, analysisType, goal });

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('No text provided or empty text');
      throw new HttpError('Document text is required and cannot be empty', 400, 'INVALID_INPUT');
    }

    // Get user info from request headers
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let supabase;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '').trim();

      if (!token) {
        throw new HttpError('Invalid Authorization header', 401, 'UNAUTHORIZED');
      }

      supabase = getSupabaseClient();

      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
      }

      userId = user.id;
    }

    console.log('Processing analysis request for user:', userId);

    // Enhanced system prompt for better legal analysis
    const systemPrompt = `You are an expert legal AI assistant specializing in contract and document analysis. Your role is to provide comprehensive, structured, and actionable legal insights.

CRITICAL: You MUST base your analysis ONLY on the document content provided. Reference specific clauses, sections, and terms from the actual document text.

CRITICAL OUTPUT FORMATTING RULES:
- NEVER use # headings in responses
- NEVER use - bullet points in responses  
- NEVER use ** bold formatting in responses
- NEVER use * italic formatting in responses
- Use plain text with clear sections separated by double line breaks
- Use numbered lists (1., 2., 3.) when listing items
- Use structured paragraphs for readability
- Write in a conversational, professional tone

Your analysis should be:
1. Based EXCLUSIVELY on the provided document content
2. Reference specific sections and language from the document
3. Legally accurate and practical
4. Easy to understand for both legal professionals and non-lawyers
5. Well-structured with clear sections
6. Action-oriented with specific recommendations when appropriate

When analyzing documents, always:
- Quote or paraphrase relevant document language
- Cite specific clauses or sections being discussed
- Base conclusions on actual document text, not assumptions
- Identify what IS and IS NOT present in the document
- Provide context-specific insights based on the actual content

Respond directly to the user's question using ONLY the document content provided.`;

    let userPrompt = '';
    
    switch (analysisType) {
      case 'summarize':
      case 'general':
        userPrompt = `Please provide a comprehensive analysis of this legal document:

${text}

Your analysis should include:

DOCUMENT OVERVIEW
Provide a clear summary of what this document is and its primary purpose.

KEY PROVISIONS
Identify and explain the most important terms, conditions, and obligations.

PARTIES AND ROLES
Describe who the parties are and their respective responsibilities.

FINANCIAL TERMS
Outline any payment terms, amounts, or financial obligations.

TIMEFRAMES AND DEADLINES
Highlight important dates, deadlines, or duration terms.

RISK ASSESSMENT
Identify potential legal risks, liabilities, or areas of concern.

COMPLIANCE CONSIDERATIONS
Note any regulatory or legal compliance requirements.

RECOMMENDATIONS
Provide specific suggestions for improvement or areas that need attention.

Please ensure your response is detailed, professional, and actionable.`;
        break;
        
      case 'risk':
        userPrompt = `Conduct a thorough risk analysis of this legal document:

${text}

Focus on:

HIGH RISK AREAS
Identify provisions that could expose parties to significant legal or financial risk.

LIABILITY CONCERNS
Analyze liability clauses, indemnification terms, and limitation provisions.

ENFORCEMENT ISSUES
Evaluate the enforceability of key provisions and potential challenges.

COMPLIANCE GAPS
Identify any regulatory or legal compliance issues.

MISSING PROTECTIONS
Note important protective clauses that may be absent.

AMBIGUOUS TERMS
Highlight vague or unclear provisions that could lead to disputes.

MITIGATION STRATEGIES
Recommend specific actions to reduce identified risks.

Provide a detailed risk assessment with specific recommendations.`;
        break;
        
      case 'extract':
        userPrompt = `Extract and organize the key legal elements from this document:

${text}

Please provide:

PARTIES INVOLVED
List all parties with their roles and contact information.

CONTRACTUAL OBLIGATIONS
Detail what each party must do or provide.

PAYMENT TERMS
Extract all financial terms, amounts, and payment schedules.

IMPORTANT DATES
List all deadlines, effective dates, and expiration dates.

TERMINATION CONDITIONS
Describe how and when the agreement can be terminated.

GOVERNING LAW
Identify applicable jurisdiction and governing law.

DISPUTE RESOLUTION
Outline procedures for handling disputes.

CONFIDENTIALITY PROVISIONS
Extract any non-disclosure or confidentiality terms.

INTELLECTUAL PROPERTY
Note any IP rights, licenses, or restrictions.

REGULATORY REQUIREMENTS
Identify any compliance or regulatory obligations.

Present the information in a clear, organized format.`;
        break;
        
      case 'compare':
        userPrompt = `Analyze this document for comparison purposes:

${text}

Provide:

DOCUMENT CLASSIFICATION
Identify the type and purpose of this document.

STANDARD PROVISIONS
List common/standard clauses found in similar documents.

UNIQUE TERMS
Highlight unusual or non-standard provisions.

MISSING ELEMENTS
Note typical clauses that appear to be missing.

STRUCTURAL ANALYSIS
Evaluate the organization and flow of the document.

LEGAL COMPLETENESS
Assess whether the document covers all necessary legal aspects.

INDUSTRY STANDARDS
Compare against typical industry practices where applicable.

This analysis will be used for document comparison purposes.`;
        break;
        
      default:
        userPrompt = goal || `Please analyze this legal document and provide insights:

${text}

Provide a comprehensive analysis covering key terms, risks, and recommendations.`;
    }

    console.log('Making request to OpenAI for advanced contract analysis');

    const { data, modelUsed } = await requestChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 4000,
    });

    console.log(`OpenAI response received using model ${modelUsed}`);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected OpenAI response structure:', data);
      throw new Error('Unexpected response from OpenAI API');
    }

    let analysis = data.choices[0].message.content;

    // Enhanced cleanup of analysis by removing ALL markdown formatting
    analysis = analysis
      .replace(/^#{1,6}\s+/gm, '') // Remove # headings
      .replace(/^\s*[-*+]\s+/gm, '') // Remove -, *, + bullet points
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting  
      .replace(/__(.*?)__/g, '$1') // Remove underline formatting
      .replace(/`([^`]+)`/g, '$1') // Remove inline code formatting
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/^\s*>\s+/gm, '') // Remove blockquotes
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links but keep text
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
      .trim();

    // Log successful completion
    console.log('Analysis completed successfully, length:', analysis.length);

    // Store analysis if documentId is provided
    if (documentId && userId && supabase) {
      try {
        await supabase
          .from('document_analyses')
          .insert({
            document_id: documentId,
            analysis_type: analysisType || 'general',
            content: analysis,
            status: 'completed',
            created_by: userId,
            organization_id: null // Will be set by RLS if needed
          });
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
      { cors: corsOptions },
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