import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get OpenAI API key from environment variable
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration not found');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { 
      documentId, 
      content, 
      documentType = 'document',
      analysisType = 'general',
      userId,
      organizationId,
      stream = false
    } = await req.json();

    // Validate required fields
    if (!documentId || !content) {
      throw new Error('Missing required fields');
    }

    // Verify user has access to the organization
    if (userId && organizationId) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .single();

      if (profileError || !profile) {
        throw new Error('Unauthorized');
      }
    }

    // Format the prompt based on document type and analysis type
    let systemPrompt = "You are an AI legal assistant. Analyze the following legal document and provide insights.";
    let prompt = "Please analyze this document and provide key insights.";

    switch (analysisType) {
      case 'risk':
        prompt = "Please identify and explain any potential risks, issues, or concerns in this document.";
        break;
      case 'summary':
        prompt = "Please provide a clear and concise summary of this document, highlighting the most important points.";
        break;
      case 'extract':
        prompt = "Please extract and list all important dates, deadlines, parties, and key terms from this document.";
        break;
      case 'compare':
        prompt = "Please analyze this document and identify any unusual or non-standard clauses or terms.";
        break;
    }

    // Configure OpenAI API request
    const openAiRequest = {
      model: "gpt-4-1106-preview",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: `${prompt}\n\nDocument Content:\n${content}`
        }
      ],
      temperature: 0.7,
      stream: stream
    };

    // Make request to OpenAI API
    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAiRequest)
    });

    if (!openAiResponse.ok) {
      const error = await openAiResponse.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    if (stream) {
      // Return streaming response
      return new Response(openAiResponse.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    } else {
      // Return regular JSON response
      const result = await openAiResponse.json();
      
      // Store the analysis result
      await supabase
        .from('document_analyses')
        .insert({
          document_id: documentId,
          analysis_type: analysisType,
          content: result.choices[0].message.content,
          organization_id: organizationId,
          created_by: userId
        });

      return new Response(
        JSON.stringify({
          analysis: result.choices[0].message.content
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }
  } catch (error) {
    console.error('Error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: error.message === 'Unauthorized' ? 403 : 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});