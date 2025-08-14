
import { useMemo } from 'react';
import { useCases } from './useCases';
import { useContracts } from './useContracts';
import type { Case, Contract } from '@/types';

const DEFAULT_WINDOW_DAYS = 7;

export function useInsights(windowDays = DEFAULT_WINDOW_DAYS) {
  const { data: casesData = { cases: [], count: 0 } } = useCases();
  const { data: contractsData = { items: [], total: 0 } } = useContracts();

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + windowDays);

  const upcomingCases = useMemo(
    () =>
      casesData.cases
        .filter((c: Case) => c.next_hearing_date)
        .map((c: Case) => ({ ...c, next_hearing_date: c.next_hearing_date! }))
        .filter((c: Case & { next_hearing_date: string }) => {
          const d = new Date(c.next_hearing_date);
          return d >= now && d <= cutoff;
        }),
    [casesData.cases, windowDays]
  );

  const upcomingContracts = useMemo(
    () =>
      contractsData.items
        .filter((c: Contract) => c.end_date)
        .map((c: Contract) => ({ ...c, _insight_date: new Date(c.end_date!).toISOString() }))
        .filter((c: Contract & { _insight_date: string }) => {
          const d = new Date(c._insight_date);
          return d >= now && d <= cutoff;
        }),
    [contractsData.items, windowDays]
  );

  return { upcomingCases, upcomingContracts };
}
