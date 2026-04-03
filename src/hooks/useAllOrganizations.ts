import { useQuery } from '@tanstack/react-query';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface Organization {
  id: string;
  name: string;
  type: string | null;
  email: string | null;
  description: string | null;
  address: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  user_count: number;
  status: string;
  is_active: boolean;
}

/**
 * Hook to fetch all organizations (platform admin only)
 */
export function useAllOrganizations() {
  return useQuery({
    queryKey: ['all-organizations'],
    queryFn: async () => {
      try {
        return invokeNodeApi<Organization[]>('/api/v1/organizations/all');
      } catch (error) {
        logError('Error fetching all organizations', error);
        throw error;
      }
    },
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}
