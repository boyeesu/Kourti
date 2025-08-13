import { useMemo } from 'react';
import { useCases } from './useCases';
import { useContracts } from './useContracts';

const DEFAULT_WINDOW_DAYS = 7;

export function useInsights(windowDays = DEFAULT_WINDOW_DAYS) {
  const { data: casesData } = useCases();
  const { data: contracts = [] } = useContracts();

  const cases = casesData?.cases || [];
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + windowDays);

  const upcomingCases = useMemo(
    () =>
      cases
        .filter((c) => c.next_hearing_date)
        .map((c) => ({ ...c, next_hearing_date: c.next_hearing_date! }))
        .filter((c) => {
          const d = new Date(c.next_hearing_date);
          return d >= now && d <= cutoff;
        }),
    [cases, windowDays]
  );

  const upcomingContracts = useMemo(
    () =>
      contracts
        .filter((c) => c.end_date)
        .map((c) => ({ ...c, _insight_date: new Date(c.end_date!).toISOString() }))
        .filter((c) => {
          const d = new Date(c._insight_date);
          return d >= now && d <= cutoff;
        }),
    [contracts, windowDays]
  );

  return { upcomingCases, upcomingContracts };
}
