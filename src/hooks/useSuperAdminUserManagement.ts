import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLogAdminAction } from './useAdminActions';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

/**
 * Hook to approve a user (platform admin only)
 */
export function useApproveUser() {
  const queryClient = useQueryClient();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (userId: string) => {
      try {
        return invokeNodeApi<unknown>(`/api/v1/admin/users/${userId}/approve`, { method: 'POST' });
      } catch (error) {
        logError('Error approving user', error);
        throw error;
      }
    },
    onSuccess: async (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });

      await logAction.mutateAsync({
        action_type: 'user_approved',
        target_type: 'user',
        target_id: userId,
        details: { user_id: userId },
      });

      toast.success('Success', { description: 'User approved successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to approve user',
      });
    },
  });
}

/**
 * Hook to disable a user (platform admin only)
 */
export function useDisableUser() {
  const queryClient = useQueryClient();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        return invokeNodeApi<unknown>(`/api/v1/admin/users/${params.userId}/disable`, {
          method: 'POST',
          body: { reason: params.reason },
        });
      } catch (error) {
        logError('Error disabling user', error);
        throw error;
      }
    },
    onSuccess: async (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });

      await logAction.mutateAsync({
        action_type: 'user_disabled',
        target_type: 'user',
        target_id: params.userId,
        details: { user_id: params.userId, reason: params.reason },
      });

      toast.success('Success', { description: 'User disabled successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to disable user',
      });
    },
  });
}

/**
 * Hook to delete a user (platform admin only)
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        return invokeNodeApi<unknown>(`/api/v1/admin/users/${params.userId}/delete`, {
          method: 'POST',
          body: { reason: params.reason },
        });
      } catch (error) {
        logError('Error deleting user', error);
        throw error;
      }
    },
    onSuccess: async (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });

      await logAction.mutateAsync({
        action_type: 'user_deleted',
        target_type: 'user',
        target_id: params.userId,
        details: { user_id: params.userId, reason: params.reason },
      });

      toast.success('Success', { description: 'User deleted successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete user',
      });
    },
  });
}

/**
 * Hook to create an organization (platform admin only)
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: {
      name: string;
      email?: string;
      description?: string;
      address?: string;
      phone?: string;
      website?: string;
    }) => {
      try {
        return invokeNodeApi<unknown>('/api/v1/admin/organizations', {
          method: 'POST',
          body: params,
        });
      } catch (error) {
        logError('Error creating organization', error);
        throw error;
      }
    },
    onSuccess: async (orgId, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });

      await logAction.mutateAsync({
        action_type: 'org_created',
        target_type: 'organization',
        target_id: String(orgId || ''),
        details: { name: params.name, email: params.email },
      });

      toast.success('Success', { description: 'Organization created successfully' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to create organization',
      });
    },
  });
}
