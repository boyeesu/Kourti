import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLogAdminAction } from './useAdminActions';

/**
 * Hook to approve a user (platform admin only)
 */
export function useApproveUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (userId: string) => {
      try {
        const { data, error } = await supabase.rpc('approve_user', {
          p_user_id: userId,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error approving user:', error);
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

      toast({
        title: 'Success',
        description: 'User approved successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve user',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to disable a user (platform admin only)
 */
export function useDisableUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        const { data, error } = await supabase.rpc('disable_user', {
          p_user_id: params.userId,
          p_reason: params.reason || undefined,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error disabling user:', error);
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

      toast({
        title: 'Success',
        description: 'User disabled successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to disable user',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to delete a user (platform admin only)
 */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logAction = useLogAdminAction();

  return useMutation({
    mutationFn: async (params: { userId: string; reason?: string }) => {
      try {
        const { data, error } = await supabase.rpc('delete_user_safe', {
          p_user_id: params.userId,
          p_reason: params.reason || undefined,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error deleting user:', error);
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

      toast({
        title: 'Success',
        description: 'User deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete user',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook to create an organization (platform admin only)
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
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
        const { data, error } = await supabase.rpc('create_organization_admin', {
          p_name: params.name,
          p_email: params.email || undefined,
          p_description: params.description || undefined,
          p_address: params.address || undefined,
          p_phone: params.phone || undefined,
          p_website: params.website || undefined,
        });

        if (error) {
          throw error;
        }

        return data;
      } catch (error) {
        console.error('Error creating organization:', error);
        throw error;
      }
    },
    onSuccess: async (orgId, params) => {
      queryClient.invalidateQueries({ queryKey: ['all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      
      await logAction.mutateAsync({
        action_type: 'org_created',
        target_type: 'organization',
        target_id: orgId,
        details: { name: params.name, email: params.email },
      });

      toast({
        title: 'Success',
        description: 'Organization created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create organization',
        variant: 'destructive',
      });
    },
  });
}
