import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseField } from '../types.js';

/**
 * Create a new case field for a given case type
 */
export function useCreateCaseField() {
  const queryClient = useQueryClient();
  return useMutation<CaseField, Error, Partial<CaseField>>(
    async (newField) => {
      const { data, error } = await supabase
        .from('case_fields')
        .insert(newField)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    {
      onSuccess: (_, newField) => {
        if (newField.case_type_id) {
          queryClient.invalidateQueries({ queryKey: ['case-fields', newField.case_type_id] });
        }
      },
    }
  );
}
