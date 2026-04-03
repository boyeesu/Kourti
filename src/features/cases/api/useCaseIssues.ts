import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import { CaseIssue } from '../types';

export const useCaseIssues = (caseTypeId?: string) => {
  return useQuery({
    queryKey: ['case-issues', caseTypeId],
    queryFn: async (): Promise<CaseIssue[]> => {
      if (!caseTypeId) {
        return [];
      }

      const data = await invokeNodeApi<CaseIssue[]>('/api/v1/misc/case-issues', {
        query: { caseTypeId },
      });

      return data || [];
    },
    enabled: !!caseTypeId,
  });
};
