// src/features/activities/api/useActivities.ts
import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import type { CaseActivity } from '@/features/activities/types';

/**
 * Fetch all activities for a given case
 */
export function useActivities(caseId: string) {
  return useQuery({
    queryKey: ['activities', caseId],
    queryFn: async (): Promise<CaseActivity[]> => {
      const data = await invokeNodeApi<CaseActivity[]>('/api/v1/misc/case-activities', {
        query: { caseId },
      });
      return data || [];
    },
    enabled: Boolean(caseId),
    staleTime: 5 * 60 * 1000,
  });
}
