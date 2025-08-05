import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  return useQuery({
    queryKey: ['user-organization'],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      
      if (!user.user?.id) {
        throw new Error('User not authenticated');
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', user.user.id)
        .single();

      if (error) throw error;
      
      return profile.organization_id;
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes since org rarely changes
    gcTime: 15 * 60 * 1000, // Keep in cache for 15 minutes
    retry: 3,
    retryDelay: 1000,
  });
}