import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

import { buildCorsHeaders } from "../_shared/cors.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface AnalysisPayload {
  text?: string;
  goal?: string;
  analysisType?: string;
}

const personas: Record<string, { persona: string; guidance: string }> = {
  contract_review: {
    persona: "REAM AI Legal Strategist",
    guidance:
      "Provide a contract review that highlights obligations, risks, liability allocation, termination triggers, compliance considerations, and recommended next steps.",
  },
  document_review: {
    persona: "REAM AI Document Analyst",
    guidance:
      "Deliver a structured document review that summarizes purpose, key provisions, stakeholders, timelines, financial terms, and potential gaps.",
  },
  key_information: {
    persona: "REAM AI Insights Specialist",
    guidance:
      "Extract key facts, critical clauses, involved parties, monetary values, deadlines, and any action items that require attention.",
  },
};

const basePersona = {
  persona: "REAM AI Legal Analyst",
  guidance:
    "Provide a clear, professional legal analysis that surfaces obligations, risks, and suggested follow-up actions.",
};

serve(async (req: Request) => {
  const { headers: corsHeaders, isAllowed } = buildCorsHeaders(req.headers.get("origin"), {
    allowMethods: "POST, OPTIONS",
  });

  if (req.method === "OPTIONS") {
    if (!isAllowed) {
      return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isAllowed) {
    return new Response("Origin not allowed", { status: 403, headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const payload: AnalysisPayload = await req.json();
    const { text, goal, analysisType = "contract_review" } = payload;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      throw new Error("Document text is required");
    }

    const typeDetails = personas[analysisType] ?? basePersona;

    const systemPrompt = `You are ${typeDetails.persona}, a senior legal expert assisting with contract and document analysis.\n\nCRITICAL WRITING RULES:\n- Respond using plain text paragraphs with blank lines between sections.\n- Use numbered lists (1., 2., 3.) for stepwise items instead of bullet points.\n- Do not use markdown headings, bullet characters, or special formatting.\n- Provide concise section labels in all caps followed by a colon.\n- Keep the tone professional, practical, and easy to follow for legal and business stakeholders.`;

    const goalInstruction = goal && goal.trim().length > 0
      ? `\n\nUSER GOAL:\n${goal.trim()}`
      : "";

    const guidance = `\n\nANALYSIS FOCUS:\n${typeDetails.guidance}`;

    const userPrompt = `DOCUMENT TO ANALYZE:\n${text.trim()}${goalInstruction}${guidance}\n\nPlease provide a comprehensive response that covers:\n1. SUMMARY AND CONTEXT\n2. KEY TERMS AND OBLIGATIONS\n3. RISKS OR ISSUES\n4. RECOMMENDATIONS OR NEXT STEPS`;

    const requestStartTime = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-2025-08-07",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 2000,
        // Add timeout to prevent hanging requests
        timeout: 60,
      }),
    });

    console.log(`OpenAI request completed in ${Date.now() - requestStartTime}ms`);

    if (!response.ok) {
      const errorMessage = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorMessage}`);
    }

    const data = await response.json();
    const analysis = data?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      throw new Error("Failed to generate analysis");
    }

    const cleanAnalysis = analysis
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return new Response(
      JSON.stringify({
        analysis: cleanAnalysis,
        persona: typeDetails.persona,
        analysisType,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("contract-analysis-ai error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
