import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  return useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      console.log('🔍 Fetching user organization...');
      
      // No mock data - always fetch from database
      
      try {
        const userId = await getCurrentUserId();

        if (!userId) {
          console.error('❌ User not authenticated');
          throw new Error('User not authenticated. Please sign in.');
        }

        console.log('👤 User ID:', userId);

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', userId as any)
          .single();

        if (error) {
          console.error('❌ Error fetching profile:', error);
          if (error.code === 'PGRST116') {
            // No profile found - user needs to complete setup
            console.log('🏢 No profile found');
            throw new Error('No organization profile found. Please complete your profile setup.');
          }
          throw error;
        }
        
        console.log('🏢 Organization ID:', (profile as any).organization_id);
        return (profile as any).organization_id;
      } catch (error) {
        console.error('Error fetching organization:', error);
        throw error; // Rethrow the error instead of using mock data
      }
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