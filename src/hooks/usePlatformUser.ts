import { useQuery } from '@tanstack/react-query';
import { PlatformUser } from './useAllUsers';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Hook to fetch a single user by ID (platform admin only)
 *
 * TODO: Create a dedicated `get_user_by_id` RPC function server-side to avoid
 * fetching all users. Current implementation transmits the full user list over
 * the network even when only one user is needed, which is a data minimization concern.
 */
export function usePlatformUser(userId: string | null) {
  return useQuery({
    queryKey: ['platform-user', userId],
    queryFn: async () => {
      if (!userId) {
        return null;
      }

      try {
        return invokeNodeApi<PlatformUser | null>(`/api/v1/users/all/${userId}`);
      } catch (error) {
        logError('Error fetching user', error);
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
