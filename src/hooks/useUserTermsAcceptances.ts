import { useQuery } from '@tanstack/react-query';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

export interface TermsAcceptance {
  id: string;
  terms_version: string;
  privacy_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Fetch a user's Terms of Service / Privacy Policy acceptance history
 * (platform admin only). Append-only audit records, newest-first.
 */
export function useUserTermsAcceptances(userId: string | null) {
  return useQuery({
    queryKey: ['user-terms-acceptances', userId],
    queryFn: async () => {
      if (!userId) {
        return [];
      }

      try {
        const res = await invokeNodeApi<{ acceptances: TermsAcceptance[] }>(
          `/api/v1/admin/users/${userId}/terms-acceptances`
        );
        return res.acceptances ?? [];
      } catch (error) {
        logError('Error fetching terms acceptances', error);
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
