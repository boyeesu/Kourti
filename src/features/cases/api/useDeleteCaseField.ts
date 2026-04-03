import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Delete a case field by ID
 */
export function useDeleteCaseField(caseTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fieldId: string) => {
      await invokeNodeApi(`/api/v1/misc/case-fields/${fieldId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-fields', caseTypeId] });
    },
  });
}
