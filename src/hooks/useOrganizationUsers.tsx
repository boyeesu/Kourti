import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { toast } from 'sonner';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { useProfile } from '@/hooks/useProfile';
import { env } from '@/lib/env';
import { buildDisplayName, getAuthRedirectUrl } from '@/utils/auth-helpers';
import { logWarn } from '@/lib/logger';

type ProviderName = 'google' | 'microsoft';

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

      const { data, error } = await supabase.rpc('get_organization_users', {
        org_id: organizationId,
      });

      if (error) throw error;
      return (data || []) as OrganizationUser[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useToggleUserStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, disable }: { userId: string; disable: boolean }) => {
      const { data, error } = await supabase.rpc('toggle_user_status', {
        target_user_id: userId,
        disable: disable,
      });

      if (error) throw error;

      // Check if the response contains an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      return data;
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
      const { error } = await supabase.from('invitations').delete().eq('id', invitationId);

      if (error) throw error;
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
  const { data: organization } = useCurrentUserOrganization();
  const { data: profile } = useProfile();

  return useMutation({
    mutationFn: async (user: OrganizationUser) => {
      const organizationName = organization?.name || 'Organization';
      const inviterName = buildDisplayName(profile?.first_name, profile?.last_name, profile?.email);
      const invitationUrl = getAuthRedirectUrl('/auth', env.APP_URL);

      const ssoLinks: Array<{
        provider: ProviderName;
        url: string;
        mode: 'supabase_managed' | 'federated';
      }> = [];
      let ssoEnforced = false;
      const ssoRedirect = getAuthRedirectUrl('/auth/callback', env.APP_URL);

      for (const provider of ['google', 'microsoft'] as ProviderName[]) {
        try {
          const { data: dryRun } = await supabase.functions.invoke('sso-authorize', {
            body: {
              provider,
              email: user.email,
              organization_id: user.organization_id,
              dry_run: true,
            },
          });

          if (!dryRun?.available) continue;

          if (dryRun.enforce_sso) {
            ssoEnforced = true;
          }

          if (dryRun.mode === 'federated') {
            const { data: authData } = await supabase.functions.invoke('sso-authorize', {
              body: {
                provider,
                email: user.email,
                organization_id: user.organization_id,
                redirect_to: ssoRedirect,
              },
            });
            if (authData?.authorization_url) {
              ssoLinks.push({ provider, url: authData.authorization_url, mode: 'federated' });
            }
          } else if (dryRun.mode === 'supabase_managed') {
            try {
              const authorizeUrl = new URL('/auth/v1/authorize', env.SUPABASE_URL);
              authorizeUrl.searchParams.set('provider', provider);
              authorizeUrl.searchParams.set('redirect_to', ssoRedirect);
              if (user.email) {
                authorizeUrl.searchParams.set('login_hint', user.email);
              }
              ssoLinks.push({ provider, url: authorizeUrl.toString(), mode: 'supabase_managed' });
            } catch (urlError) {
              logWarn('Failed to build supabase-managed SSO link', { error: urlError });
            }
          }
        } catch (err) {
          logWarn('Unable to build SSO invitation link', { provider, error: err });
        }
      }

      const { error } = await supabase.functions.invoke('send-invitation-email', {
        body: {
          email: user.email,
          firstName: user.first_name || 'User',
          lastName: user.last_name || '',
          role: user.role,
          department: user.department,
          organizationName,
          inviterName,
          invitationUrl,
          ssoEnforced,
          ssoLinks,
        },
      });

      if (error) throw error;
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

      const { data, error } = await supabase.rpc('change_user_role', {
        p_target_user_id: userId,
        p_new_role_name: newRole,
      });

      if (error) throw error;

      // Check if the response contains an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      return data;
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
