// @ts-ignore: Deno module
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-ignore: Deno module
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  createJsonResponse,
  createEmptyResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMIT_PRESETS,
  createRateLimitHeaders,
} from '../_shared/rateLimiting.ts';
import { createErrorResponse } from '../_shared/errorHandling.ts';
import { requireOrganizationAccess } from '../_shared/organizationValidation.ts';
import { requireCsrfTokenForUser } from '../_shared/csrfProtection.ts';
import {
  createTrace,
  traceOpenAIChatCompletion,
  traceOpenAIEmbedding,
} from '../_shared/langfuse.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8083',
        'http://localhost:8087',
        'http://localhost:8082',
      ]
    : []),
  'https://app.kourti.com',
]
  .flatMap((value) => (value ? value.split(',') : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] || 'https://app.kourti.com';

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ['POST', 'OPTIONS'],
  };
}

interface ReamAIRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userId?: string; // DEPRECATED: ignored, derived from JWT
  organizationId?: string; // DEPRECATED: ignored, derived from JWT
  context?: {
    documentId?: string;
    documentContent?: string;
  };
}

serve(async (req: Request): Promise<Response> => {
  console.log('ream-ai-assistant function invoked', {
    method: req.method,
    url: req.url,
  });

  const requestOrigin = req.headers.get('Origin');
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle CORS preflight requests first
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return createEmptyResponse({
      status: 204,
      cors: corsOptions,
    });
  }

  try {
    // --- Authentication: derive userId from JWT, not request body ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createJsonResponse(
        { success: false, error: 'Authorization header required', errorCode: 'UNAUTHORIZED' },
        { status: 401, cors: corsOptions }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return createJsonResponse(
        { success: false, error: 'Invalid Authorization header', errorCode: 'UNAUTHORIZED' },
        { status: 401, cors: corsOptions }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return createJsonResponse(
        { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' },
        { status: 401, cors: corsOptions }
      );
    }

    // Derive userId and organizationId from JWT - never trust client-provided values
    const userId = user.id;

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return createJsonResponse(
        {
          success: false,
          error: 'User profile or organization not found',
          errorCode: 'PROFILE_NOT_FOUND',
        },
        { status: 403, cors: corsOptions }
      );
    }

    const organizationId = profile.organization_id;

    let requestData: ReamAIRequest;
    try {
      requestData = await req.json();
    } catch (jsonError: unknown) {
      return createErrorResponse(jsonError, corsOptions, {
        function: 'ream-ai-assistant',
        errorType: 'JSON_PARSE_ERROR',
      });
    }

    // Only extract message, conversationHistory, context - userId/organizationId are derived from JWT
    const { message, conversationHistory = [], context } = requestData;

    if (!message) {
      return createJsonResponse(
        {
          success: false,
          error: 'Missing required field: message',
          errorCode: 'VALIDATION_ERROR',
        },
        { status: 400, cors: corsOptions }
      );
    }

    // Input size limits to prevent cost abuse
    if (typeof message === 'string' && message.length > 50000) {
      return createJsonResponse(
        {
          success: false,
          error: 'Message exceeds maximum length of 50,000 characters',
          errorCode: 'INPUT_TOO_LARGE',
        },
        { status: 400, cors: corsOptions }
      );
    }
    if (Array.isArray(conversationHistory) && conversationHistory.length > 20) {
      return createJsonResponse(
        {
          success: false,
          error: 'Conversation history exceeds maximum of 20 messages',
          errorCode: 'INPUT_TOO_LARGE',
        },
        { status: 400, cors: corsOptions }
      );
    }
    if (
      context?.documentContent &&
      typeof context.documentContent === 'string' &&
      context.documentContent.length > 200000
    ) {
      return createJsonResponse(
        {
          success: false,
          error: 'Document content exceeds maximum length of 200,000 characters',
          errorCode: 'INPUT_TOO_LARGE',
        },
        { status: 400, cors: corsOptions }
      );
    }

    console.log('Processing request for user:', userId, 'org:', organizationId);

    // Rate limiting - prevent AI cost abuse
    const rateLimitId = userId || getRateLimitIdentifier(req);
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AI,
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
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

    // Validate organization access
    await requireOrganizationAccess(supabase, userId, organizationId);

    // CSRF Protection - validate token for authenticated mutation
    await requireCsrfTokenForUser(supabase, userId, req);

    // Create Langfuse trace for this request (non-blocking to avoid added latency)
    const tracePromise = createTrace({
      name: 'ream-ai-assistant',
      userId,
      metadata: {
        organizationId,
        hasDocumentContext: !!context?.documentContent,
        conversationHistoryLength: conversationHistory.length,
      },
      tags: ['ai-assistant', 'legal'],
    }).catch(() => null);
    const traceId = await tracePromise;

    // Gather system context - query relevant tables
    // Wrap in try-catch to prevent context gathering from breaking the request
    let systemContext = 'No system context available.';
    try {
      console.log('Gathering system context...');
      systemContext = await gatherSystemContext(supabase, organizationId, message, traceId);
      console.log('System context gathered, length:', systemContext.length);
    } catch (contextError: any) {
      console.error('Error gathering system context:', contextError);
      console.error('Context error stack:', contextError?.stack);
      // Continue with minimal context rather than failing
      systemContext = 'System context unavailable. Proceeding with general knowledge.';
    }

    // Build enhanced system prompt with intelligent context understanding
    const systemPrompt = `You are Ream AI, an advanced AI legal assistant with Retrieval-Augmented Generation (RAG) capabilities integrated into a comprehensive legal practice management system.

CRITICAL: INTELLIGENT CONTEXT UNDERSTANDING
You must intelligently analyze each user query to determine its intent and respond appropriately:

1. GENERAL LEGAL QUESTIONS (e.g., "What is property law in Nigeria?", "Explain contract law", "What are the requirements for incorporation?", "How do I protect intellectual property?", "What is a non-disclosure agreement?"):
   - ANSWER DIRECTLY using your legal knowledge - DO NOT ask for documents
   - Do NOT assume these are contract reviews or document analysis requests
   - Do NOT tell the user they need to provide a document unless they explicitly ask for document review
   - Provide comprehensive, accurate, and extremely detailed legal information
   - Explain the concept thoroughly: what it is, why it exists, how it works, key components, practical applications, common variations, legal requirements, risks, and best practices
   - Structure your response with clear, flowing paragraphs that cover all aspects of the topic
   - Be specific and detailed - avoid high-level summaries, provide substantive explanations
   - If relevant system data exists, incorporate it naturally into your response, but don't force it

2. SYSTEM DATA QUERIES (e.g., "How many clients do I have?", "Show me my active cases", "What invoices are pending?"):
   - Use the retrieved system context to answer
   - Provide specific numbers, names, and details from the database
   - Cite the data sources clearly

3. DOCUMENT/CONTRACT REVIEW REQUESTS (e.g., "Review this contract", "Analyze this document", "What are the risks in this agreement?"):
   - Only then should you perform document analysis
   - Use the retrieved document context
   - Provide comprehensive, detailed structured analysis covering: Summary, Key Terms, Risks/Issues, Recommendations
   - Write each section as flowing paragraphs, not as lists or bullet points
   - Be thorough and detailed in your analysis - explain each point fully with context and implications
   - Use plain text paragraphs separated by double line breaks between sections

4. MIXED QUERIES (combining general knowledge with system data):
   - Intelligently blend general legal knowledge with specific system data
   - Use context where relevant, but don't force irrelevant data into answers

CRITICAL: DOCUMENT CONTEXT USAGE
When document content is provided in the user's message, you MUST treat ALL subsequent questions as being about that document:
- If a user asks "who are the parties in this document" while reviewing a document, extract and list the parties from the document content
- If a user asks "what is the termination clause" while reviewing a document, find and explain the termination clause from the document
- ALL questions when document context is present should be answered using information from that document
- Reference specific sections, clauses, or terms from the document when answering
- If information isn't in the document, say so clearly rather than guessing

YOUR RAG CAPABILITIES:
- VECTOR SEARCH: Semantic search across documents, contracts, and content
- DATABASE QUERIES: Direct access to structured data from all system tables
- CONTEXT RETRIEVAL: Intelligent retrieval based on query intent detection
- MULTI-SOURCE SYNTHESIS: Combine information from multiple sources

YOUR DATA SOURCES:
- Cases/Matters: Title, status, client relationships, dates, activities, notes
- Clients: Contact information, associated cases, communication history
- Documents: All uploaded documents with full-text search via vector embeddings
- Contracts: All contracts with semantic search and analysis capabilities
- Calendar Events: Meetings, deadlines, appointments
- Invoices: Billing information, payment status, financial data
- Tasks: Project management, assignments, due dates
- Team Members: User information, roles, permissions
- Document Chunks: Vector-embedded content for semantic search

CURRENT RETRIEVED SYSTEM CONTEXT:
${systemContext}

CRITICAL OUTPUT FORMATTING RULES - STRICTLY ENFORCE:
- NEVER use markdown headers (#, ##, ###, ####, #####, ######) - write section titles in plain text with capital letters or simple labels
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-), commas, or colons instead
- NEVER use bullet points with - or * or • characters - use numbered lists (1., 2., 3.) or write in paragraph form
- NEVER use ** bold formatting or * italic formatting or __ underline formatting
- NEVER use special unicode characters or symbols (—, –, •, →, ←, ↔, "", '', …, etc.)
- NEVER use markdown formatting of any kind (no headers, no bold, no italic, no bullets, no code blocks)
- NEVER use colons after section titles if they create a list-like appearance - integrate titles naturally into paragraphs
- Write in a natural, conversational, human-like style with clear, detailed explanations
- Use plain text with clear paragraphs separated by double line breaks
- When listing items, integrate them naturally into paragraphs or use numbered lists (1., 2., 3.) written as complete sentences
- Use regular quotes (") not smart quotes ("")
- Use regular apostrophes (') not smart apostrophes ('')
- Structure your response like a human would write it - natural flow, not robotic formatting
- Be extremely detailed and comprehensive in your responses - provide thorough explanations, examples, and context
- Write section labels naturally within the text flow, not as separate headers

INTELLIGENT RESPONSE GUIDELINES:
1. ANALYZE QUERY INTENT FIRST:
   - Is this a general legal question? → Answer with legal knowledge
   - Is this asking about system data? → Use retrieved context
   - Is this requesting document review? → Perform analysis
   - Is this a combination? → Blend appropriately

2. USE CONTEXT INTELLIGENTLY:
   - If the query is general (e.g., "What is property law?"), answer directly - don't force system data
   - If the query asks about system data (e.g., "How many clients?"), use the retrieved context
   - If context is provided but irrelevant to the question, acknowledge it but answer the actual question
   - Only perform document/contract analysis when explicitly requested or when document context is clearly relevant
   - When document context is provided, ALL questions should be answered using that document

3. RESPONSE QUALITY:
   - Be conversational, helpful, and professional - write like a human colleague would
   - Provide accurate, well-researched answers with extensive detail and thorough explanations
   - Be comprehensive and detailed - explain concepts fully, provide context, give examples, and cover all relevant aspects
   - When explaining legal concepts, provide detailed information about purpose, key components, practical implications, and relevant considerations
   - Cite sources when using retrieved data
   - Don't make assumptions about what the user wants - answer what they actually asked
   - Write naturally without markdown formatting or special characters
   - Structure responses with clear, flowing paragraphs that naturally transition between topics
   - Use descriptive language and provide comprehensive coverage of the subject matter

4. EXAMPLES OF CORRECT BEHAVIOR:
   - "What is property law in Nigeria?" → Provide comprehensive explanation of Nigerian property law (general knowledge)
   - "How many clients do I have?" → Use system context to provide exact count
   - "Review this contract" → Perform detailed contract analysis using document context
   - "What are my pending invoices?" → Query system data and list them
   - "Who are the parties in this document?" (with document context) → Extract and list parties from the document content

Remember: You are a smart assistant that understands context. Not every question is a contract review. Answer what the user actually asks, using the appropriate knowledge source. Write naturally and conversationally, like a human would.`;

    // Build user message with context
    let userMessage = message;
    if (context?.documentContent) {
      userMessage = `You are currently reviewing a document. ALL questions should be answered using information from this document.

DOCUMENT CONTENT:
${context.documentContent}

USER QUESTION: ${message}

IMPORTANT: This question is about the document above. Extract information directly from the document content. For example:
- "Who are the parties?" → Find and list the parties mentioned in the document
- "What is the termination clause?" → Find and explain the termination clause from the document
- "What are the key terms?" → Extract and explain key terms from the document
- Any question about "this document" or referring to the document should be answered using the document content provided above.`;
    }

    // Call OpenAI
    console.log('Calling OpenAI API...');
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userMessage },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5.3',
        messages,
        max_tokens: 4000,
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    let aiResponse =
      data.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";

    // Trace the OpenAI chat completion (non-blocking)
    traceOpenAIChatCompletion(traceId, {
      model: 'gpt-5.3',
      messages,
      response: data,
      userId,
      metadata: {
        organizationId,
        hasDocumentContext: !!context?.documentContent,
        maxTokens: 4000,
      },
    }).catch(() => {});

    console.log('OpenAI response received, length:', aiResponse.length);

    // Clean the response to remove markdown formatting, em dashes, and special characters
    const cleanResponse = aiResponse
      .replace(/^#{1,6}\s+/gm, '') // Remove markdown headers (#, ##, ###, etc.)
      .replace(/^\s*[-*+•]\s+/gm, '') // Remove bullet points (including bullet symbol)
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/__(.*?)__/g, '$1') // Remove underline formatting
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/^\s*>\s+/gm, '') // Remove blockquotes
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove markdown links, keep text
      .replace(/—/g, ' ') // Replace em dashes with spaces
      .replace(/–/g, '-') // Replace en dashes with hyphens
      .replace(/…/g, '...') // Replace ellipsis
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes with regular apostrophes
      .replace(/•/g, '') // Remove bullet symbols
      .replace(/→/g, 'to') // Replace arrows
      .replace(/←/g, 'from')
      .replace(/↔/g, 'to and from')
      .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, ' ') // Replace various unicode spaces
      .replace(/\*\s+/g, ' ') // Remove any remaining asterisks used as bullets
      .replace(/^\s*[-*+•]\s+/gm, '') // Second pass for bullet points
      .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with double newlines
      .replace(/([A-Z][A-Z\s]+):\s*\n/g, '$1: ') // Convert section headers with colons to inline text
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up excessive spacing
      .trim();

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      {
        response: cleanResponse,
        success: true,
      },
      {
        status: 200,
        cors: corsOptions,
        headers: rateLimitHeaders,
      }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'ream-ai-assistant',
    });
  }
});

