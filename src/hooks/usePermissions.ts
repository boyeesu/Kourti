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
      let query = supabase
        .from('role_permissions')
        .select('*')
        .order('resource', { ascending: true })
        .order('action', { ascending: true });

      if (roleName) {
        query = query.eq('role_name', roleName);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as RolePermission[];
    },
  });
}

export function useAllRolePermissions() {
  return useQuery({
    queryKey: ['all-role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role_name')
        .order('resource')
        .order('action');

      if (error) throw error;
      return (data || []) as RolePermission[];
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

      const { error } = await supabase
        .from('role_permissions')
        .upsert({
          role_name: permissionData.role_name,
          organization_id: profile.organization_id,
          resource: permissionData.resource,
          action: permissionData.action,
          granted: permissionData.granted,
          created_by: userId,
        })
        .select();

      if (error) throw error;
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

      const { data, error } = await supabase
        .rpc('user_has_permission', {
          p_user_id: userId,
          p_resource: resource,
          p_action: action,
        });

      if (error) throw error;
      return data as boolean;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useCanPerformAction(resource: Resource, action: Action) {
  const { data: canPerform = false } = useUserPermission(resource, action);
  return canPerform;
}