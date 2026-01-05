// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openAIApiKey = Deno.env.get("OPENAI_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const handler = async (req: Request): Promise<Response> => {
  console.log("ream-ai-assistant function invoked");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: ReamAIRequest = await req.json();
    const { message, conversationHistory = [], userId, organizationId, context } = requestData;

    if (!message || !userId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gather system context - query relevant tables
    const systemContext = await gatherSystemContext(supabase, organizationId, message);

    // Build enhanced system prompt with system knowledge
    const systemPrompt = `You are Ream AI, an intelligent legal assistant integrated into a comprehensive legal practice management system. You can help users with:

1. DATABASE QUERIES: You can query and analyze data from:
   - Cases/Matters (title, status, client, dates, activities)
   - Clients (name, contact info, associated cases)
   - Documents (name, type, upload date, associated cases/clients)
   - Contracts (title, type, status, dates, parties)
   - Calendar Events (title, type, dates, location)
   - Invoices (number, amount, status, client)
   - Tasks (title, status, assignee, due dates)
   - Users and Team Members

2. DOCUMENT REVIEWS: You can analyze and review:
   - Contracts and legal documents
   - Case files and documents
   - Any uploaded content
   - Provide risk assessments, key term extraction, summaries, and comparisons

3. SYSTEM INTERACTIONS: You can help users:
   - Find information across the system
   - Analyze data and provide insights
   - Review documents and contracts
   - Answer questions about cases, clients, and matters
   - Provide recommendations based on data
   - Help with general legal questions

CURRENT SYSTEM CONTEXT:
${systemContext}

IMPORTANT RULES:
- When querying data, use the system context provided above
- If you need more specific data, ask the user clarifying questions
- For document reviews, analyze the content provided in the context thoroughly
- Always cite specific data points when referencing system information (e.g., "Case: [Case Name]", "Client: [Client Name]")
- Be conversational, helpful, and professional
- If you don't have enough information, ask for clarification
- Provide actionable insights and recommendations
- When reviewing documents, identify key terms, risks, obligations, and recommendations
- For database queries, summarize findings clearly and reference specific records

RESPONSE FORMAT:
- Use clear, conversational language
- Structure responses with clear sections when appropriate
- Reference specific data from the system when available
- Provide actionable recommendations when relevant
- For reviews, organize findings into: Summary, Key Terms, Risks/Issues, Recommendations`;

    // Build user message with context
    let userMessage = message;
    if (context?.documentContent) {
      userMessage = `Document Context:\n${context.documentContent}\n\nUser Question: ${message}`;
    }

    // Call OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || "I apologize, but I couldn't generate a response.";

    return new Response(
      JSON.stringify({
        response: aiResponse,
        success: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in ream-ai-assistant:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to process request" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

async function gatherSystemContext(
  supabase: any,
  organizationId: string,
  userMessage: string
): Promise<string> {
  const contextParts: string[] = [];

  // Detect what the user might be asking about
  const messageLower = userMessage.toLowerCase();

  // Query cases if relevant - always include some cases for context
  try {
    const { data: cases } = await supabase
      .from("cases")
      .select("id, title, status, client_id, created_at")
      .eq("organization_id", organizationId)
      .limit(messageLower.includes("case") || messageLower.includes("matter") ? 20 : 5)
      .order("created_at", { ascending: false });

    if (cases && cases.length > 0) {
      contextParts.push(`RECENT CASES (${cases.length}):\n${cases.map((c: any) => `- ${c.title} (Status: ${c.status})`).join("\n")}`);
    }
  } catch (e) {
    console.error("Error fetching cases:", e);
  }

  // Query clients if relevant
  if (messageLower.includes("client") || messageLower.includes("contact") || messageLower.includes("who")) {
    try {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, email, phone")
        .eq("organization_id", organizationId)
        .limit(messageLower.includes("client") || messageLower.includes("contact") ? 20 : 5)
        .order("created_at", { ascending: false });

      if (clients && clients.length > 0) {
        contextParts.push(`RECENT CLIENTS (${clients.length}):\n${clients.map((c: any) => `- ${c.name}${c.email ? ` (${c.email})` : ""}${c.phone ? ` - ${c.phone}` : ""}`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching clients:", e);
    }
  }

  // Query documents if relevant
  if (messageLower.includes("document") || messageLower.includes("file")) {
    try {
      const { data: documents } = await supabase
        .from("documents")
        .select("id, name, type, created_at, case_id, client_id")
        .eq("organization_id", organizationId)
        .limit(10)
        .order("created_at", { ascending: false });

      if (documents && documents.length > 0) {
        contextParts.push(`RECENT DOCUMENTS (${documents.length}):\n${documents.map((d: any) => `- ${d.name} (${d.type || "Unknown"})`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching documents:", e);
    }
  }

  // Query contracts if relevant
  if (messageLower.includes("contract") || messageLower.includes("agreement")) {
    try {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id, title, contract_type, status, start_date, end_date")
        .eq("organization_id", organizationId)
        .limit(10)
        .order("created_at", { ascending: false });

      if (contracts && contracts.length > 0) {
        contextParts.push(`RECENT CONTRACTS (${contracts.length}):\n${contracts.map((c: any) => `- ${c.title} (${c.contract_type || "Unknown"}, ${c.status || "Active"})`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching contracts:", e);
    }
  }

  // Query calendar events if relevant
  if (messageLower.includes("calendar") || messageLower.includes("event") || messageLower.includes("meeting") || messageLower.includes("deadline")) {
    try {
      const { data: events } = await supabase
        .from("calendar_events")
        .select("id, title, event_type, start_date, end_date, location")
        .eq("organization_id", organizationId)
        .gte("start_date", new Date().toISOString())
        .limit(10)
        .order("start_date", { ascending: true });

      if (events && events.length > 0) {
        contextParts.push(`UPCOMING EVENTS (${events.length}):\n${events.map((e: any) => `- ${e.title} (${e.event_type}) on ${new Date(e.start_date).toLocaleDateString()}`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching events:", e);
    }
  }

  // Query invoices if relevant
  if (messageLower.includes("invoice") || messageLower.includes("billing") || messageLower.includes("payment")) {
    try {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, status, client_id, due_date")
        .eq("organization_id", organizationId)
        .limit(10)
        .order("created_at", { ascending: false });

      if (invoices && invoices.length > 0) {
        contextParts.push(`RECENT INVOICES (${invoices.length}):\n${invoices.map((i: any) => `- ${i.invoice_number}: $${i.total_amount} (${i.status})`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching invoices:", e);
    }
  }

  // Query tasks if relevant
  if (messageLower.includes("task") || messageLower.includes("todo") || messageLower.includes("pending")) {
    try {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title, status, due_date, assigned_to")
        .eq("organization_id", organizationId)
        .limit(10)
        .order("due_date", { ascending: true });

      if (tasks && tasks.length > 0) {
        contextParts.push(`RECENT TASKS (${tasks.length}):\n${tasks.map((t: any) => `- ${t.title} (${t.status})${t.due_date ? ` - Due: ${new Date(t.due_date).toLocaleDateString()}` : ""}`).join("\n")}`);
      }
    } catch (e) {
      console.error("Error fetching tasks:", e);
    }
  }

  // Get organization stats - always include
  try {
    const { count: caseCount } = await supabase
      .from("cases")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    const { count: clientCount } = await supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    const { count: documentCount } = await supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    const { count: contractCount } = await supabase
      .from("contracts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId);

    contextParts.push(`ORGANIZATION STATISTICS:\n- Total Cases: ${caseCount || 0}\n- Total Clients: ${clientCount || 0}\n- Total Documents: ${documentCount || 0}\n- Total Contracts: ${contractCount || 0}`);
  } catch (e) {
    console.error("Error fetching stats:", e);
  }

  return contextParts.length > 0
    ? contextParts.join("\n\n")
    : "No specific system data available. You can help users with general questions, document reviews, and system navigation.";
}

serve(handler);

