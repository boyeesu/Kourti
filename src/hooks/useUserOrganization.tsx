import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  return useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      console.log('🔍 Fetching user organization...');
      const userId = await getCurrentUserId();

      if (!userId) {
        console.error('❌ User not authenticated');
        return null; // Return null instead of throwing error
      }

      console.log('👤 User ID:', userId);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('❌ Error fetching profile:', error);
        if (error.code === 'PGRST116') {
          // No profile found - user needs to complete setup
          return null;
        }
        throw error;
      }
      
      console.log('🏢 Organization ID:', profile.organization_id);
      return profile.organization_id;
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes since org rarely changes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors or missing profile
      if (error?.message === 'User not authenticated' || error?.code === 'PGRST116') {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: 1000,
  });
}