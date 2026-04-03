import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import type { CaseField } from '@/features/cases/types';

/**
 * Update an existing case field
 */
export function useUpdateCaseField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (field: CaseField) => {
      const data = await invokeNodeApi<Record<string, unknown>>(
        `/api/v1/misc/case-fields/${field.id}`,
        {
          method: 'PATCH',
          body: {
            label: field.label,
            data_type: field.data_type,
            is_required: field.is_required,
            options: field.options,
            field_order: field.field_order,
          },
        }
      );
      return data;
    },
    onSuccess: (_data, field) => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', field.case_type_id] });
    },
  });
}
