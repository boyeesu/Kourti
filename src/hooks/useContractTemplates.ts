/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useUserOrganization } from '@/hooks/useUserOrganization';

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
      const { data, error } = await supabase.from('contract_templates').select('*').order('name');

      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateContractTemplate() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (
      templateData: Omit<
        ContractTemplate,
        'id' | 'created_at' | 'updated_at' | 'organization_id' | 'created_by'
      >
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('contract_templates')
        .insert({
          ...templateData,
          organization_id: organizationId,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
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
