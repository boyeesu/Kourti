import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import type { CaseField } from '@/features/cases/types';

export function useCaseFields(caseTypeId: string) {
  return useQuery<CaseField[], Error>({
    queryKey: ['caseFields', caseTypeId],
    queryFn: async () => {
      if (!caseTypeId) return [] as CaseField[];
      const data = await invokeNodeApi<CaseField[]>('/api/v1/misc/case-fields', {
        query: { caseTypeId },
      });
      return data || [];
    },
    enabled: Boolean(caseTypeId),
    staleTime: 5 * 60 * 1000,
  });
}
