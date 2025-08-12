import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CaseField } from '@/features/cases/types';

/**
 * Update an existing case field
 */
export function useUpdateCaseField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (field: CaseField) => {
      const { data, error } = await supabase
        .from('case_fields')
        .update({
          label: field.label,
          data_type: field.data_type,
          required: field.required,
          options: field.options,
          field_order: field.field_order,
        })
        .eq('id', field.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, field) => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', field.case_type_id] });
    },
  });
}
