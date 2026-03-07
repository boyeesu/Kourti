import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PlatformUser } from './useAllUsers';
import { logError } from '@/lib/logger';

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
        const { data, error } = await supabase.rpc('get_all_users');

        if (error) {
          throw error;
        }

        const user = (data || []).find(
          (u: { user_id?: string; id?: string }) => u.user_id === userId || u.id === userId
        ) as PlatformUser | undefined;
        return user || null;
      } catch (error) {
        logError('Error fetching user', error);
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
