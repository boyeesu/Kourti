import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { logError, logInfo } from '@/lib/logger';
import type { Profile } from '@/lib/types/database';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';

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

      // Get current user's profile and org info
      const [{ data: profile, error: profileError }, { error: authError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name,last_name,organization_id')
          .eq('user_id', currentUserId)
          .single(),
        supabase.auth.getUser(),
      ]);

      if (profileError) throw profileError;
      if (authError) throw authError;

      const typedProfile = profile as Profile | null;
      if (!typedProfile?.organization_id) {
        throw new Error('Current user is not associated with an organization');
      }

      const { error: organizationError } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', typedProfile.organization_id)
        .single();

      if (organizationError) throw organizationError;

      // NEW FLOW: Create the user with temp password via edge function
      logInfo('Creating invited user with temp password', { email: userData.email });

      const { data: createResult, error: createError } = await invokeFunctionWithCsrf<{
        success?: boolean;
        error?: string;
        userId?: string;
      }>('create-invited-user', {
        body: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role ?? 'user',
          department: userData.department,
          organizationId: typedProfile.organization_id,
          invitedBy: currentUserId,
        },
      });

      if (createError) {
        logError('Failed to create invited user', { error: createError });
        throw new Error(createError.message || 'Failed to create user account');
      }

      if (!createResult?.success) {
        throw new Error(createResult?.error || 'Failed to create user account');
      }

      logInfo('Invited user created successfully', { userId: createResult.userId });

      // Note: Password is sent via email server-side by the create-invited-user function
      // We no longer receive or handle passwords in the frontend for security

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

      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id, is_organization_creator')
        .eq('user_id', userId || '')
        .single();

      if (profileError) throw profileError;

      // Get roles from user_role_assignments
      const { data: roleAssignments, error: roleError } = await supabase
        .from('user_role_assignments')
        .select('role_name')
        .eq('user_id', userId || '')
        .eq('organization_id', profile.organization_id);

      if (roleError) throw roleError;

      // Get primary role (prioritize superadmin > admin > user > custom roles)
      const roles = roleAssignments?.map((r) => r.role_name) || [];
      const primaryRole = roles.includes('superadmin')
        ? 'superadmin'
        : roles.includes('admin')
          ? 'admin'
          : roles.includes('user')
            ? 'user'
            : roles[0] || 'user';

      return {
        role: primaryRole,
        roles: roles, // All roles for the user
        is_organization_creator: profile.is_organization_creator,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
