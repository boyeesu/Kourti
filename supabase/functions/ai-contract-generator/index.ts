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

CRITICAL REQUIREMENTS FOR CONTRACT GENERATION:

1. PROFESSIONAL STRUCTURE:
   - Begin with a formal title page including contract name, date, and reference number
   - Include a comprehensive Table of Contents with article and section numbers
   - Use proper legal numbering (Article I, Section 1.1, Subsection 1.1.1)
   - Include formal recitals/whereas clauses establishing context and intent
   - End with proper execution blocks with signature lines, dates, and witness provisions

2. DEFINITIONS SECTION (Article I):
   - Define ALL key terms used throughout the contract
   - Include definitions for: Agreement, Effective Date, Term, Confidential Information, Intellectual Property, Services/Deliverables, Compensation, Business Day, Force Majeure Event, Material Breach, etc.
   - Use clear, precise legal language

3. COMPREHENSIVE COVERAGE - Include ALL of the following sections:
   - RECITALS: Background, purpose, and context of the agreement
   - DEFINITIONS: All defined terms
   - SCOPE OF AGREEMENT: Detailed description of services, deliverables, or subject matter
   - TERM AND RENEWAL: Start date, duration, renewal provisions, anniversary dates
   - COMPENSATION AND PAYMENT: Fees, payment schedule, invoicing, late payment penalties, currency
   - REPRESENTATIONS AND WARRANTIES: By each party regarding authority, compliance, accuracy
   - COVENANTS AND OBLIGATIONS: Specific duties and responsibilities of each party
   - CONFIDENTIALITY: Detailed confidentiality obligations with exceptions
   - INTELLECTUAL PROPERTY: Ownership, licensing, work product provisions
   - INDEMNIFICATION: Mutual indemnification provisions
   - LIMITATION OF LIABILITY: Caps, exclusions, carve-outs
   - TERMINATION: For cause, for convenience, effects of termination
   - DISPUTE RESOLUTION: Negotiation, mediation, arbitration, or litigation procedures
   - GOVERNING LAW AND JURISDICTION: Choice of law and venue
   - FORCE MAJEURE: Definition and consequences
   - NOTICES: How formal notices must be delivered
   - GENERAL PROVISIONS: Amendment, waiver, severability, entire agreement, counterparts, assignment

4. LANGUAGE AND STYLE:
   - Use formal legal language throughout
   - Be precise and unambiguous
   - Include specific dates, amounts, and deadlines where provided
   - Use "shall" for obligations, "may" for permissions
   - Include cross-references between related sections
   - Add explanatory provisions where complex concepts require clarification

5. PROTECTIVE PROVISIONS:
   - Include appropriate disclaimers
   - Add survival clauses for provisions that should survive termination
   - Include insurance requirements if applicable
   - Add compliance with laws provisions
   - Include audit rights where appropriate

6. EXECUTION SECTION:
   - Include signature blocks for all parties
   - Add date lines, title lines, and address lines
   - Include witness signature lines if appropriate
   - Add notarization provisions if required

Generate a complete, execution-ready contract that a senior partner would be proud to present to a client. The contract should be comprehensive enough to address foreseeable disputes and protect all parties' interests.`;

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

═══════════════════════════════════════════════════════════════════
FINAL INSTRUCTIONS
═══════════════════════════════════════════════════════════════════

Generate a complete, professional contract document that:
1. Is immediately ready for execution
2. Includes all standard protective provisions
3. Uses proper legal formatting and numbering
4. Addresses all contingencies appropriate for a ${basicInfo.type}
5. Reflects the highest standards of legal draftsmanship

Please generate the complete contract now.`;

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
