// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createJsonResponse, createEmptyResponse } from "../_shared/responseHeaders.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openAIApiKey = Deno.env.get("OPENAI_API_KEY")!;

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
};

interface ReamAIRequest {
  message: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  userId: string;
  organizationId: string;
  context?: {
    documentId?: string;
    documentContent?: string;
  };
}

serve(async (req: Request): Promise<Response> => {
  console.log("ream-ai-assistant function invoked", {
    method: req.method,
    url: req.url
  });

  // Handle CORS preflight requests first
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return createEmptyResponse({ 
      status: 204,
      cors: corsOptions
    });
  }

  try {
    let requestData: ReamAIRequest;
    try {
      requestData = await req.json();
    } catch (jsonError: any) {
      console.error("JSON parse error:", jsonError);
      return createJsonResponse(
        { error: "Invalid JSON in request body" },
        { status: 400, cors: corsOptions }
      );
    }

    const { message, conversationHistory = [], userId, organizationId, context } = requestData;

    if (!message || !userId || !organizationId) {
      console.error("Missing required fields:", { message: !!message, userId: !!userId, organizationId: !!organizationId });
      return createJsonResponse(
        { error: "Missing required fields: message, userId, or organizationId" },
        { status: 400, cors: corsOptions }
      );
    }

    console.log("Processing request for user:", userId, "org:", organizationId);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gather system context - query relevant tables
    // Wrap in try-catch to prevent context gathering from breaking the request
    let systemContext = "No system context available.";
    try {
      console.log("Gathering system context...");
      systemContext = await gatherSystemContext(supabase, organizationId, message);
      console.log("System context gathered, length:", systemContext.length);
    } catch (contextError: any) {
      console.error("Error gathering system context:", contextError);
      console.error("Context error stack:", contextError?.stack);
      // Continue with minimal context rather than failing
      systemContext = "System context unavailable. Proceeding with general knowledge.";
    }

    // Build enhanced system prompt with intelligent context understanding
    const systemPrompt = `You are Ream AI, an advanced AI legal assistant with Retrieval-Augmented Generation (RAG) capabilities integrated into a comprehensive legal practice management system.

CRITICAL: INTELLIGENT CONTEXT UNDERSTANDING
You must intelligently analyze each user query to determine its intent and respond appropriately:

1. GENERAL LEGAL QUESTIONS (e.g., "What is property law in Nigeria?", "Explain contract law", "What are the requirements for incorporation?", "How do I protect intellectual property?"):
   - ANSWER DIRECTLY using your legal knowledge - DO NOT ask for documents
   - Do NOT assume these are contract reviews or document analysis requests
   - Do NOT tell the user they need to provide a document unless they explicitly ask for document review
   - Provide comprehensive, accurate legal information
   - If relevant system data exists, incorporate it, but don't force it

2. SYSTEM DATA QUERIES (e.g., "How many clients do I have?", "Show me my active cases", "What invoices are pending?"):
   - Use the retrieved system context to answer
   - Provide specific numbers, names, and details from the database
   - Cite the data sources clearly

3. DOCUMENT/CONTRACT REVIEW REQUESTS (e.g., "Review this contract", "Analyze this document", "What are the risks in this agreement?"):
   - Only then should you perform document analysis
   - Use the retrieved document context
   - Provide structured analysis: Summary, Key Terms, Risks/Issues, Recommendations

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

CRITICAL OUTPUT FORMATTING RULES:
- NEVER use # headings or ### markdown headers in responses
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-) or commas instead
- NEVER use bullet points with - or * characters
- NEVER use ** bold formatting or * italic formatting
- NEVER use special unicode characters or symbols
- NEVER use markdown formatting of any kind
- Write in a natural, conversational, human-like style
- Use plain text with clear paragraphs separated by double line breaks
- Use numbered lists (1., 2., 3.) when listing items, but write them naturally
- Use regular quotes (") not smart quotes ("")
- Use regular apostrophes (') not smart apostrophes ('')
- Structure your response like a human would write it - natural flow, not robotic formatting

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
   - Provide accurate, well-researched answers
   - Cite sources when using retrieved data
   - Don't make assumptions about what the user wants - answer what they actually asked
   - Write naturally without markdown formatting or special characters

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
    console.log("Calling OpenAI API...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.1", // Using Thinking mode for complex reasoning and execution
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: userMessage },
        ],
        temperature: 0.3, // Lower temperature for more precise, thoughtful responses
        max_tokens: 4000, // Increased for comprehensive answers
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    let aiResponse = data.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";
    
    console.log("OpenAI response received, length:", aiResponse.length);

    // Clean the response to remove markdown formatting, em dashes, and special characters
    const cleanResponse = aiResponse
      .replace(/^#{1,6}\s+/gm, "") // Remove markdown headers (#, ##, ###, etc.)
      .replace(/^\s*[-*+]\s+/gm, "") // Remove bullet points
      .replace(/\*\*(.*?)\*\*/g, "$1") // Remove bold formatting
      .replace(/\*(.*?)\*/g, "$1") // Remove italic formatting
      .replace(/__(.*?)__/g, "$1") // Remove underline formatting
      .replace(/`([^`]+)`/g, "$1") // Remove inline code
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/^\s*>\s+/gm, "") // Remove blockquotes
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // Remove markdown links, keep text
      .replace(/—/g, " ") // Replace em dashes with spaces
      .replace(/–/g, "-") // Replace en dashes with hyphens
      .replace(/…/g, "...") // Replace ellipsis
      .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
      .replace(/['']/g, "'") // Replace smart apostrophes with regular apostrophes
      .replace(/•/g, "") // Remove bullet symbols
      .replace(/→/g, "to") // Replace arrows
      .replace(/←/g, "from")
      .replace(/↔/g, "to and from")
      .replace(/[\u2000-\u200B\u202F\u205F\u3000]/g, " ") // Replace various unicode spaces
      .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double newlines
      .trim();

    return createJsonResponse(
      {
        response: cleanResponse,
        success: true,
      },
      {
        status: 200,
        cors: corsOptions
      }
    );
  } catch (error: any) {
    console.error("Error in ream-ai-assistant:", error);
    console.error("Error stack:", error.stack);
    console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Return a more detailed error response
    const errorMessage = error?.message || error?.toString() || "Failed to process request";
    return createJsonResponse(
      { 
        error: errorMessage,
        success: false,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined
      },
      { 
        status: 500,
        cors: corsOptions
      }
    );
  }
});

