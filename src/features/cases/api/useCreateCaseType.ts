/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

interface CreateCaseTypeData {
  name: string;
  description?: string;
}

/**
 * Create a new case type
 */
export function useCreateCaseType() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (newType: CreateCaseTypeData) => {
      const userId = await getCurrentUserId();

      const typeData = {
        ...newType,
        organization_id: organizationId,
        created_by: userId,
      };

      const { data, error } = await supabase
        .from('case_types')
        .insert(typeData as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-types'] });
    },
  });
}
