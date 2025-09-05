// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Contract generation request received');

    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not found');
      throw new Error('Anthropic API key not configured');
    }

    const { 
      basicInfo, 
      parties, 
      terms, 
      clauses, 
      template 
    } = await req.json();

    console.log('Request data:', { basicInfo, parties, terms, clauses, templateProvided: !!template });

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    let organizationId = null;

    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      
      if (!authError && user) {
        userId = user.id;
        
        // Get user's organization
        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', userId)
          .single();
          
        organizationId = profile?.organization_id;
      }
    }

    // Build the system prompt
    const systemPrompt = `You are an expert contract lawyer and legal document generator. Your task is to create comprehensive, legally sound contracts based on the provided information.

Key Requirements:
- Generate complete, professional contract text
- Use proper legal language and structure
- Include all standard contract sections (preamble, definitions, terms, clauses, signatures)
- Ensure the contract is tailored to the specific type and parties involved
- Fill in placeholder information with the provided details
- Make the contract legally comprehensive and enforceable

Contract Structure should include:
1. Title and Preamble
2. Parties identification
3. Recitals/Background
4. Definitions (if needed)
5. Main terms and obligations
6. Additional clauses and conditions
7. Termination provisions
8. Governing law and dispute resolution
9. General provisions
10. Signature blocks

Always generate a complete, ready-to-use contract document.`;

    // Build the user prompt with all the form data
    let userPrompt = `Generate a comprehensive contract with the following specifications:

BASIC INFORMATION:
- Title: ${basicInfo.title}
- Type: ${basicInfo.type}
- Description: ${basicInfo.description || 'Not specified'}
- Value: ${basicInfo.value ? `${basicInfo.currency || 'USD'} ${basicInfo.value}` : 'Not specified'}
- Start Date: ${basicInfo.startDate || 'To be determined'}
- End Date: ${basicInfo.endDate || 'To be determined'}

PARTIES:`;

    if (parties && parties.length > 0) {
      parties.forEach((party: any, index: number) => {
        userPrompt += `
${index + 1}. ${party.name} (${party.type})
   - Role: ${party.role}
   - Email: ${party.email}
   - Address: ${party.address || 'Not provided'}`;
      });
    } else {
      userPrompt += '\nNo specific parties provided - please include placeholder party sections.';
    }

    if (terms) {
      userPrompt += `

SPECIFIC TERMS:
${terms}`;
    }

    if (clauses && clauses.length > 0) {
      userPrompt += `

REQUIRED CLAUSES:`;
      clauses.forEach((clause: any) => {
        userPrompt += `
- ${clause.title}: ${clause.content}${clause.required ? ' (REQUIRED)' : ''}`;
      });
    }

    if (template) {
      userPrompt += `

TEMPLATE TO FOLLOW:
Please use this template as a guide for structure and style:
${template}`;
    }

    userPrompt += `

Please generate a complete, professional contract document that incorporates all the above information. The contract should be comprehensive, legally sound, and ready for review and execution.`;

    console.log('Sending request to Anthropic Claude');

    // Call Anthropic Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: `${systemPrompt}\n\n${userPrompt}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Received response from Anthropic');

    const generatedContract = data.content[0].text;

    // Create the contract in the database
    const contractData = {
      title: basicInfo.title,
      description: basicInfo.description,
      contract_type: basicInfo.type,
      status: 'draft',
      value: basicInfo.value ? parseFloat(basicInfo.value) : null,
      currency: basicInfo.currency || 'USD',
      start_date: basicInfo.startDate || null,
      end_date: basicInfo.endDate || null,
      terms: generatedContract,
      organization_id: organizationId,
      created_by: userId,
    };

    console.log('Saving contract to database');

    const { data: savedContract, error: saveError } = await supabase
      .from('contracts')
      .insert(contractData)
      .select()
      .single();

    if (saveError) {
      console.error('Database save error:', saveError);
      throw new Error(`Failed to save contract: ${saveError.message}`);
    }

    console.log('Contract saved successfully:', savedContract.id);

    return new Response(
      JSON.stringify({
        success: true,
        contract: savedContract,
        generatedText: generatedContract,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    console.error('Error in ai-contract-generator:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});