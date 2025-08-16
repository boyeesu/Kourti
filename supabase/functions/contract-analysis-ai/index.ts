import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import {
  corsHeaders,
  handleOptions,
  verifyRequest,
  enforceRateLimit,
  getOpenAI,
  logOpenAIUsage,
} from '../_shared/utils.ts';

const openai = getOpenAI();

serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  // Auth
  const { user, errorResponse } = await verifyRequest(req);
  if (errorResponse) return errorResponse;

  // Rate-limit
  try {
    await enforceRateLimit(user!.id);
  } catch (rlErr) {
    return new Response(JSON.stringify({ error: (rlErr as Error).message }), {
      status: 429,
      headers: corsHeaders,
    });
  }
  // Business logic
  try {
    const { text, goal, analysisType = 'review' } = await req.json().catch(() => ({}));

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text content' }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let systemPrompt = `You are REAM AI, a friendly and expert legal document analysis assistant. You're knowledgeable, helpful, and speak in a warm, professional tone.`;
    let userPrompt = '';

    const goalContext = goal ? `\n\nSpecific user goal: ${goal}` : '';

    switch (analysisType) {
      case 'contract_review':
        systemPrompt += ` You specialize in contract analysis and risk assessment.`;
        userPrompt = `Please analyze this contract thoroughly. Pay special attention to:
- Key terms and obligations
- Potential risks or red flags
- Missing or unclear clauses
- Recommendations for improvement
- Overall contract health assessment

${goalContext}

Contract text:
${text}`;
        break;

      case 'document_review':
        systemPrompt += ` You specialize in legal document analysis and content extraction.`;
        userPrompt = `Please analyze this legal document and provide:
- Document type and purpose
- Key information and important dates
- Critical clauses or requirements
- Potential issues or concerns
- Summary of main points

${goalContext}

Document text:
${text}`;
        break;

      case 'key_information':
        systemPrompt += ` You extract and organize key information from legal documents.`;
        userPrompt = `Please extract and organize the key information from this document:
- Important dates (deadlines, expiration, renewal dates)
- Parties involved
- Financial terms and amounts
- Key obligations and responsibilities
- Critical clauses that require attention

${goalContext}

Document text:
${text}`;
        break;

      default:
        systemPrompt += ` You provide comprehensive legal document analysis.`;
        userPrompt = `Please provide a comprehensive analysis of this legal document:

${goalContext}

Document text:
${text}`;
    }

    let analysis = '';
    let usedModel = 'gpt-4o';
    let completion: any = null;
    try {
      completion = await openai.chat.completions.create({
        model: usedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      });
      analysis = completion.choices[0].message?.content ?? '';
    } catch (err) {
      // fallback to GPT-3.5
      try {
        usedModel = 'gpt-3.5-turbo';
        completion = await openai.chat.completions.create({
          model: usedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 2000,
        });
        analysis = completion.choices[0].message?.content ?? '';
      } catch (fallbackErr) {
        const errorMessage = `OpenAI error (GPT-4o): ${(err as Error).message}\nFallback error (GPT-3.5): ${(fallbackErr as Error).message}`;
        console.error('Contract analysis AI error:', errorMessage);
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }
    // log usage
    await logOpenAIUsage(user!.id, analysisType, usedModel, completion?.usage);

    return new Response(JSON.stringify({
      analysis,
      persona: 'REAM AI',
      analysisType,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Contract analysis AI error:', err);
    return new Response(JSON.stringify({ 
      error: 'Analysis failed', 
      details: (err as Error).message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});