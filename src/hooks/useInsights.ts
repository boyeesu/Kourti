/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { Case, Contract } from '@/types';

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

  const now = new Date();
  const futureDate = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  // Fetch upcoming cases with hearings
  const {
    data: upcomingCases = [],
    isLoading: casesLoading,
    error: casesError,
  } = useQuery<Case[], Error>({
    queryKey: ['insights-upcoming-cases', organizationId, windowDays],
    queryFn: async () => {
      if (!organizationId) return [];

      const { data, error } = await supabase
        .from('cases')
        .select(
          `
          id,
          title,
          status,
          priority,
          next_hearing_date,
          court,
          client:client_id(id, name)
        `
        )
        .eq('organization_id', organizationId)
        .gte('next_hearing_date', now.toISOString())
        .lte('next_hearing_date', futureDate.toISOString())
        .order('next_hearing_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      return (data || []) as Case[];
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

      const { data, error } = await supabase
        .from('contracts')
        .select(
          `
          id,
          title,
          status,
          value,
          currency,
          end_date,
          client:client_id(id, name)
        `
        )
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .gte('end_date', now.toISOString())
        .lte('end_date', futureDate.toISOString())
        .order('end_date', { ascending: true })
        .limit(5);

      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        value: item.value,
        currency: item.currency,
        end_date: item.end_date,
        client: item.client || null,
        created_at: item.created_at,
        organization_id: item.organization_id,
        created_by: item.created_by,
        updated_at: item.updated_at,
      })) as Contract[];
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
