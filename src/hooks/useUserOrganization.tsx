import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-organization', user?.id],
    queryFn: async () => {
      console.log('🔍 Fetching user organization...');
      
      if (!user?.id) {
        console.error('❌ User not authenticated');
        throw new Error('User not authenticated. Please sign in.');
      }

      console.log('👤 User ID:', user.id);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.id)
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
    },
    enabled: !!user?.id,
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
    // Add timeout to prevent infinite loading
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}