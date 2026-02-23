declare const Deno: any;

// @ts-ignore Deno runtime
import "https://deno.land/x/xhr@0.1.0/mod.ts";
// @ts-ignore Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore Deno runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";
import { createTrace, traceOpenAIChatCompletion } from "../_shared/langfuse.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";

// Allowed origins for CORS validation
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:8082",
    "http://localhost:8083",
  ] : []),
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

// Input size limits to prevent context overflow and cost abuse
const INPUT_LIMITS = {
  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_TERMS_LENGTH: 50000,
  MAX_TEMPLATE_LENGTH: 100000,
  MAX_CLAUSE_CONTENT_LENGTH: 10000,
  MAX_CLAUSES_COUNT: 50,
  MAX_PARTIES_COUNT: 20,
  MAX_PARTY_ADDRESS_LENGTH: 1000,
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Model configuration with fallback support
const DEFAULT_CHAT_MODEL = 'gpt-5.1';
const FALLBACK_CHAT_MODEL = 'gpt-5.1';

function getChatModelCandidates(): string[] {
  const configuredModel = Deno.env.get('OPENAI_CONTRACT_MODEL')?.trim();
  const configuredFallback = Deno.env.get('OPENAI_CONTRACT_FALLBACK_MODEL')?.trim();

  const models = [
    configuredModel || DEFAULT_CHAT_MODEL,
    configuredFallback || FALLBACK_CHAT_MODEL,
    DEFAULT_CHAT_MODEL,
    FALLBACK_CHAT_MODEL,
  ];

  // Return unique models in order of preference
  return Array.from(new Set(models.filter(Boolean)));
}

async function requestChatCompletion(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number
): Promise<{ data: any; modelUsed: string }> {
  if (!openAIApiKey) {
    throw new HttpError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
  }

  const modelCandidates = getChatModelCandidates();
  let lastError: Error | null = null;

  for (const model of modelCandidates) {
    try {
      console.log(`Attempting OpenAI request with model: ${model}`);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAIApiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`Successfully received response from model: ${model}`);
        return { data, modelUsed: model };
      }

      const errorText = await response.text();
      console.error(`OpenAI API error for model ${model}:`, response.status, errorText);

      // Model-specific errors that warrant trying the next model
      if ([400, 404, 422].includes(response.status)) {
        lastError = new HttpError(
          `Model ${model} unavailable: ${errorText}`,
          424,
          'OPENAI_MODEL_UNAVAILABLE',
          { status: response.status }
        );
        continue;
      }

      // Other errors should be thrown immediately
      throw new HttpError(
        `OpenAI API error: ${response.status}`,
        502,
        'OPENAI_UPSTREAM_ERROR',
        { status: response.status }
      );
    } catch (error) {
      if (error instanceof HttpError) {
        lastError = error;
        // If it's a model unavailability error, continue to next model
        if (error.code === 'OPENAI_MODEL_UNAVAILABLE') {
          continue;
        }
        throw error;
      }
      lastError = new HttpError(String(error), 502, 'OPENAI_UPSTREAM_ERROR');
      console.error(`OpenAI request failed for model ${model}:`, error);
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new HttpError('Unable to reach OpenAI API', 502, 'OPENAI_UPSTREAM_ERROR');
}

serve(async (req: Request) => {
  // Get request origin and build CORS options
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    console.log('Contract generation request received');

    // Check rate limit early (before auth to prevent enumeration attacks)
    const rateLimitIdentifier = getRateLimitIdentifier(req);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AI,
      identifier: `contract-gen:${rateLimitIdentifier}`,
    });

    if (!rateLimitResult.allowed) {
      console.warn('Rate limit exceeded for:', rateLimitIdentifier);
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    if (!openAIApiKey) {
      console.error('OPENAI_API_KEY not found');
      throw new HttpError('OpenAI API key not configured', 503, 'OPENAI_CONFIG_MISSING');
    }

    // Parse JSON with proper error handling
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { basicInfo, parties, terms, clauses, template } = payload;

    // Validate required fields
    if (!basicInfo) {
      throw new HttpError('basicInfo is required', 400, 'INVALID_INPUT');
    }

    if (!basicInfo.title || typeof basicInfo.title !== 'string') {
      throw new HttpError('basicInfo.title is required and must be a string', 400, 'INVALID_INPUT');
    }

    if (!basicInfo.type || typeof basicInfo.type !== 'string') {
      throw new HttpError('basicInfo.type is required and must be a string', 400, 'INVALID_INPUT');
    }

    // Validate input sizes to prevent context overflow and cost abuse
    if (basicInfo.title.length > INPUT_LIMITS.MAX_TITLE_LENGTH) {
      throw new HttpError(
        `Title exceeds maximum length of ${INPUT_LIMITS.MAX_TITLE_LENGTH} characters`,
        400,
        'INPUT_TOO_LARGE'
      );
    }

    if (basicInfo.description && basicInfo.description.length > INPUT_LIMITS.MAX_DESCRIPTION_LENGTH) {
      throw new HttpError(
        `Description exceeds maximum length of ${INPUT_LIMITS.MAX_DESCRIPTION_LENGTH} characters`,
        400,
        'INPUT_TOO_LARGE'
      );
    }

    if (terms && terms.length > INPUT_LIMITS.MAX_TERMS_LENGTH) {
      throw new HttpError(
        `Terms exceeds maximum length of ${INPUT_LIMITS.MAX_TERMS_LENGTH} characters`,
        400,
        'INPUT_TOO_LARGE'
      );
    }

    if (template && template.length > INPUT_LIMITS.MAX_TEMPLATE_LENGTH) {
      throw new HttpError(
        `Template exceeds maximum length of ${INPUT_LIMITS.MAX_TEMPLATE_LENGTH} characters`,
        400,
        'INPUT_TOO_LARGE'
      );
    }

    if (parties && Array.isArray(parties)) {
      if (parties.length > INPUT_LIMITS.MAX_PARTIES_COUNT) {
        throw new HttpError(
          `Number of parties exceeds maximum of ${INPUT_LIMITS.MAX_PARTIES_COUNT}`,
          400,
          'INPUT_TOO_LARGE'
        );
      }

      for (let i = 0; i < parties.length; i++) {
        const party = parties[i];
        if (party.address && party.address.length > INPUT_LIMITS.MAX_PARTY_ADDRESS_LENGTH) {
          throw new HttpError(
            `Party ${i + 1} address exceeds maximum length of ${INPUT_LIMITS.MAX_PARTY_ADDRESS_LENGTH} characters`,
            400,
            'INPUT_TOO_LARGE'
          );
        }
      }
    }

    if (clauses && Array.isArray(clauses)) {
      if (clauses.length > INPUT_LIMITS.MAX_CLAUSES_COUNT) {
        throw new HttpError(
          `Number of clauses exceeds maximum of ${INPUT_LIMITS.MAX_CLAUSES_COUNT}`,
          400,
          'INPUT_TOO_LARGE'
        );
      }

      for (let i = 0; i < clauses.length; i++) {
        const clause = clauses[i];
        if (clause.content && clause.content.length > INPUT_LIMITS.MAX_CLAUSE_CONTENT_LENGTH) {
          throw new HttpError(
            `Clause ${i + 1} content exceeds maximum length of ${INPUT_LIMITS.MAX_CLAUSE_CONTENT_LENGTH} characters`,
            400,
            'INPUT_TOO_LARGE'
          );
        }
      }
    }

    console.log('Request data:', {
      basicInfo: { ...basicInfo, description: basicInfo.description?.substring(0, 100) },
      partiesCount: parties?.length || 0,
      termsLength: terms?.length || 0,
      clausesCount: clauses?.length || 0,
      templateProvided: !!template
    });

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');

    if (!authHeader) {
      console.warn('Missing Authorization header');
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const accessToken = authHeader.replace('Bearer ', '').trim();

    if (!accessToken) {
      console.warn('Authorization header present but token missing');
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      console.warn('Failed to resolve user from token', authError);
      throw new HttpError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    // Now that we have the user, apply user-specific rate limiting
    const userRateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AI,
      identifier: `contract-gen:user:${user.id}`,
    });

    if (!userRateLimitResult.allowed) {
      console.warn('User rate limit exceeded for:', user.id);
      const rateLimitHeaders = createRateLimitHeaders(userRateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      console.error('Failed to load user profile', profileError);
      throw new HttpError('Failed to load user profile', 500, 'PROFILE_LOAD_ERROR');
    }

    if (!profile?.organization_id) {
      console.warn('User profile missing organization');
      throw new HttpError(
        'User must belong to an organization to create contracts',
        403,
        'ORGANIZATION_REQUIRED'
      );
    }

    const userId = user.id;
    const organizationId = profile.organization_id;

    // Extract jurisdiction from the contract data
    const jurisdiction = basicInfo.jurisdiction || 'Nigeria';

    // --- RAG: Retrieve relevant context from organization's existing documents ---
    let ragContext = '';
    let bestPracticesContext = '';

    try {
      // Build a search query from contract metadata for embedding
      const searchQuery = [
        basicInfo.type,
        'contract',
        basicInfo.description || '',
        jurisdiction,
        terms ? terms.substring(0, 500) : '',
        clauses?.map((c: any) => c.title).join(' ') || '',
      ].filter(Boolean).join(' ').substring(0, 2000);

      console.log('RAG: Generating query embedding for context retrieval');

      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: searchQuery,
          encoding_format: 'float',
        }),
      });

      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // Retrieve relevant document chunks and best practices in parallel
        const [chunksResult, bestPracticesResult] = await Promise.all([
          supabase.rpc('match_document_chunks_for_org', {
            query_embedding: queryEmbedding,
            org_id: organizationId,
            match_threshold: 0.65,
            match_count: 8,
          }),
          supabase.rpc('match_best_practices', {
            query: queryEmbedding,
          }),
        ]);

        // Build RAG context from document chunks
        if (chunksResult.data && chunksResult.data.length > 0) {
          const chunks = chunksResult.data
            .sort((a: any, b: any) => b.similarity - a.similarity)
            .slice(0, 8);

          ragContext = chunks
            .map((chunk: any, i: number) =>
              `[Reference ${i + 1} (relevance: ${(chunk.similarity * 100).toFixed(0)}%)]\n${chunk.content}`
            )
            .join('\n\n');

          console.log(`RAG: Retrieved ${chunks.length} relevant document chunks`);
        }

        // Build best practices context
        if (bestPracticesResult.data && bestPracticesResult.data.length > 0) {
          bestPracticesContext = bestPracticesResult.data
            .map((bp: any, i: number) => `[Best Practice ${i + 1}]\n${bp.clause}`)
            .join('\n\n');

          console.log(`RAG: Retrieved ${bestPracticesResult.data.length} best practice clauses`);
        }
      } else {
        console.warn('RAG: Embedding generation failed, proceeding without context');
      }
    } catch (ragError) {
      // Non-fatal: contract generation proceeds without RAG context
      console.warn('RAG: Context retrieval failed, proceeding without context:', ragError);
    }

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

    // Inject RAG context if available
    if (ragContext) {
      userPrompt += `

ORGANIZATIONAL REFERENCE MATERIAL
==================================
The following excerpts are from this organization's existing contracts and documents.
Use them to match the organization's preferred style, terminology, and clause structures:

${ragContext}`;
    }

    if (bestPracticesContext) {
      userPrompt += `

BEST PRACTICE CLAUSES
=====================
The following are industry best-practice clauses for reference.
Use them to improve the quality and completeness of the generated contract:

${bestPracticesContext}`;
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
6. Is legally enforceable under ${jurisdiction} law${ragContext ? '\n7. Incorporates the organization\'s preferred language and clause style from the reference material above' : ''}

Generate the complete contract now.`;

    // Create Langfuse trace for this request
    const traceId = await createTrace({
      name: 'ai-contract-generator',
      userId,
      metadata: {
        organizationId,
        contractType: basicInfo.type,
        jurisdiction: basicInfo.jurisdiction || 'Nigeria',
        hasTemplate: !!template,
        partiesCount: parties?.length || 0,
        hasTerms: !!terms,
        clausesCount: clauses?.length || 0,
        ragChunksUsed: ragContext ? ragContext.split('[Reference').length - 1 : 0,
        bestPracticesUsed: bestPracticesContext ? bestPracticesContext.split('[Best Practice').length - 1 : 0,
      },
      tags: ['contract-generation', 'legal-ai', ...(ragContext ? ['rag-enhanced'] : [])],
    });

    console.log('Sending request to OpenAI with model fallback support');

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    // Call OpenAI API with fallback support
    const { data, modelUsed } = await requestChatCompletion(messages, 8000);

    console.log(`Received response from OpenAI using model: ${modelUsed}`);

    // Validate OpenAI response structure
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      console.error('Invalid OpenAI response structure:', JSON.stringify(data).substring(0, 500));
      throw new HttpError(
        'Received invalid response from AI service',
        502,
        'OPENAI_INVALID_RESPONSE'
      );
    }

    const choice = data.choices[0];
    if (!choice.message || typeof choice.message.content !== 'string') {
      console.error('Invalid OpenAI message structure:', JSON.stringify(choice).substring(0, 500));
      throw new HttpError(
        'Received invalid message from AI service',
        502,
        'OPENAI_INVALID_RESPONSE'
      );
    }

    const generatedContract = choice.message.content;

    // Validate the generated content is not empty
    if (!generatedContract || generatedContract.trim().length < 100) {
      console.error('Generated contract is too short or empty:', generatedContract?.length || 0);
      throw new HttpError(
        'AI service returned an incomplete contract. Please try again.',
        502,
        'OPENAI_INCOMPLETE_RESPONSE'
      );
    }

    // Trace the OpenAI chat completion
    await traceOpenAIChatCompletion(traceId, {
      model: modelUsed,
      messages,
      response: data,
      userId,
      metadata: {
        organizationId,
        contractType: basicInfo.type,
        jurisdiction: basicInfo.jurisdiction || 'Nigeria',
        maxTokens: 8000,
        responseLength: generatedContract.length,
      },
    });

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
      throw new HttpError(
        `Failed to save contract: ${saveError.message}`,
        500,
        'DATABASE_SAVE_ERROR'
      );
    }

    console.log('Contract saved successfully:', savedContract.id);

    // --- Post-save: Chunk and embed the generated contract for future RAG retrieval ---
    try {
      console.log('Embedding: Chunking generated contract for future retrieval');

      // Simple sentence-aware chunking
      const chunkMaxTokens = 800;
      const sentences = generatedContract.match(/[^.!?]+[.!?]+/g) || [generatedContract];
      const textChunks: Array<{ content: string; tokenCount: number }> = [];
      let currentChunk = '';

      for (const sentence of sentences) {
        const tentative = currentChunk + (currentChunk ? ' ' : '') + sentence.trim();
        const tentativeTokens = Math.ceil(tentative.length / 4);

        if (tentativeTokens > chunkMaxTokens && currentChunk) {
          textChunks.push({ content: currentChunk.trim(), tokenCount: Math.ceil(currentChunk.length / 4) });
          currentChunk = sentence.trim();
        } else {
          currentChunk = tentative;
        }
      }
      if (currentChunk.trim()) {
        textChunks.push({ content: currentChunk.trim(), tokenCount: Math.ceil(currentChunk.length / 4) });
      }

      const validChunks = textChunks.filter(c => c.content.length > 20);

      if (validChunks.length > 0) {
        // Generate embeddings for all chunks in one batch
        const chunkEmbeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: validChunks.map(c => c.content),
            encoding_format: 'float',
          }),
        });

        if (chunkEmbeddingResponse.ok) {
          const chunkEmbeddingData = await chunkEmbeddingResponse.json();
          const chunkEmbeddings: number[][] = chunkEmbeddingData.data.map((d: any) => d.embedding);

          const chunksToInsert = validChunks.map((chunk, idx) => ({
            contract_id: savedContract.id,
            organization_id: organizationId,
            chunk_index: idx,
            content: chunk.content,
            token_count: chunk.tokenCount,
            embedding: chunkEmbeddings[idx],
            metadata: {
              documentType: 'contract',
              contractType: basicInfo.type,
              jurisdiction,
              generatedBy: 'ai-contract-generator',
              processingDate: new Date().toISOString(),
              embeddingModel: 'text-embedding-3-small',
            },
          }));

          const { error: insertError } = await supabase
            .from('document_chunks')
            .insert(chunksToInsert);

          if (insertError) {
            console.error('Embedding: Failed to store chunks:', insertError.message);
          } else {
            console.log(`Embedding: Stored ${chunksToInsert.length} chunks for contract ${savedContract.id}`);
          }
        } else {
          console.warn('Embedding: Chunk embedding generation failed');
        }
      }
    } catch (embedError) {
      // Non-fatal: contract was already saved successfully
      console.warn('Embedding: Post-save embedding failed:', embedError);
    }

    return createJsonResponse(
      {
        success: true,
        contract: savedContract,
        generatedText: generatedContract,
        modelUsed,
      },
      { cors: corsOptions },
    );
  } catch (error: unknown) {
    console.error('Error in ai-contract-generator:', error);
    return createErrorResponse(error, corsOptions, 'Contract generation failed');
  }
});
