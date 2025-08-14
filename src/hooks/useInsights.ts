
import { useMemo } from 'react';
import { useCases } from './useCases';
import { useContracts } from './useContracts';
import type { Case } from '@/types';

const DEFAULT_WINDOW_DAYS = 7;

export function useInsights(windowDays = DEFAULT_WINDOW_DAYS) {
  const { data: cases = [] } = useCases();
  const { data: contracts = [] } = useContracts();

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + windowDays);

  const upcomingCases = useMemo(
    () =>
      cases
        .filter((c: Case) => c.next_hearing_date)
        .map((c: Case) => ({ ...c, next_hearing_date: c.next_hearing_date! }))
        .filter((c: Case & { next_hearing_date: string }) => {
          const d = new Date(c.next_hearing_date);
          return d >= now && d <= cutoff;
        }),
    [cases, windowDays]
  );

  const upcomingContracts = useMemo(
    () =>
      contracts
        .filter((c: any) => c.end_date)
        .map((c: any) => ({ ...c, _insight_date: new Date(c.end_date!).toISOString() }))
        .filter((c: any) => {
          const d = new Date(c._insight_date);
          return d >= now && d <= cutoff;
        }),
    [contracts, windowDays]
  );

  return { upcomingCases, upcomingContracts };
}
