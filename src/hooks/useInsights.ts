import { useCases } from './useCases';
import { useContracts } from './useContracts';
import { Case, Contract } from '@/types';

export function useInsights(windowDays: number = 7) {
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
  const contractsList = Array.isArray(contractsData) ? contractsData : contractsData?.contracts || [];
  const upcomingContracts = contractsList
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
