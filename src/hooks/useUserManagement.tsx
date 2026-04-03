import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { logError, logInfo } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

export interface InviteUserData {
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  roleId?: string;
  department?: string;
}

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: InviteUserData) => {
      const currentUserId = await getCurrentUserId();

      if (!currentUserId) {
        throw new Error('Unable to determine current user');
      }

      logInfo('Creating invited user via Node backend', { email: userData.email });

      const createResult = await invokeNodeApi<{
        success?: boolean;
        error?: string;
        userId?: string;
      }>('/api/v1/users/invite', {
        method: 'POST',
        body: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role ?? 'user',
          roleId: userData.roleId,
          department: userData.department,
        },
      });

      if (!createResult?.success) {
        throw new Error(createResult?.error || 'Failed to create user account');
      }

      logInfo('Invited user created successfully', { userId: createResult.userId });

      return { success: true, userId: createResult.userId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success('User added successfully', {
        description: 'The user has been created and will receive an email with login credentials.',
      });
      return data;
    },
    onError: (error: Error) => {
      logError('Failed to invite user', { error });
      toast.error('Failed to invite user', { description: error.message });
    },
  });
}

export function useUserRole() {
  return useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const result = await invokeNodeApi<{
        assignments: unknown[];
        roles: string[];
        primaryRole: string;
        isSuperAdmin: boolean;
        isAdmin: boolean;
      }>('/api/v1/roles/assignments/me');
      const me = await invokeNodeApi<{ profile: Record<string, unknown> | null }>(
        '/api/v1/users/me'
      );
      return {
        role: result.primaryRole,
        roles: result.roles,
        is_organization_creator: me.profile?.is_organization_creator || false,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
