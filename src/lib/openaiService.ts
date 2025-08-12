// src/lib/openaiService.ts
// Secure OpenAI service that calls Edge Functions instead of exposing API keys

import { supabase } from '@/integrations/supabase/client';

// Supported types of contract analysis
export type AnalysisType = 'summarize' | 'extractClauses' | 'redline';

async function callContractAnalysis(text: string, analysisType: AnalysisType): Promise<string> {
  const { data, error } = await supabase.functions.invoke('contract-analysis', {
    body: { text, analysisType }
  });

  if (error) {
    console.error('Contract analysis error:', error);
    throw new Error(`Analysis failed: ${error.message}`);
  }

  if (!data || typeof data.analysis !== 'string') {
    console.error('Unexpected contract analysis response:', data);
    throw new Error('Unexpected response from contract analysis API');
  }

  return data.analysis;
}

// Summarize contract
export async function summarizeContract(text: string): Promise<string> {
  return callContractAnalysis(text, 'summarize');
}

// Extract key clauses
export async function extractKeyClauses(text: string): Promise<string> {
  return callContractAnalysis(text, 'extractClauses');
}

// Redline/flag risky or missing terms
export async function redlineContract(text: string): Promise<string> {
  return callContractAnalysis(text, 'redline');
}
