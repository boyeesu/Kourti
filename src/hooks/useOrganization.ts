import { useQuery } from '@tanstack/react-query';
import { Organization } from './useAllOrganizations';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

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
        return await invokeNodeApi<Organization>(`/api/v1/organizations/${orgId}`);
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
      return invokeNodeApi<Organization>('/api/v1/organizations/current');
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
      return invokeNodeApi<
        Array<{
          id: string;
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          role: string | null;
          department: string | null;
          created_at: string;
        }>
      >('/api/v1/organizations/current/members');
    },
    staleTime: 5 * 60 * 1000,
  });
}
