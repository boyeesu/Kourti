import { useQuery } from '@tanstack/react-query';
import { logWarn } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface GlobalRole {
  role: string;
  display_name: string;
  description?: string;
}

export interface CustomRole {
  id: string;
  role_name: string;
  description?: string;
  organization_id: string;
}

export function useAllRoles() {
  return useQuery({
    queryKey: ['all-roles'],
    queryFn: async () => {
      try {
        return invokeNodeApi<
          Array<{
            id: string;
            role: string;
            role_name: string;
            display_name: string;
            description?: string;
            source: 'global' | 'custom';
          }>
        >('/api/v1/roles/all');
      } catch (error) {
        logWarn('Error fetching roles, returning system defaults', { error });
        // Return system defaults if there's an error
        return [
          {
            id: 'superadmin',
            role: 'superadmin',
            role_name: 'superadmin',
            display_name: 'Super Administrator',
            source: 'global' as const,
          },
          {
            id: 'admin',
            role: 'admin',
            role_name: 'admin',
            display_name: 'Administrator',
            source: 'global' as const,
          },
          {
            id: 'user',
            role: 'user',
            role_name: 'user',
            display_name: 'User',
            source: 'global' as const,
          },
        ];
      }
    },
  });
}
