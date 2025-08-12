import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseField } from '@/features/cases/types';

/**
 * Create a new case field for a given case type
 */
export function useCreateCaseField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newField: Partial<CaseField>) => {
      const { data, error } = await supabase
        .from('case_fields')
        .insert(newField)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, newField) => {
      if ((newField as Partial<CaseField>).case_type_id) {
        queryClient.invalidateQueries({ queryKey: ['case-fields', (newField as Partial<CaseField>).case_type_id!] });
      }
    },
  });
}
