/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

interface ContractTemplate {
  id: string;
  name: string;
  description?: string | null;
  template_content: string;
  contract_type: string;
  organization_id?: string | null;
  created_by?: string | null;
  is_public: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useContractTemplates() {
  return useQuery({
    queryKey: ['contract-templates'],
    queryFn: async (): Promise<ContractTemplate[]> => {
      return invokeNodeApi<ContractTemplate[]>('/api/v1/misc/contract-templates');
    },
  });
}

export function useCreateContractTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      templateData: Omit<
        ContractTemplate,
        'id' | 'created_at' | 'updated_at' | 'organization_id' | 'created_by'
      >
    ) => {
      return invokeNodeApi<any>('/api/v1/misc/contract-templates', {
        method: 'POST',
        body: templateData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-templates'] });
      toast.success('Success', { description: 'Contract template created successfully' });
    },
    onError: (error: any) => {
      toast.error('Error', { description: error.message || 'Failed to create template' });
    },
  });
}
