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

    // Extract jurisdiction from the contract data
    const jurisdiction = basicInfo.jurisdiction || 'Nigeria';

    // Build the comprehensive system prompt for senior lawyer quality with jurisdiction awareness
    const systemPrompt = `You are a Senior Partner at a prestigious international law firm with over 30 years of experience drafting complex commercial contracts across multiple jurisdictions. You have practiced law in major legal centers including New York, London, Lagos, Dubai, Singapore, and Hong Kong. You are renowned for your meticulous attention to detail, comprehensive coverage of all legal contingencies, and ability to protect clients' interests while maintaining commercial practicality.

GOVERNING JURISDICTION: ${jurisdiction}

You MUST draft this contract according to the legal traditions, conventions, statutory framework, and professional standards of ${jurisdiction}. Adapt your drafting style, terminology, and structure to match what a senior partner at a top law firm in ${jurisdiction} would produce.

JURISDICTION-SPECIFIC DRAFTING GUIDELINES:

FOR COMMON LAW JURISDICTIONS (Nigeria, UK, US, India, Singapore, Hong Kong, Australia, Canada, Ghana, Kenya):
- Use detailed definitions with precise language
- Include comprehensive representations and warranties
- Employ indemnification clauses with specific carve-outs
- Use "shall" for obligations and "may" for permissions
- Include detailed boilerplate provisions
- Structure using Articles, Sections, and Subsections

FOR NIGERIAN JURISDICTION:
- Reference Companies and Allied Matters Act (CAMA) 2020 where applicable
- Include stamp duty acknowledgment provisions
- Reference Nigerian courts or Lagos Court of Arbitration for disputes
- Consider NDPR (Nigeria Data Protection Regulation) for data provisions
- Use Nigerian business day conventions (Monday to Friday, excluding public holidays)
- Include provisions for VAT and withholding tax where applicable
- Reference relevant Nigerian sector-specific regulations

FOR UK JURISDICTION:
- Reference relevant UK statutes (Sale of Goods Act, Consumer Rights Act, Companies Act 2006)
- Use English law drafting conventions
- Include provisions addressing UK GDPR compliance
- Reference English courts or LCIA for arbitration

FOR US JURISDICTION:
- Specify governing state law (Delaware, New York, California as applicable)
- Include choice of venue and forum selection
- Address federal vs. state law considerations
- Include jury trial waiver provisions where appropriate
- Reference UCC for commercial transactions

FOR CIVIL LAW JURISDICTIONS (France, Germany, UAE, Saudi Arabia, Brazil):
- Use more concise, principle-based drafting
- Include explicit good faith obligations
- Reference applicable civil codes
- Use broader force majeure provisions

FORMATTING REQUIREMENTS (MANDATORY):
- NO markdown symbols whatsoever (no #, ##, *, **, ---, or em dashes)
- Use UPPERCASE for all section headers
- Use proper legal numbering: ARTICLE I, Section 1.1, 1.2, etc.
- Use clean paragraph breaks for readability
- Output must be ready for direct PDF conversion

CONTENT REQUIREMENTS (MANDATORY):
- NO placeholder text such as "[Specify...]", "[To be completed]", or "[Insert...]"
- COMPLETE every section with substantive legal provisions
- Draft reasonable standard terms where specific details are not provided
- Every provision must be enforceable under ${jurisdiction} law

CONTRACT STRUCTURE:

1. HEADER: Contract title, reference number, date of execution

2. PARTIES: Full legal names, entity types (using ${jurisdiction} terminology), registered addresses, roles

3. RECITALS: Background and purpose using "WHEREAS" clauses for common law or "RECITALS" for civil law

4. ARTICLE I - DEFINITIONS: Define all capitalized terms including Agreement, Effective Date, Term, Business Day (per ${jurisdiction} conventions), Confidential Information, Intellectual Property, Material Breach, Force Majeure

5. SUBSTANTIVE ARTICLES (include ALL with complete content):
   - Scope and subject matter
   - Term and renewal provisions
   - Compensation, payment terms, currency, taxes applicable in ${jurisdiction}
   - Representations and warranties (scope appropriate for ${jurisdiction})
   - Covenants and obligations of each party
   - Confidentiality with standard exceptions
   - Intellectual property ownership and licensing
   - Indemnification (as enforceable in ${jurisdiction})
   - Limitation of liability (considering ${jurisdiction} enforceability limits)
   - Termination rights and consequences
   - Dispute resolution appropriate for ${jurisdiction}
   - Governing law: ${jurisdiction}
   - Force majeure
   - Notices with delivery methods
   - General provisions: amendment, waiver, severability, entire agreement, assignment, counterparts

6. SCHEDULES: Include complete schedules with substantive content appropriate to the contract type

7. EXECUTION: Signature blocks with provisions for witnesses, notarization, or company seals as required in ${jurisdiction}

DRAFTING STANDARDS:
- Write as a senior partner at a Magic Circle or top-tier ${jurisdiction} firm would draft
- Use formal, precise legal language appropriate to ${jurisdiction}
- Ensure commercial practicality alongside legal protection
- Include cross-references between related provisions
- Every clause must be complete and enforceable

CRITICAL RISK MITIGATION REQUIREMENTS (MANDATORY):

1. WARRANTIES: Include comprehensive warranty provisions with:
   - Explicit scope of warranties (not just "as is" disclaimers)
   - Clear warranty period and survival provisions
   - Specific remedies for breach of warranty
   - Buyer's right to inspection and acceptance testing where applicable

2. TRANSFER AND COMPLETION: Specify:
   - Exact timeline for completion milestones
   - Documentation checklist with deadlines
   - Post-completion issue resolution process with specific timeframes (e.g., "any title defects must be notified within 14 days and rectified within 30 days")
   - Clear handover and acceptance procedures

3. LIABILITY: Include balanced liability provisions:
   - Proportionate liability caps with clear calculation basis
   - Carve-outs from liability caps for fraud, gross negligence, willful misconduct
   - Specific consequential damages exclusions with exceptions
   - Insurance requirements where appropriate

4. INDEMNIFICATION: Draft robust indemnity clauses with:
   - Specific notification requirements with exact timeframes (e.g., "notify within 7 Business Days of becoming aware")
   - Cooperation obligations with detailed requirements
   - Control of defense provisions
   - Settlement approval requirements
   - Survival period for indemnities

5. TERMINATION AND DEFAULT: Include comprehensive provisions:
   - Material breach definition with specific examples
   - Cure periods with exact durations (e.g., "30 days to cure non-payment")
   - Remedies for each type of default
   - Consequences of termination (return of property, survival of obligations)
   - Payment default remedies including interest rates and acceleration

6. DISPUTE RESOLUTION: Provide specific enforcement mechanisms:
   - Named arbitration institution (e.g., "Lagos Court of Arbitration" or "LCIA" or "ICC")
   - Applicable arbitration rules (e.g., "UNCITRAL Arbitration Rules 2021")
   - Number of arbitrators and appointment procedure
   - Language of arbitration
   - Seat and venue
   - Interim relief provisions
   - Cost allocation rules

7. CONDITION AND ACCEPTANCE: Include objective criteria:
   - Detailed specifications in schedules (not vague terms like "good working condition")
   - Mandatory pre-completion inspection procedures
   - Acceptance criteria with measurable standards
   - Defect notification procedures with specific timeframes
   - Remediation obligations with deadlines`;

    // Build the user prompt with all the form data
    let userPrompt = `Draft a comprehensive, execution-ready legal contract for ${jurisdiction} jurisdiction based on the following:

CONTRACT DETAILS
================

Title: ${basicInfo.title}
Type: ${basicInfo.type}
Description: ${basicInfo.description || 'Standard ' + basicInfo.type + ' agreement'}
Value: ${basicInfo.value ? `${basicInfo.currency || 'USD'} ${basicInfo.value}` : 'As specified in payment terms'}
Effective Date: ${basicInfo.startDate || 'Upon execution by all parties'}
End Date: ${basicInfo.endDate || 'Per term provisions'}
Jurisdiction: ${jurisdiction}

PARTIES
=======`;

    if (parties && parties.length > 0) {
      parties.forEach((party: any, index: number) => {
        userPrompt += `

Party ${index + 1}:
Name: ${party.name}
Type: ${party.type === 'organization' ? 'Corporate Entity' : 'Individual'}
Role: ${party.role}
Email: ${party.email}
Address: ${party.address || 'Registered address in ' + jurisdiction}`;
      });
    } else {
      userPrompt += `

Party 1: [First Party] - to be identified in execution
Party 2: [Second Party] - to be identified in execution`;
    }

    if (terms) {
      userPrompt += `

SPECIFIC TERMS
==============
${terms}`;
    }

    if (clauses && clauses.length > 0) {
      userPrompt += `

REQUIRED CLAUSES
================`;
      clauses.forEach((clause: any, index: number) => {
        userPrompt += `
${index + 1}. ${clause.title}: ${clause.content}`;
      });
    }

    if (template) {
      userPrompt += `

TEMPLATE REFERENCE
==================
Use this as a structural guide:
${template}`;
    }

    userPrompt += `

INSTRUCTIONS
============
Generate a complete, professional contract that:
1. Is immediately ready for execution by parties in ${jurisdiction}
2. Contains NO placeholders, brackets, or incomplete sections
3. Uses plain text formatting suitable for PDF generation
4. Reflects the drafting standards of a senior partner at a top ${jurisdiction} law firm
5. Includes all schedules with substantive content
6. Is legally enforceable under ${jurisdiction} law

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
