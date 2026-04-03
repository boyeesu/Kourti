import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { logError, logWarn } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface RolePermission {
  id: string;
  role_name: string;
  organization_id: string;
  resource: string;
  action: string;
  granted: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface UpdatePermissionData {
  role_name: string;
  resource: string;
  action: string;
  granted: boolean;
}

export const RESOURCES = [
  'cases',
  'clients',
  'documents',
  'contracts',
  'calendars',
  'invoices',
  'tasks',
  'settings',
  'users',
] as const;

export const ACTIONS = ['create', 'read', 'update', 'delete', 'manage'] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

export function useRolePermissions(roleName?: string) {
  return useQuery({
    queryKey: ['role-permissions', roleName],
    queryFn: async () => {
      try {
        return invokeNodeApi<RolePermission[]>('/api/v1/roles/permissions', {
          query: { roleName },
        });
      } catch (error) {
        logWarn('Role permissions table not ready yet', { error });
        return [] as RolePermission[];
      }
    },
  });
}

export function useAllRolePermissions() {
  return useQuery({
    queryKey: ['all-role-permissions'],
    queryFn: async () => {
      try {
        return invokeNodeApi<RolePermission[]>('/api/v1/roles/permissions');
      } catch (error) {
        logWarn('Role permissions table not ready yet', { error });
        return [] as RolePermission[];
      }
    },
  });
}

export function useUpdatePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (permissionData: UpdatePermissionData) => {
      await invokeNodeApi('/api/v1/roles/permissions', {
        method: 'PUT',
        body: permissionData,
      });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['all-role-permissions'] });
      toast.success('Permission updated', {
        description: 'Role permission has been updated successfully.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update permission', { description: error.message });
    },
  });
}

export function useUserPermission(resource: Resource, action: Action) {
  return useQuery({
    queryKey: ['user-permission', resource, action],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) return false;

      try {
        const result = await invokeNodeApi<{ granted: boolean }>(
          '/api/v1/roles/permissions/check',
          {
            query: { resource, action },
          }
        );
        return result.granted;
      } catch (error) {
        logError('Permission check error, denying access for security', error);
        return false;
      }
    },
    staleTime: 60 * 1000, // 1 minute - reduced from 5 min for faster permission revocation
  });
}

export function useCanPerformAction(resource: Resource, action: Action) {
  const { data: canPerform = false } = useUserPermission(resource, action);
  return canPerform;
}
