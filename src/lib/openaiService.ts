// src/lib/openaiService.ts
// Secure OpenAI service that calls Edge Functions instead of exposing API keys

import { supabase } from '@/integrations/supabase/client';

async function callContractAnalysis(text: string, analysisType: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('contract-analysis', {
    body: { text, analysisType }
  });

  if (error) {
    console.error('Contract analysis error:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }

  return data.analysis;
}

// Summarize contract
export async function summarizeContract(text: string) {
  return callContractAnalysis(text, 'summarize');
}

// Extract key clauses
export async function extractKeyClauses(text: string) {
  return callContractAnalysis(text, 'extractClauses');
}

// Redline/flag risky or missing terms
export async function redlineContract(text: string) {
  return callContractAnalysis(text, 'redline');
}
