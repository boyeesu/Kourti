import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { useProfile } from '@/hooks/useProfile';
import { env } from '@/lib/env';
import { buildDisplayName, getAuthRedirectUrl } from '@/utils/auth-helpers';

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
        org_id: organizationId
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
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, disable }: { userId: string; disable: boolean }) => {
      const { data, error } = await supabase.rpc('toggle_user_status', {
        target_user_id: userId,
        disable: disable
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
      toast({
        title: variables.disable ? "User disabled" : "User enabled",
        description: variables.disable 
          ? "User has been disabled and cannot access the system" 
          : "User has been enabled and can now access the system",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user status",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      toast({
        title: "Invitation deleted",
        description: "The invitation has been removed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useResendInvitation() {
  const { toast } = useToast();
  const { data: organization } = useOrganization();
  const { data: profile } = useProfile();

  return useMutation({
    mutationFn: async (user: OrganizationUser) => {
      const organizationName = organization?.name || 'Organization';
      const inviterName = buildDisplayName(
        profile?.first_name,
        profile?.last_name,
        profile?.email
      );
      const invitationUrl = getAuthRedirectUrl('/auth', env.APP_URL);

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
        }
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Invitation resent",
        description: "The invitation email has been sent again",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resend invitation",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}