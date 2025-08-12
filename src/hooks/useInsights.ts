import { useMemo } from 'react';
import { useCases } from './useCases';
import { useContracts } from './useContracts';

type Insight = {
  id: string;
  title: string;
  date: string;
  type: 'case' | 'contract';
};

const DEFAULT_WINDOW_DAYS = 7;

/**
 * Returns upcoming case hearings and contract expirations within the next `windowDays` days.
 */
export function useInsights(windowDays = DEFAULT_WINDOW_DAYS) {
  const { cases = [] } = useCases();
  const { data: contracts = [] } = useContracts();
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
    [cases, now, cutoff]
  );

  const upcomingContracts = useMemo(
    () =>
      (contracts as any[])
        .filter((c) => c.endDate || c.end_date)
        .map((c) => ({
          ...c,
          _insight_date: new Date(c.endDate || c.end_date).toISOString(),
        }))
        .filter((c) => {
          const d = new Date(c._insight_date);
          return d >= now && d <= cutoff;
        }),
    [contracts, now, cutoff]
  );

  return { upcomingCases, upcomingContracts };
}
