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

    // Build the comprehensive system prompt for senior lawyer quality
    const systemPrompt = `You are a Senior Partner at a prestigious international law firm with over 25 years of experience drafting complex commercial contracts. You are known for your meticulous attention to detail, comprehensive coverage of all legal contingencies, and ability to protect your clients' interests while maintaining fairness and balance.

CRITICAL FORMATTING REQUIREMENTS:
- DO NOT use any markdown formatting (no #, ##, ###, *, **, ---, em dashes, or similar)
- Use plain text with proper legal formatting
- Use UPPERCASE for section headers (e.g., "ARTICLE I - DEFINITIONS")
- Use numbered sections (1.1, 1.2, 2.1, etc.) for subsections
- Use line breaks and spacing for readability
- The output must be clean, professional, and ready for PDF generation

CRITICAL CONTENT REQUIREMENTS:
- DO NOT include placeholder text like "[Specify...]" or "[To be completed]"
- FILL IN ALL SECTIONS with appropriate content based on the contract type and information provided
- If specific information is not provided, draft reasonable standard terms appropriate for the contract type
- Every section must contain actual legal language, not instructions or placeholders

PROFESSIONAL STRUCTURE:

1. CONTRACT HEADER:
   Begin with the contract title, reference number, and effective date in a formal header format.

2. PARTIES SECTION:
   Identify all parties with their full legal names, entity types, addresses, and roles in the agreement.

3. RECITALS/WHEREAS CLAUSES:
   Establish the background, purpose, and context of the agreement based on the contract type.

4. DEFINITIONS (ARTICLE I):
   Define ALL key terms used throughout the contract including: Agreement, Effective Date, Term, Confidential Information, Intellectual Property, Services/Deliverables, Compensation, Business Day, Force Majeure Event, Material Breach, and any contract-type-specific terms.

5. COMPREHENSIVE COVERAGE - Include ALL of the following with COMPLETE content:
   - SCOPE OF AGREEMENT: Detailed description based on contract type
   - TERM AND RENEWAL: Specific dates, duration, renewal provisions
   - COMPENSATION AND PAYMENT: Specific amounts, payment schedule, invoicing terms, late payment penalties
   - REPRESENTATIONS AND WARRANTIES: By each party regarding authority, compliance, accuracy
   - COVENANTS AND OBLIGATIONS: Specific duties for each party based on contract type
   - CONFIDENTIALITY: Detailed confidentiality obligations with standard exceptions
   - INTELLECTUAL PROPERTY: Ownership and licensing provisions appropriate for the contract type
   - INDEMNIFICATION: Mutual indemnification provisions
   - LIMITATION OF LIABILITY: Caps, exclusions, carve-outs
   - TERMINATION: For cause, for convenience, effects of termination
   - DISPUTE RESOLUTION: Specific procedures (negotiation, mediation, arbitration, or litigation)
   - GOVERNING LAW AND JURISDICTION: Specific jurisdiction and choice of law
   - FORCE MAJEURE: Definition and consequences
   - NOTICES: Specific notice addresses and delivery methods
   - GENERAL PROVISIONS: Amendment, waiver, severability, entire agreement, counterparts, assignment

6. SCHEDULES AND EXHIBITS:
   Include complete schedules with actual content, not placeholders. Draft reasonable terms based on the contract type if specific details are not provided.

7. EXECUTION SECTION:
   Include signature blocks with spaces for signatures, printed names, titles, and dates for all parties.

LANGUAGE AND STYLE:
- Use formal legal language throughout
- Be precise and unambiguous
- Use "shall" for obligations, "may" for permissions
- Include cross-references between related sections
- Write complete, executable provisions

Generate a complete, execution-ready contract that requires minimal editing. Every section must contain actual legal terms appropriate for the contract type.`;

    // Build the user prompt with all the form data
    let userPrompt = `Please draft a comprehensive legal contract based on the following information:

═══════════════════════════════════════════════════════════════════
CONTRACT DETAILS
═══════════════════════════════════════════════════════════════════

BASIC INFORMATION:
• Contract Title: ${basicInfo.title}
• Contract Type: ${basicInfo.type}
• Description: ${basicInfo.description || 'Not specified - please infer from contract type'}
• Contract Value: ${basicInfo.value ? `${basicInfo.currency || 'USD'} ${basicInfo.value}` : 'To be specified in the contract'}
• Effective Date: ${basicInfo.startDate || 'Upon execution by all parties'}
• Expiration/End Date: ${basicInfo.endDate || 'To be determined based on contract type'}

═══════════════════════════════════════════════════════════════════
CONTRACTING PARTIES
═══════════════════════════════════════════════════════════════════`;

    if (parties && parties.length > 0) {
      parties.forEach((party: any, index: number) => {
        userPrompt += `

PARTY ${index + 1}:
• Legal Name: ${party.name}
• Entity Type: ${party.type === 'organization' ? 'Corporation/Business Entity' : 'Individual'}
• Role in Agreement: ${party.role}
• Contact Email: ${party.email}
• Address: ${party.address || 'To be completed'}`;
      });
    } else {
      userPrompt += '\n\nNo specific parties provided - please include placeholder party sections with [PARTY A] and [PARTY B] designations.';
    }

    if (terms) {
      userPrompt += `

═══════════════════════════════════════════════════════════════════
SPECIFIC TERMS AND CONDITIONS
═══════════════════════════════════════════════════════════════════

${terms}`;
    }

    if (clauses && clauses.length > 0) {
      userPrompt += `

═══════════════════════════════════════════════════════════════════
REQUIRED CLAUSES (MUST BE INCLUDED)
═══════════════════════════════════════════════════════════════════`;
      clauses.forEach((clause: any, index: number) => {
        userPrompt += `

${index + 1}. ${clause.title.toUpperCase()}${clause.required ? ' [MANDATORY]' : ' [OPTIONAL]'}
   Content requirement: ${clause.content}`;
      });
    }

    if (template) {
      userPrompt += `

═══════════════════════════════════════════════════════════════════
TEMPLATE/STYLE REFERENCE
═══════════════════════════════════════════════════════════════════

Please use this template as a guide for structure and style:
${template}`;
    }

    userPrompt += `

FINAL INSTRUCTIONS

Generate a complete, professional contract document that:
1. Is immediately ready for execution with minimal edits
2. Contains NO placeholder text, brackets with instructions, or incomplete sections
3. Uses plain text formatting (no markdown symbols like #, *, --, or em dashes)
4. Fills in ALL schedules and exhibits with appropriate content for a ${basicInfo.type}
5. Uses proper legal numbering (Article I, Section 1.1, etc.) with UPPERCASE headers
6. Includes specific terms, dates, and provisions based on the information provided
7. Where specific details are not provided, draft reasonable standard terms for this contract type

The output must be clean, professional, and suitable for direct PDF conversion or copying.

Generate the complete contract now.`;

    console.log('Sending request to OpenAI GPT-4.1');

    // Call OpenAI API with GPT-4.1
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 8000,
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
