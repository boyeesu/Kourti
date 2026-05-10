/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';
import { streamContractGenerator } from '@/lib/featuresApi';

interface ContractGenerationData {
  basicInfo: {
    title: string;
    type: string;
    description?: string;
    value?: string;
    currency?: string;
    startDate?: string;
    endDate?: string;
  };
  parties: Array<{
    name: string;
    type: 'individual' | 'organization';
    email: string;
    address?: string;
    role: string;
  }>;
  terms?: string;
  clauses: Array<{
    title: string;
    content: string;
    required: boolean;
  }>;
  template?: string;
}

interface GeneratorOptions {
  /**
   * When provided, opens an SSE stream and invokes this callback with
   * each text delta as the model produces it. Resolves with the full
   * contract string when the stream completes.
   *
   * Without this callback, the request is non-streaming JSON (legacy
   * behavior) — pages that don't render token-by-token can ignore it.
   */
  onDelta?: (delta: string) => void;
}

function flattenForPrompt(data: ContractGenerationData) {
  const partyNames = data.parties.map((p) => p.name);
  const inlineTerms = [
    data.basicInfo.description,
    data.terms,
    ...data.clauses.map((c) => `- ${c.title}: ${c.content}`),
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    contractType: data.basicInfo.type || data.basicInfo.title,
    parties: partyNames.length ? partyNames : undefined,
    terms: inlineTerms || undefined,
    jurisdiction: undefined as string | undefined,
  };
}

export function useAIContractGenerator(options?: GeneratorOptions) {
  return useMutation({
    mutationFn: async (data: ContractGenerationData) => {
      const payload = flattenForPrompt(data);

      // Streaming path — render deltas as they arrive.
      if (options?.onDelta) {
        const { contract, tokensUsed, modelUsed } = await streamContractGenerator(
          payload,
          options.onDelta
        );
        return { contract, tokensUsed, modelUsed };
      }

      // Legacy non-streaming JSON path.
      return invokeNodeApi<any>('/api/v1/ai/contract-generator', {
        method: 'POST',
        body: payload,
        timeout: 180_000,
      });
    },
    onSuccess: (result) => {
      toast.success('Contract Generated', {
        description: 'Your contract has been successfully generated using AI.',
      });
      return result;
    },
    onError: (error: any) => {
      logError('Contract generation failed', error);
      toast.error('Generation Failed', {
        description: error.message || 'Failed to generate contract. Please try again.',
      });
    },
  });
}
