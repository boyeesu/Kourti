import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

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
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('role_name');

      if (error) throw error;
      return data as UserRole[];
    },
  });
}

export function useCreateUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (roleData: CreateUserRoleData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', userId)
        .single();

      if (!profile) throw new Error('Profile not found');

      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          ...roleData,
          organization_id: profile.organization_id,
          created_by: userId,
          permissions: roleData.permissions || [],
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast({
        title: "Role created successfully",
        description: "The new role has been added to your organization.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      toast({
        title: "Role deleted successfully",
        description: "The role has been removed from your organization.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}