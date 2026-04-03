import { useQuery } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface PlatformUser {
  id: string;
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
  organization_id: string | null;
  organization_name: string | null;
  organization_type: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  disabled_at: string | null;
  disabled_by: string | null;
}

/**
 * Hook to fetch all users across all organizations (platform admin only)
 */
export function useAllUsers() {
  return useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      try {
        return invokeNodeApi<PlatformUser[]>('/api/v1/users/all');
      } catch (error) {
        logError('Error fetching all users', error);
        throw error;
      }
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
