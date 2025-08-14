
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCases } from './useCases';
import { useContracts } from './useContracts';
import { useUserOrganization } from './useUserOrganization';
import { Case, Contract } from '@/types';

export function useInsights(windowDays: number = 7) {
  const { data: organizationId } = useUserOrganization();
  const { data: casesData } = useCases();
  const { data: contractsData } = useContracts();

  // Filter upcoming cases with hearings in the next windowDays
  const upcomingCases = casesData?.cases?.filter((c: Case) => {
    if (!c.next_hearing_date) return false;
    const hearingDate = new Date(c.next_hearing_date);
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    return hearingDate >= now && hearingDate <= windowEnd;
  }) || [];

  // Filter contracts expiring in the next windowDays
  const upcomingContracts = (Array.isArray(contractsData) ? contractsData : contractsData?.items || [])
    .filter((contract: Contract) => {
      if (!contract.end_date) return false;
      const endDate = new Date(contract.end_date);
      const now = new Date();
      const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
      return endDate >= now && endDate <= windowEnd;
    });

  return {
    upcomingCases,
    upcomingContracts,
  };
}
