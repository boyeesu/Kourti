// src/lib/openaiService.ts
// Secure OpenAI service that calls the Node backend for AI analysis

import { invokeNodeApi } from '@/lib/backendApi';

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
  const advancedPayload = { text, analysisType: mapToAdvancedAnalysisType(analysisType) };

  const nodeResponse = await invokeNodeApi<{
    success: boolean;
    analysis?: string;
    error?: string;
  }>('/api/v1/ai/advanced-contract-analysis', {
    method: 'POST',
    body: advancedPayload,
  });

  if (nodeResponse.error) {
    console.error('Contract analysis returned error:', nodeResponse.error);
    throw new Error(nodeResponse.error);
  }

  if (!nodeResponse.analysis?.trim()) {
    console.error('Unexpected or empty contract analysis response:', nodeResponse);
    throw new Error('The AI returned an empty analysis. Please try again.');
  }

  return nodeResponse.analysis;
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
