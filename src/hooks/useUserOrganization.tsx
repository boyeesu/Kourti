/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getNodeBootstrapUser } from '@/lib/authBootstrap';

// Optimized hook for getting user's organization ID with caching
export function useUserOrganization() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-organization', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User not authenticated. Please sign in.');
      }

      const nodeUser = await getNodeBootstrapUser();
      if (nodeUser?.organizationId) {
        return nodeUser.organizationId;
      }

      throw new Error('No organization profile found. Please complete your profile setup.');
    },
    enabled: !!user?.id,
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
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });
}
