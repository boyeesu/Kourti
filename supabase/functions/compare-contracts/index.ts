import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { primaryText, comparisonText } = await req.json();

    if (!primaryText || !comparisonText) {
      return new Response(
        JSON.stringify({ error: 'Both documents are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    console.log('Requesting contract comparison from OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
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
      return new Response(
        JSON.stringify({ error: 'AI analysis failed', details: errorText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    let analysis = data.choices[0].message.content;

    // Clean up markdown formatting if present
    analysis = analysis.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    // Parse the JSON response
    let comparisonResult;
    try {
      comparisonResult = JSON.parse(analysis);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', analysis);
      return new Response(
        JSON.stringify({ error: 'Invalid response format from AI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Contract comparison completed successfully');

    return new Response(
      JSON.stringify(comparisonResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in compare-contracts function:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
