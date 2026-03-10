/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  const { user, session } = useAuth();

  return useQuery({
    queryKey: ['user-organization', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User not authenticated. Please sign in.');
      }

      // Ensure the session is current before querying
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error('No active session. Please sign in again.');
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found - user needs to complete setup
          throw new Error('No organization profile found. Please complete your profile setup.');
        }
        throw error;
      }

      return (profile as any).organization_id;
    },
    // Only enable when we have both user AND a valid session
    enabled: !!user?.id && !!session?.access_token,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes since org rarely changes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors, 401s, or missing profile
      if (
        error?.message === 'User not authenticated' ||
        error?.message === 'No active session. Please sign in again.' ||
        error?.code === 'PGRST116' ||
        error?.code === '401' ||
        error?.message?.includes('JWT') ||
        error?.message?.includes('Unauthorized') ||
        error?.status === 401
      ) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: 1000,
    // Add timeout to prevent infinite loading
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