async function gatherSystemContext(
  supabase: any,
  organizationId: string,
  userMessage: string,
  traceId: string | null = null
): Promise<string> {
  const contextParts: string[] = [];
  const messageLower = userMessage.toLowerCase();

  // Detect query intent
  const isCountQuery = /\b(how many|count|total|number of)\b/i.test(userMessage);
  const isClientQuery = /\b(client|clients|contact|contacts|customer|customers)\b/i.test(
    userMessage
  );
  const isCaseQuery = /\b(case|cases|matter|matters)\b/i.test(userMessage);
  const isDocumentQuery = /\b(document|documents|file|files|paperwork)\b/i.test(userMessage);
  const isContractQuery = /\b(contract|contracts|agreement|agreements)\b/i.test(userMessage);
  const isInvoiceQuery = /\b(invoice|invoices|billing|payment|payments|bill)\b/i.test(userMessage);
  const isTaskQuery = /\b(task|tasks|todo|todos|pending|assignment)\b/i.test(userMessage);
  const isEventQuery = /\b(event|events|meeting|meetings|calendar|deadline|appointment)\b/i.test(
    userMessage
  );

  // For general queries, only fetch lightweight stats — not all table data
  const isSpecificQuery =
    isClientQuery ||
    isCaseQuery ||
    isDocumentQuery ||
    isContractQuery ||
    isInvoiceQuery ||
    isTaskQuery ||
    isEventQuery;

  // --- Build ALL queries upfront, then execute EVERYTHING in one parallel batch ---

  // Combined queries map: counts + data + vector search all fire at once
  const allQueries: Record<string, Promise<any>> = {};

  // Count queries — only for relevant modules or count queries
  if (isClientQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countClients = supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isCaseQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countCases = supabase
      .from('cases')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isDocumentQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countDocuments = supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isContractQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countContracts = supabase
      .from('contracts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isInvoiceQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countInvoices = supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isTaskQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countTasks = supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }
  if (isEventQuery || isCountQuery || !isSpecificQuery) {
    allQueries.countEvents = supabase
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId);
  }

  // Data queries — only for specifically requested modules (skip for general queries to save time)
  if (isClientQuery || isCountQuery) {
    allQueries.dataClients = supabase
      .from('clients')
      .select('id, name, email, phone, created_at')
      .eq('organization_id', organizationId)
      .limit(isClientQuery ? 50 : 20)
      .order('created_at', { ascending: false });
  }
  if (isCaseQuery) {
    allQueries.dataCases = supabase
      .from('cases')
      .select('id, title, status, client_id, created_at')
      .eq('organization_id', organizationId)
      .limit(30)
      .order('created_at', { ascending: false });
  }
  if (isDocumentQuery) {
    allQueries.dataDocuments = supabase
      .from('documents')
      .select('id, name, type, created_at, case_id, client_id')
      .eq('organization_id', organizationId)
      .limit(15)
      .order('created_at', { ascending: false });
  }
  if (isContractQuery) {
    allQueries.dataContracts = supabase
      .from('contracts')
      .select('id, title, contract_type, status, start_date, end_date, created_at')
      .eq('organization_id', organizationId)
      .limit(15)
      .order('created_at', { ascending: false });
  }
  if (isInvoiceQuery) {
    allQueries.dataInvoices = supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, status, client_id, due_date, created_at')
      .eq('organization_id', organizationId)
      .limit(15)
      .order('created_at', { ascending: false });
  }
  if (isTaskQuery) {
    allQueries.dataTasks = supabase
      .from('tasks')
      .select('id, title, status, due_date, assigned_to, created_at')
      .eq('organization_id', organizationId)
      .limit(15)
      .order('due_date', { ascending: true });
  }
  if (isEventQuery) {
    allQueries.dataEvents = supabase
      .from('calendar_events')
      .select('id, title, event_type, start_date, end_date, location')
      .eq('organization_id', organizationId)
      .gte('start_date', new Date().toISOString())
      .limit(15)
      .order('start_date', { ascending: true });
  }

  // Vector search — fire embedding request in parallel with DB queries
  const needsVectorSearch =
    isDocumentQuery || isContractQuery || (messageLower.length > 15 && !isCountQuery);

  if (needsVectorSearch) {
    const embeddingInput = userMessage.substring(0, 8000);
    allQueries.vectorSearch = (async () => {
      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: embeddingInput,
          encoding_format: 'float',
        }),
      });

      if (!embeddingResponse.ok) return { vectorResults: null };

      const embeddingData = await embeddingResponse.json();
      const queryEmbedding = embeddingData.data[0].embedding;

      // Trace in background (non-blocking)
      traceOpenAIEmbedding(traceId, {
        model: 'text-embedding-3-small',
        input: embeddingInput,
        response: embeddingData,
        metadata: { purpose: 'vector-search-query', organizationId },
      }).catch(() => {});

      const { data: vectorResults, error: vectorError } = await supabase.rpc(
        'match_document_chunks',
        {
          query_embedding: queryEmbedding,
          match_threshold: 0.6,
          match_count: 10,
        }
      );

      if (vectorError || !vectorResults || vectorResults.length === 0) {
        return { vectorResults: null };
      }

      // Enrich with document names
      const docIds = Array.from(
        new Set(vectorResults.map((r: any) => r.document_id).filter(Boolean))
      );
      const contractIds = Array.from(
        new Set(vectorResults.map((r: any) => r.contract_id).filter(Boolean))
      );

      const [docNames, contractNames] = await Promise.all([
        docIds.length > 0
          ? supabase.from('documents').select('id, name').in('id', docIds)
          : Promise.resolve({ data: [] }),
        contractIds.length > 0
          ? supabase.from('contracts').select('id, title').in('id', contractIds)
          : Promise.resolve({ data: [] }),
      ]);

      return {
        vectorResults,
        docNames: docNames.data || [],
        contractNames: contractNames.data || [],
      };
    })().catch((e) => {
      console.error('Error performing vector search:', e);
      return { vectorResults: null };
    });
  }

  // --- Execute ALL queries in one parallel batch ---
  const queryKeys = Object.keys(allQueries);
  const allResults = await Promise.allSettled(Object.values(allQueries));

  // Build results map
  const resultMap: Record<string, any> = {};
  queryKeys.forEach((key, index) => {
    const result = allResults[index];
    resultMap[key] = result.status === 'fulfilled' ? result.value : null;
  });

  // --- Process count results ---
  const stats: Record<string, number> = {};
  const countMapping: Record<string, string> = {
    countClients: 'clients',
    countCases: 'cases',
    countDocuments: 'documents',
    countContracts: 'contracts',
    countInvoices: 'invoices',
    countTasks: 'tasks',
    countEvents: 'events',
  };

  for (const [queryKey, label] of Object.entries(countMapping)) {
    if (resultMap[queryKey] && resultMap[queryKey].count != null) {
      stats[label] = resultMap[queryKey].count;
    }
  }

  const statsList = Object.entries(stats)
    .map(([key, count]) => `- Total ${key.charAt(0).toUpperCase() + key.slice(1)}: ${count}`)
    .join('\n');
  if (statsList) {
    contextParts.push(`ORGANIZATION STATISTICS (Total Counts):\n${statsList}`);
  }

  // --- Process data results ---
  const dataMapping: Array<{
    key: string;
    label: string;
    statsKey: string;
    format: (item: any) => string;
  }> = [
    {
      key: 'dataClients',
      label: 'CLIENTS',
      statsKey: 'clients',
      format: (c: any) =>
        `- ${c.name}${c.email ? ` (${c.email})` : ''}${c.phone ? ` - ${c.phone}` : ''}`,
    },
    {
      key: 'dataCases',
      label: 'CASES',
      statsKey: 'cases',
      format: (c: any) => `- ${c.title} (Status: ${c.status})`,
    },
    {
      key: 'dataDocuments',
      label: 'DOCUMENTS',
      statsKey: 'documents',
      format: (d: any) => `- ${d.name} (${d.type || 'Unknown'})`,
    },
    {
      key: 'dataContracts',
      label: 'CONTRACTS',
      statsKey: 'contracts',
      format: (c: any) => `- ${c.title} (${c.contract_type || 'Unknown'}, ${c.status || 'Active'})`,
    },
    {
      key: 'dataInvoices',
      label: 'INVOICES',
      statsKey: 'invoices',
      format: (i: any) => `- ${i.invoice_number}: $${i.total_amount || 0} (${i.status})`,
    },
    {
      key: 'dataTasks',
      label: 'TASKS',
      statsKey: 'tasks',
      format: (t: any) =>
        `- ${t.title} (${t.status})${t.due_date ? ` - Due: ${new Date(t.due_date).toLocaleDateString()}` : ''}`,
    },
    {
      key: 'dataEvents',
      label: 'UPCOMING CALENDAR EVENTS',
      statsKey: 'events',
      format: (e: any) =>
        `- ${e.title} (${e.event_type}) on ${new Date(e.start_date).toLocaleDateString()}`,
    },
  ];

  for (const { key, label, statsKey, format } of dataMapping) {
    const result = resultMap[key];
    if (result?.data && result.data.length > 0) {
      contextParts.push(
        `${label} (${result.data.length} of ${stats[statsKey] || 0} total):\n${result.data.map(format).join('\n')}`
      );
    }
  }

  // --- Process vector search results ---
  if (resultMap.vectorSearch?.vectorResults) {
    const { vectorResults, docNames = [], contractNames = [] } = resultMap.vectorSearch;
    const docNameMap = new Map(docNames.map((d: any) => [d.id, d.name]));
    const contractNameMap = new Map(contractNames.map((c: any) => [c.id, c.title]));

    const vectorContext = vectorResults
      .map((r: any, i: number) => {
        const docName = r.document_id
          ? docNameMap.get(r.document_id)
          : contractNameMap.get(r.contract_id);
        return `[VECTOR SEARCH RESULT ${i + 1}] "${docName || 'Unknown'}" (similarity: ${(r.similarity * 100).toFixed(1)}%):\n${r.content.substring(0, 500)}`;
      })
      .join('\n\n');

    contextParts.push(
      `VECTOR SEARCH RESULTS (Semantic search using pre-computed embeddings):\n${vectorContext}`
    );
  }

  return contextParts.length > 0
    ? contextParts.join('\n\n')
    : `ORGANIZATION STATISTICS:\n${Object.entries(stats)
        .map(([key, count]) => `- Total ${key.charAt(0).toUpperCase() + key.slice(1)}: ${count}`)
        .join('\n')}`;
}
