import { useQuery } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';

interface RoleAssignmentsResult {
  assignments: Array<{
    id: string;
    role_name: string;
    organization_id: string;
    assigned_by: string | null;
    created_at: string;
  }>;
  roles: string[];
  primaryRole: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
}

/**
 * Hook to fetch all role assignments for the current user
 * Returns all roles from user_role_assignments table
 */
export function useUserRoleAssignments() {
  return useQuery({
    queryKey: ['user-role-assignments'],
    queryFn: async () => {
      return invokeNodeApi<RoleAssignmentsResult>('/api/v1/roles/assignments/me');
    },
    staleTime: 5 * 60 * 1000,
  });
}
