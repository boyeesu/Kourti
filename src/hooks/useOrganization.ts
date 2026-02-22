import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Organization } from './useAllOrganizations';
import { getCurrentUserId } from './useCurrentUser';
import { logError } from '@/lib/logger';

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

        const org = (data || []).find((o: any) => o.id === orgId) as Organization | undefined;
        return org || null;
      } catch (error) {
        logError('Error fetching organization', error);
        throw error;
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Hook to fetch the current user's organization
 */
export function useCurrentUserOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      // First get the user's organization ID from their profile
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any || '')
        .single();

      if (!(profile as any)?.organization_id) {
        return null;
      }

      // Then get the organization details
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', (profile as any).organization_id)
        .single();

      if (error) throw error;
      return (data as any) as Organization;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Hook to fetch all members of the current user's organization
 */
export function useOrganizationMembers() {
  return useQuery({
    queryKey: ['organization-members'],
    queryFn: async () => {
      // Get the user's organization ID first
      const userId = await getCurrentUserId();
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId as any || '')
        .single();

      if (!(profile as any)?.organization_id) {
        return [];
      }

      // Get all members in the organization
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email, role, department, created_at')
        .eq('organization_id', (profile as any).organization_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
