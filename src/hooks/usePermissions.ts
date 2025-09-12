import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

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
  'users'
] as const;

export const ACTIONS = [
  'create',
  'read', 
  'update',
  'delete',
  'manage'
] as const;

export type Resource = typeof RESOURCES[number];
export type Action = typeof ACTIONS[number];

export function useRolePermissions(roleName?: string) {
  return useQuery({
    queryKey: ['role-permissions', roleName],
    queryFn: async () => {
      try {
        // Use supabase.sql to execute raw SQL queries
        const sql = roleName 
          ? `SELECT * FROM role_permissions WHERE role_name = '${roleName}' AND organization_id = get_current_user_organization_id() ORDER BY resource, action`
          : `SELECT * FROM role_permissions WHERE organization_id = get_current_user_organization_id() ORDER BY resource, action`;
        
        const { data, error } = await (supabase as any).sql(sql);
        if (error) throw error;
        return (data || []) as RolePermission[];
      } catch (error) {
        // Fallback: return empty array if table doesn't exist yet
        console.warn('Role permissions table not ready yet:', error);
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
        const sql = `
          SELECT id, role_name, organization_id, resource, action, granted, 
                 created_at, updated_at, created_by 
          FROM role_permissions 
          WHERE organization_id = get_current_user_organization_id()
          ORDER BY role_name, resource, action
        `;
        
        const { data, error } = await (supabase as any).sql(sql);
        if (error) throw error;
        return (data || []) as RolePermission[];
      } catch (error) {
        console.warn('Role permissions table not ready yet:', error);
        return [] as RolePermission[];
      }
    },
  });
}

export function useUpdatePermission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (permissionData: UpdatePermissionData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (!profile) throw new Error('Profile not found');

      try {
        // Use supabase.sql for the upsert
        const sql = `
          INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by)
          VALUES ('${permissionData.role_name}', '${profile.organization_id}', '${permissionData.resource}', '${permissionData.action}', ${permissionData.granted}, '${userId}')
          ON CONFLICT (role_name, organization_id, resource, action) 
          DO UPDATE SET granted = ${permissionData.granted}, updated_at = now()
        `;

        const { error } = await (supabase as any).sql(sql);
        if (error) throw error;
      } catch (error) {
        console.error('Permission update error:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['all-role-permissions'] });
      toast({
        title: "Permission updated",
        description: "Role permission has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update permission", 
        description: error.message,
        variant: "destructive",
      });
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
        const { data, error } = await supabase
          .rpc('user_has_permission', {
            p_user_id: userId,
            p_resource: resource,
            p_action: action,
          });

        if (error) throw error;
        return data as boolean;
      } catch (error) {
        console.warn('Permission check error, defaulting to false:', error);
        return false;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCanPerformAction(resource: Resource, action: Action) {
  const { data: canPerform = false } = useUserPermission(resource, action);
  return canPerform;
}