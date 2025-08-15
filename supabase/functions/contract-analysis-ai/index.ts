import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import OpenAI from 'https://deno.land/x/openai@1.4.2/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openai = new OpenAI();

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, goal, analysisType = 'review' } = await req.json();

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 2000,
    });

    const analysis = completion.choices[0].message?.content || '';

    return new Response(JSON.stringify({ 
      analysis,
      persona: 'REAM AI',
      analysisType 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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