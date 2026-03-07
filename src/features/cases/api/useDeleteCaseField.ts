/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Delete a case field by ID
 */
export function useDeleteCaseField(caseTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fieldId: string) => {
      const { error } = await supabase
        .from('case_fields')
        .delete()
        .eq('id', fieldId as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', caseTypeId] });
    },
  });
}
