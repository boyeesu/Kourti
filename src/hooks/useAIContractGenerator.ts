/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

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

export function useAIContractGenerator() {
  return useMutation({
    mutationFn: async (data: ContractGenerationData) => {
      return invokeNodeApi<any>('/api/v1/ai/contract-generator', { method: 'POST', body: data });
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
