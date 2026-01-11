import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Organization } from './useAllOrganizations';

/**
 * Hook to fetch a single organization by ID (platform admin only)
 */
export function useOrganization(orgId: string | null) {
  return useQuery({
    queryKey: ['organization', orgId],
    queryFn: async () => {
      if (!orgId) {
        return null;
      }

      try {
        const { data, error } = await supabase.rpc('get_all_organizations');

        if (error) {
          throw error;
        }

        const org = (data || []).find((o: Organization) => o.id === orgId);
        return org || null;
      } catch (error) {
        console.error('Error fetching organization:', error);
        throw error;
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
