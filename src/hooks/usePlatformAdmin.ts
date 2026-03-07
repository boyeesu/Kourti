import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { logError } from '@/lib/logger';

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
        // SECURITY: p_user_id is passed for the RPC function signature, but the server
        // function MUST validate this against auth.uid() to prevent privilege escalation.
        // Ideally, the server function should use auth.uid() directly and ignore this parameter.
        const { data, error } = await supabase.rpc('is_platform_admin', {
          p_user_id: user.id,
        });

        if (error) {
          logError('Error checking platform admin status', error);
          return false;
        }

        return Boolean(data);
      } catch (error) {
        logError('Error checking platform admin status', error);
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
    // SECURITY: p_user_id is passed for the RPC function signature, but the server
    // function MUST validate this against auth.uid() to prevent privilege escalation.
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
