import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook to check if the current user is a platform admin
 */
export function usePlatformAdmin() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['platform-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        return false;
      }

      try {
        const { data, error } = await supabase.rpc('is_platform_admin', {
          p_user_id: user.id,
        });

        if (error) {
          console.error('Error checking platform admin status:', error);
          return false;
        }

        return Boolean(data);
      } catch (error) {
        console.error('Error checking platform admin status:', error);
        return false;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Get platform admin status synchronously (for use outside React components)
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_platform_admin', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error checking platform admin status:', error);
      return false;
    }

    return Boolean(data);
  } catch (error) {
    console.error('Error checking platform admin status:', error);
    return false;
  }
}
