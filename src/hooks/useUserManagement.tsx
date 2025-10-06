import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { env } from '@/lib/env';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { buildDisplayName, getAuthRedirectUrl } from '@/utils/auth-helpers';

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
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userData: InviteUserData) => {
      // First create the invitation record in the database
      const params: Record<string, any> = {
        p_email: userData.email,
        p_first_name: userData.firstName,
        p_last_name: userData.lastName,
        p_role: userData.role ?? 'user',
        p_department: userData.department || null,
      };

      const { data, error } = await supabase.rpc('invite_user_to_organization', params as any);

      if (error) throw error;
      
      // Check if the response indicates an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      const currentUserId = await getCurrentUserId();

      if (!currentUserId) {
        throw new Error('Unable to determine current user');
      }

      const [{ data: profile, error: profileError }, { data: authUser, error: authError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name,last_name,organization_id')
          .eq('user_id', currentUserId as any)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (profileError) {
        throw profileError;
      }

      if (authError) {
        throw authError;
      }

      if (!(profile as any)?.organization_id) {
        throw new Error('Current user is not associated with an organization');
      }

      const { data: organizationData, error: organizationError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', (profile as any).organization_id)
        .single();

      if (organizationError) {
        throw organizationError;
      }

      const organizationName = organizationData?.name || 'Organization';
      const inviterName = buildDisplayName(
        (profile as any)?.first_name as string | null,
        (profile as any)?.last_name as string | null,
        authUser.user?.email ?? undefined
      );

      const invitationUrl = getAuthRedirectUrl('/auth', env.APP_URL);

      // Send invitation email using the proper email function
      try {
        const { data: emailData, error: emailError } = await supabase.functions.invoke('send-invitation-email', {
          body: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            role: userData.role ?? 'user',
            department: userData.department,
            organizationName,
            inviterName,
            invitationUrl,
          }
        });

        if (emailError) {
          logWarn('Failed to send invitation email', { error: emailError });
          // Don't fail the invitation if email fails, but show a warning
          toast({
            title: "Invitation created with warning",
            description: `The invitation was created but email delivery failed: ${emailError.message}`,
            variant: "default",
          });
        } else if (emailData?.error) {
          logWarn('Invitation email function returned error', { error: emailData.error });
          toast({
            title: "Invitation created with warning",
            description: `The invitation was created but there was an email issue: ${emailData.error}`,
            variant: "default",
          });
        } else {
          const invitationId = (data as { invitation_id?: string | number } | null | undefined)?.invitation_id;
          logInfo('Invitation email sent successfully', { invitationId });
        }
      } catch (emailError: any) {
        logWarn('Failed to send invitation email', { error: emailError });
        // Still show warning but don't fail the process
        toast({
          title: "Invitation created with warning",
          description: `The invitation was created but email delivery may have failed: ${emailError.message || 'Unknown error'}`,
          variant: "default",
        });
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['organization-users'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({
        title: "User invited successfully",
        description: "The user invitation has been created and they will receive an email to join.",
      });
      return data;
    },
    onError: (error: Error) => {
      logError('Failed to invite user', { error });
      toast({
        title: "Failed to invite user",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUserRole() {
  return useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_organization_creator')
        .eq('user_id', userId as any || '')
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}