import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

export interface FxRate {
  settle_currency: string;
  rate: number;
  markup_bps: number;
  source: 'live' | 'cached' | 'fallback' | 'identity';
  fetched_at?: number;
}

/**
 * Live USD → PAYSTACK_CURRENCY rate as returned by the backend. Already
 * includes the configured markup, so callers should just multiply by the
 * USD amount to get the NGN figure the user will actually be charged.
 *
 * Cached for 10 minutes — well under the backend's 1h cache TTL.
 */
export function useFxRate() {
  return useQuery({
    queryKey: ['fx', 'usd-ngn'],
    queryFn: () => invokeNodeApi<FxRate>('/api/v1/misc/fx/usd-ngn'),
    staleTime: 10 * 60 * 1000,
  });
}
