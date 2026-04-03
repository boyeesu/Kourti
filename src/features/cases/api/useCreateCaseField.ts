/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

interface CreateCaseFieldData {
  case_type_id: string;
  label: string;
  field_key: string;
  data_type: string;
  is_required?: boolean | null;
  options?: Record<string, any> | null;
  field_order?: number | null;
}

/**
 * Create a new case field for a given case type
 */
export function useCreateCaseField() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newField: CreateCaseFieldData) => {
      const data = await invokeNodeApi<Record<string, unknown>>('/api/v1/misc/case-fields', {
        method: 'POST',
        body: newField,
      });
      return data;
    },
    onSuccess: (_data, newField) => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', newField.case_type_id] });
    },
  });
}
