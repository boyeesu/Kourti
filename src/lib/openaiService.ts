// src/lib/openaiService.ts
// Secure OpenAI service that calls Edge Functions instead of exposing API keys

import { supabase } from '@/integrations/supabase/client';

// Supported types of contract analysis
export type AnalysisType = 'summarize' | 'extractClauses' | 'redline';

type AdvancedAnalysisType = 'summarize' | 'general' | 'risk' | 'extract' | 'compare';

function mapToAdvancedAnalysisType(type: AnalysisType): AdvancedAnalysisType {
  switch (type) {
    case 'summarize':
      return 'summarize';
    case 'extractClauses':
      return 'extract';
    case 'redline':
      return 'risk';
    default:
      return 'general';
  }
}

async function callContractAnalysis(text: string, analysisType: AnalysisType): Promise<string> {
  const payload = { text, analysisType };
  const advancedPayload = { text, analysisType: mapToAdvancedAnalysisType(analysisType) };

  let responseData: { analysis?: string; error?: string } | null = null;

  // Try advanced function first
  const { data, error } = await supabase.functions.invoke('advanced-contract-analysis', {
    body: advancedPayload,
  });

  if (error) {
    console.warn('Advanced contract analysis failed, attempting legacy function.', error);
    const fallback = await supabase.functions.invoke('contract-analysis-ai', {
      body: payload,
    });

    if (fallback.error) {
      console.error('Contract analysis error:', fallback.error);
      throw new Error(`Analysis failed: ${fallback.error.message}`);
    }

    responseData = fallback.data as { analysis?: string; error?: string } | null;
  } else {
    responseData = data as { analysis?: string; error?: string } | null;
  }

  // Check for error in response body (edge function may return 200 with error)
  if (responseData && responseData.error) {
    console.error('Contract analysis returned error:', responseData.error);
    throw new Error(responseData.error);
  }

  if (!responseData || typeof responseData.analysis !== 'string' || !responseData.analysis.trim()) {
    console.error('Unexpected or empty contract analysis response:', responseData);
    throw new Error('The AI returned an empty analysis. Please try again.');
  }

  return responseData.analysis;
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
