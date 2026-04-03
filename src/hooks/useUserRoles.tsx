/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface UserRole {
  id: string;
  organization_id: string;
  role_name: string;
  description?: string;
  permissions: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserRoleData {
  role_name: string;
  description?: string;
  permissions?: string[];
}

export function useUserRoles() {
  return useQuery({
    queryKey: ['user-roles'],
    queryFn: async () => {
      return invokeNodeApi<UserRole[]>('/api/v1/roles/org');
    },
  });
}

export function useCreateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleData: CreateUserRoleData) => {
      if (roleData.role_name === 'platform_admin') {
        throw new Error(
          'Cannot create a role named "platform_admin". This is a reserved system role.'
        );
      }

      return invokeNodeApi('/api/v1/roles/org', {
        method: 'POST',
        body: roleData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('Role created successfully', {
        description: 'The new role has been added to your organization.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to create role', { description: error.message });
    },
  });
}

export function useDeleteUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      await invokeNodeApi(`/api/v1/roles/org/${roleId}`, { method: 'DELETE' });
      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast.success('Role deleted successfully', {
        description: 'The role has been removed from your organization.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete role', { description: error.message });
    },
  });
}

export function useUsersWithRoles() {
  return useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      return invokeNodeApi<any[]>('/api/v1/roles/users-with-roles');
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      // Platform admin can only be assigned via direct DB access
      if (role === 'platform_admin') {
        throw new Error('Platform admin role cannot be assigned through the application.');
      }

      await invokeNodeApi(`/api/v1/users/${userId}/role`, {
        method: 'PATCH',
        body: { role },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['user-role-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['user-permission'] });
      toast.success('User role updated', {
        description: "The user's role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update user role', { description: error.message });
    },
  });
}
