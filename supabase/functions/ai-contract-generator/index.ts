declare const Deno: any;

// @ts-ignore Deno runtime
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    console.log('Contract generation request received');

    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not found');
      throw new Error('OpenAI API key not configured');
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

    if (!authHeader) {
      console.warn('Missing Authorization header');
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();

    if (!accessToken) {
      console.warn('Authorization header present but token missing');
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      console.warn('Failed to resolve user from token', authError);
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Failed to load user profile', profileError);
      throw new Error('Failed to load user profile');
    }

    if (!profile?.organization_id) {
      console.warn('User profile missing organization');
      return createJsonResponse(
        { error: 'User must belong to an organization to create contracts' },
        { status: 403, cors: corsOptions },
      );
    }

    const userId = user.id;
    const organizationId = profile.organization_id;

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
    let userPrompt = `Contract Request Data:

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

    console.log('Sending request to OpenAI GPT-5');

    // Call OpenAI API with GPT-5
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('Received response from OpenAI');

    const generatedContract = data.choices[0].message.content;

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

    return createJsonResponse(
      {
        success: true,
        contract: savedContract,
        generatedText: generatedContract,
      },
      { cors: corsOptions },
    );
  } catch (error: unknown) {
    console.error('Error in ai-contract-generator:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return createJsonResponse({ error: errorMessage }, { status: 500, cors: corsOptions });
  }
});
