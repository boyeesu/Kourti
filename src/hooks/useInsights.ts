import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case, Contract } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

interface InsightsData {
  upcomingCases: Case[];
  upcomingContracts: Contract[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * Hook to get upcoming cases and contracts within a specified window
 */
export function useInsights(windowDays: number = 7): InsightsData {
  const { data: organizationId, isLoading: orgLoading, error: orgError } = useUserOrganization();

  // Fetch upcoming cases with hearings
  const {
    data: upcomingCases = [],
    isLoading: casesLoading,
    error: casesError,
  } = useQuery<Case[], Error>({
    queryKey: ['insights-upcoming-cases', organizationId, windowDays],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await invokeNodeApi<{ upcomingCases: Case[]; upcomingContracts: Contract[] }>(
        '/api/v1/dashboard/insights',
        { query: { windowDays: String(windowDays) } }
      );
      return result.upcomingCases;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch contracts expiring soon
  const {
    data: upcomingContracts = [],
    isLoading: contractsLoading,
    error: contractsError,
  } = useQuery<Contract[], Error>({
    queryKey: ['insights-upcoming-contracts', organizationId, windowDays],
    queryFn: async () => {
      if (!organizationId) return [];

      const result = await invokeNodeApi<{ upcomingCases: Case[]; upcomingContracts: Contract[] }>(
        '/api/v1/dashboard/insights',
        { query: { windowDays: String(windowDays) } }
      );
      return result.upcomingContracts;
    },
    enabled: !!organizationId && !orgLoading && !orgError,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(
    () => ({
      upcomingCases,
      upcomingContracts,
      isLoading: casesLoading || contractsLoading,
      error: casesError || contractsError || null,
    }),
    [upcomingCases, upcomingContracts, casesLoading, contractsLoading, casesError, contractsError]
  );
}

export default useInsights;
