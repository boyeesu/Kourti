declare const Deno: any;

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ["POST", "OPTIONS"],
};

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
  if (req.method === "OPTIONS") {
    return createEmptyResponse({ status: 204, cors: corsOptions });
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

    const systemPrompt = `You are ${typeDetails.persona}, a senior legal expert assisting with contract and document analysis.

CRITICAL WRITING RULES - STRICTLY ENFORCE:
- Respond using plain text paragraphs with blank lines between sections
- NEVER use markdown headings (#, ##, ###, etc.) - write section titles naturally within the text flow
- NEVER use bullet points with - or * or • characters - use numbered lists (1., 2., 3.) written as complete sentences or integrate into paragraphs
- NEVER use em dashes (—) or en dashes (–) - use regular hyphens (-), commas, or colons instead
- NEVER use special unicode characters or symbols (—, –, •, →, ←, ↔, "", '', …, etc.)
- NEVER use ** bold formatting or * italic formatting or __ underline formatting
- NEVER use markdown formatting of any kind
- Use regular hyphens (-) only for compound words, not for lists
- Use regular quotes (") not smart quotes ("")
- Use regular apostrophes (') not smart apostrophes ('')
- Write section labels naturally within paragraphs, not as separate headers with colons
- Be extremely detailed and comprehensive in your analysis - provide thorough explanations, context, and practical implications
- Keep the tone professional, practical, and easy to follow for legal and business stakeholders
- Structure responses with clear, flowing paragraphs that naturally transition between topics`;

    const goalInstruction = goal && goal.trim().length > 0
      ? `\n\nUSER GOAL:\n${goal.trim()}`
      : "";

    const guidance = `\n\nANALYSIS FOCUS:\n${typeDetails.guidance}`;

    const userPrompt = `DOCUMENT TO ANALYZE:\n${text.trim()}${goalInstruction}${guidance}

Please provide a comprehensive, detailed response that covers all of the following areas. Write each section as flowing paragraphs with thorough explanations, not as lists or bullet points:

1. SUMMARY AND CONTEXT - Provide a detailed overview of the document, its purpose, the parties involved, and the overall context. Be specific and comprehensive.

2. KEY TERMS AND OBLIGATIONS - Explain all key terms, conditions, obligations, and important provisions in detail. Describe what each party must do, when, and under what conditions. Be thorough and specific.

3. RISKS OR ISSUES - Identify and explain all potential risks, issues, concerns, or problematic areas in detail. Explain why each is a concern and what the implications might be. Be comprehensive in your risk assessment.

4. RECOMMENDATIONS OR NEXT STEPS - Provide detailed, actionable recommendations and next steps. Explain what should be done, why, and how. Be specific and practical.

Remember: Write in plain text paragraphs, be extremely detailed, avoid all markdown formatting, and structure your response naturally with clear transitions between sections.`;

    const requestStartTime = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 2000,
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
      .replace(/^#{1,6}\s+/gm, "") // Remove markdown headers
      .replace(/^\s*[-*+•]\s+/gm, "") // Remove bullet points (including bullet symbol)
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
      .replace(/\*\s+/g, " ") // Remove any remaining asterisks used as bullets
      .replace(/^\s*[-*+•]\s+/gm, "") // Second pass for bullet points
      .replace(/\n{3,}/g, "\n\n") // Replace multiple newlines with double newlines
      .replace(/([A-Z][A-Z\s]+):\s*\n/g, "$1: ") // Convert section headers with colons to inline text
      .replace(/\n\s*\n\s*\n/g, "\n\n") // Clean up excessive spacing
      .trim();

    return createJsonResponse(
      {
        analysis: cleanAnalysis,
        persona: typeDetails.persona,
        analysisType,
      },
      { cors: corsOptions },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("contract-analysis-ai error:", message);
    return createJsonResponse(
      { error: message },
      {
        status: 500,
        cors: corsOptions,
      },
    );
  }
});
