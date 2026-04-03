import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface OrganizationUser {
  id: string;
  user_id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  department?: string;
  status: string;
  disabled_at?: string;
  disabled_by?: string;
  verified_at?: string;
  last_login_at?: string;
  created_at: string;
  organization_id: string;
  user_type: 'user' | 'invitation';
  verification_status: 'verified' | 'unverified' | 'pending' | 'expired';
}

export function useOrganizationUsers() {
  const { data: organizationId } = useUserOrganization();

  return useQuery({
    queryKey: ['organization-users', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('No organization ID available');
      }

      return invokeNodeApi<OrganizationUser[]>('/api/v1/organizations/current/users');
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, disable }: { userId: string; disable: boolean }) => {
      return invokeNodeApi(`/api/v1/users/${userId}/status`, {
        method: 'PATCH',
        body: { disable },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      toast.success(variables.disable ? 'User disabled' : 'User enabled', {
        description: variables.disable
          ? 'User has been disabled and cannot access the system'
          : 'User has been enabled and can now access the system',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update user status', { description: error.message });
    },
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      await invokeNodeApi(`/api/v1/invitations/${invitationId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      toast.success('Invitation deleted', {
        description: 'The invitation has been removed successfully',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete invitation', { description: error.message });
    },
  });
}

export function useResendInvitation() {
  return useMutation({
    mutationFn: async (user: OrganizationUser) => {
      await invokeNodeApi('/api/v1/invitations/resend', {
        method: 'POST',
        body: {
          email: user.email,
          firstName: user.first_name || 'User',
          lastName: user.last_name || '',
          role: user.role,
          department: user.department,
          organizationId: user.organization_id,
        },
      });
    },
    onSuccess: () => {
      toast.success('Invitation resent', {
        description: 'The invitation email has been sent again',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to resend invitation', { description: error.message });
    },
  });
}

export function useChangeUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (newRole === 'platform_admin') {
        throw new Error('Platform admin role cannot be assigned through the application.');
      }

      return invokeNodeApi(`/api/v1/users/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      toast.success('Role changed', { description: 'User role has been updated successfully' });
    },
    onError: (error: Error) => {
      toast.error('Failed to change role', { description: error.message });
    },
  });
}
