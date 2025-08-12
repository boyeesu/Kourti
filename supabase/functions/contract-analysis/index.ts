import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigins = Deno.env.get('TRUSTED_ORIGINS')?.split(',') ?? [];
  if (!allowedOrigins.includes(origin)) {
    return new Response(
      JSON.stringify({ error: 'Origin not allowed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!authHeader?.startsWith('Bearer ') || !supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid authorization token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseAnonKey,
    },
  });

  if (!userResponse.ok) {
    return new Response(
      JSON.stringify({ error: 'Invalid auth token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { text, analysisType } = await req.json();
    
    if (!text || !analysisType) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: text and analysisType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let prompt = '';
    switch (analysisType) {
      case 'summarize':
        prompt = `Summarize the following contract in simple bullet points:\n\nContract:\n${text}`;
        break;
      case 'extractClauses':
        prompt = `Extract key legal clauses such as Termination, Confidentiality, Governing Law, and Limitation of Liability from the following contract. List each clause with its original wording:\n\nContract:\n${text}`;
        break;
      case 'redline':
        prompt = `Read this contract and identify any ambiguous, risky, or missing terms. Redline and comment key sections. List the line or section, suggestion for rewording, and a short comment:\n\nContract:\n${text}`;
        break;
      default:
        throw new Error('Invalid analysis type');
    }

    console.log(`Performing ${analysisType} analysis for contract`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: 'You are a legal expert that analyzes contracts professionally and provides accurate insights.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content.trim();

    console.log(`Contract analysis completed successfully`);

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in contract-analysis function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});