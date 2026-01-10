import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ContractGenerationData) => {
      const { data: result, error } = await supabase.functions.invoke('ai-contract-generator', {
        body: data,
      });

      if (error) {
        throw error;
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate contract');
      }

      return result;
    },
    onSuccess: (result) => {
      toast({
        title: 'Contract Generated',
        description: 'Your contract has been successfully generated using AI.',
      });
      return result;
    },
    onError: (error: any) => {
      console.error('Contract generation failed:', error);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: error.message || 'Failed to generate contract. Please try again.',
      });
    },
  });
}