import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PlatformUser } from './useAllUsers';

/**
 * Hook to fetch a single user by ID (platform admin only)
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

        const user = (data || []).find((u: PlatformUser) => u.user_id === userId || u.id === userId);
        return user || null;
      } catch (error) {
        console.error('Error fetching user:', error);
        throw error;
      }
    },
    enabled: !!userId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
