import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

interface CreateCaseTypeData {
  name: string;
  description?: string;
}

/**
 * Create a new case type
 */
export function useCreateCaseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newType: CreateCaseTypeData) => {
      const data = await invokeNodeApi<Record<string, unknown>>('/api/v1/misc/case-types', {
        method: 'POST',
        body: newType,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['case-types'] });
    },
  });
}