async function gatherSystemContext(
  supabase: any,
  organizationId: string,
  userMessage: string
): Promise<string> {
  const contextParts: string[] = [];
  const messageLower = userMessage.toLowerCase();

  // Detect query intent
  const isCountQuery = /\b(how many|count|total|number of)\b/i.test(userMessage);
  const isClientQuery = /\b(client|clients|contact|contacts|customer|customers)\b/i.test(userMessage);
  const isCaseQuery = /\b(case|cases|matter|matters)\b/i.test(userMessage);
  const isDocumentQuery = /\b(document|documents|file|files|paperwork)\b/i.test(userMessage);
  const isContractQuery = /\b(contract|contracts|agreement|agreements)\b/i.test(userMessage);
  const isInvoiceQuery = /\b(invoice|invoices|billing|payment|payments|bill)\b/i.test(userMessage);
  const isTaskQuery = /\b(task|tasks|todo|todos|pending|assignment)\b/i.test(userMessage);
  const isEventQuery = /\b(event|events|meeting|meetings|calendar|deadline|appointment)\b/i.test(userMessage);

  // Determine if this is a general query (not specific to any module)
  const queryAll = !isClientQuery && !isCaseQuery && !isDocumentQuery && !isContractQuery && !isInvoiceQuery && !isTaskQuery && !isEventQuery;

  // Fetch counts/statistics only for relevant modules based on query intent
  // This avoids unnecessary real-time queries - only query what's needed
  const countQueries: Record<string, Promise<any>> = {};
  
  // Always get client count (most common query) or if it's a general/count query
  if (isClientQuery || isCountQuery || queryAll) {
    countQueries.clients = supabase.from("clients").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  
  // Get other counts only if relevant to the query
  if (isCaseQuery || isCountQuery || queryAll) {
    countQueries.cases = supabase.from("cases").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  if (isDocumentQuery || isCountQuery || queryAll) {
    countQueries.documents = supabase.from("documents").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  if (isContractQuery || isCountQuery || queryAll) {
    countQueries.contracts = supabase.from("contracts").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  if (isInvoiceQuery || isCountQuery || queryAll) {
    countQueries.invoices = supabase.from("invoices").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  if (isTaskQuery || isCountQuery || queryAll) {
    countQueries.tasks = supabase.from("tasks").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }
  if (isEventQuery || isCountQuery || queryAll) {
    countQueries.events = supabase.from("calendar_events").select("*", { count: "exact", head: true }).eq("organization_id", organizationId);
  }

  // Execute count queries in parallel
  const countResults = await Promise.allSettled(Object.values(countQueries));

  // Extract counts from results with error handling
  const countKeys = Object.keys(countQueries);
  const stats: Record<string, number> = {};
  countKeys.forEach((key, index) => {
    try {
      const result = countResults[index];
      if (result.status === "fulfilled" && result.value && result.value.count !== null && result.value.count !== undefined) {
        stats[key] = result.value.count;
      } else {
        stats[key] = 0;
      }
    } catch (e) {
      console.error(`Error extracting count for ${key}:`, e);
      stats[key] = 0;
    }
  });

  // Include statistics for queried modules - this answers "how many clients" type questions
  const statsList = Object.entries(stats)
    .map(([key, count]) => `- Total ${key.charAt(0).toUpperCase() + key.slice(1)}: ${count}`)
    .join("\n");
  if (statsList) {
    contextParts.push(`ORGANIZATION STATISTICS (Total Counts):\n${statsList}`);
  }

  // Query detailed data - always query relevant modules, or all if general query
  // (queryAll already defined above, reusing it)

  const dataQueries: Record<string, Promise<any>> = {};

  // Always query clients if client-related or general query
  if (isClientQuery || queryAll || isCountQuery) {
    dataQueries.clients = supabase
      .from("clients")
      .select("id, name, email, phone, created_at")
      .eq("organization_id", organizationId)
      .limit(isClientQuery ? 50 : 20)
      .order("created_at", { ascending: false });
  }

  // Query cases if case-related or general query
  if (isCaseQuery || queryAll) {
    dataQueries.cases = supabase
      .from("cases")
      .select("id, title, status, client_id, created_at")
      .eq("organization_id", organizationId)
      .limit(isCaseQuery ? 30 : 15)
      .order("created_at", { ascending: false });
  }

  // Query documents if document-related or general query
  if (isDocumentQuery || queryAll) {
    dataQueries.documents = supabase
      .from("documents")
      .select("id, name, type, created_at, case_id, client_id")
      .eq("organization_id", organizationId)
      .limit(15)
      .order("created_at", { ascending: false });
  }

  // Query contracts if contract-related or general query
  if (isContractQuery || queryAll) {
    dataQueries.contracts = supabase
      .from("contracts")
      .select("id, title, contract_type, status, start_date, end_date, created_at")
      .eq("organization_id", organizationId)
      .limit(15)
      .order("created_at", { ascending: false });
  }

  // Query invoices if invoice-related or general query
  if (isInvoiceQuery || queryAll) {
    dataQueries.invoices = supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, status, client_id, due_date, created_at")
      .eq("organization_id", organizationId)
      .limit(15)
      .order("created_at", { ascending: false });
  }

  // Query tasks if task-related or general query
  if (isTaskQuery || queryAll) {
    dataQueries.tasks = supabase
      .from("tasks")
      .select("id, title, status, due_date, assigned_to, created_at")
      .eq("organization_id", organizationId)
      .limit(15)
      .order("due_date", { ascending: true });
  }

  // Query calendar events if event-related or general query
  if (isEventQuery || queryAll) {
    dataQueries.events = supabase
      .from("calendar_events")
      .select("id, title, event_type, start_date, end_date, location")
      .eq("organization_id", organizationId)
      .gte("start_date", new Date().toISOString())
      .limit(15)
      .order("start_date", { ascending: true });
  }

  // Execute all data queries in parallel
  const dataResults = await Promise.allSettled(Object.values(dataQueries));

  // Process results by type - track index based on which queries were executed
  let currentIndex = 0;

  if ('clients' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const clients = result.value.data;
      contextParts.push(`CLIENTS (${clients.length} of ${stats.clients || 0} total):\n${clients.map((c: any) => `- ${c.name}${c.email ? ` (${c.email})` : ""}${c.phone ? ` - ${c.phone}` : ""}`).join("\n")}`);
    }
  }

  if ('cases' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const cases = result.value.data;
      contextParts.push(`CASES (${cases.length} of ${stats.cases || 0} total):\n${cases.map((c: any) => `- ${c.title} (Status: ${c.status})`).join("\n")}`);
    }
  }

  if ('documents' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const documents = result.value.data;
      contextParts.push(`DOCUMENTS (${documents.length} of ${stats.documents || 0} total):\n${documents.map((d: any) => `- ${d.name} (${d.type || "Unknown"})`).join("\n")}`);
    }
  }

  if ('contracts' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const contracts = result.value.data;
      contextParts.push(`CONTRACTS (${contracts.length} of ${stats.contracts || 0} total):\n${contracts.map((c: any) => `- ${c.title} (${c.contract_type || "Unknown"}, ${c.status || "Active"})`).join("\n")}`);
    }
  }

  if ('invoices' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const invoices = result.value.data;
      contextParts.push(`INVOICES (${invoices.length} of ${stats.invoices || 0} total):\n${invoices.map((i: any) => `- ${i.invoice_number}: $${i.total_amount || 0} (${i.status})`).join("\n")}`);
    }
  }

  if ('tasks' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const tasks = result.value.data;
      contextParts.push(`TASKS (${tasks.length} of ${stats.tasks || 0} total):\n${tasks.map((t: any) => `- ${t.title} (${t.status})${t.due_date ? ` - Due: ${new Date(t.due_date).toLocaleDateString()}` : ""}`).join("\n")}`);
    }
  }

  if ('events' in dataQueries) {
    const result = dataResults[currentIndex++];
    if (result.status === "fulfilled" && result.value.data && result.value.data.length > 0) {
      const events = result.value.data;
      contextParts.push(`UPCOMING CALENDAR EVENTS (${events.length} of ${stats.events || 0} total):\n${events.map((e: any) => `- ${e.title} (${e.event_type}) on ${new Date(e.start_date).toLocaleDateString()}`).join("\n")}`);
    }
  }

  // Perform vector search for document/contract content queries using pre-computed embeddings
  // Only generate query embedding when needed for semantic search
  if (isDocumentQuery || isContractQuery || (messageLower.length > 15 && !isCountQuery)) {
    try {
      // Generate embedding for the user's query using OpenAI embedding model
      // This is the only real-time embedding generation - document embeddings are pre-computed
      const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAIApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small", // Using OpenAI embedding model from your key
          input: userMessage.substring(0, 8000),
          encoding_format: "float"
        }),
      });

      if (embeddingResponse.ok) {
        const embeddingData = await embeddingResponse.json();
        const queryEmbedding = embeddingData.data[0].embedding;

        // Perform vector search against pre-computed embeddings in document_chunks table
        // This uses the match_document_chunks RPC which searches pre-existing embeddings
        const { data: vectorResults, error: vectorError } = await supabase.rpc(
          "match_document_chunks",
          {
            query_embedding: queryEmbedding,
            match_threshold: 0.6,
            match_count: 10
          }
        );

        if (!vectorError && vectorResults && vectorResults.length > 0) {
          // Get document/contract names for the results (lightweight query)
          const docIds = Array.from(new Set(vectorResults.map((r: any) => r.document_id).filter(Boolean)));
          const contractIds = Array.from(new Set(vectorResults.map((r: any) => r.contract_id).filter(Boolean)));

          const [docNames, contractNames] = await Promise.all([
            docIds.length > 0 ? supabase.from("documents").select("id, name").in("id", docIds) : Promise.resolve({ data: [] }),
            contractIds.length > 0 ? supabase.from("contracts").select("id, title").in("id", contractIds) : Promise.resolve({ data: [] })
          ]);

          const docNameMap = new Map((docNames.data || []).map((d: any) => [d.id, d.name]));
          const contractNameMap = new Map((contractNames.data || []).map((c: any) => [c.id, c.title]));

          const vectorContext = vectorResults.map((r: any, i: number) => {
            const docName = r.document_id ? docNameMap.get(r.document_id) : contractNameMap.get(r.contract_id);
            return `[VECTOR SEARCH RESULT ${i + 1}] "${docName || "Unknown"}" (similarity: ${(r.similarity * 100).toFixed(1)}%):\n${r.content.substring(0, 500)}`;
          }).join("\n\n");

          contextParts.push(`VECTOR SEARCH RESULTS (Semantic search using pre-computed embeddings):\n${vectorContext}`);
        }
      }
    } catch (e) {
      console.error("Error performing vector search:", e);
      // Continue without vector search results - don't fail the entire request
    }
  }

  return contextParts.length > 0
    ? contextParts.join("\n\n")
    : `ORGANIZATION STATISTICS:\n${Object.entries(stats).map(([key, count]) => `- Total ${key.charAt(0).toUpperCase() + key.slice(1)}: ${count}`).join("\n")}`;
}













