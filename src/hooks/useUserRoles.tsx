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
      return (data as any) as UserRole[];
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
        .eq('user_id', userId as any)
        .single();

      if (!profile) throw new Error('Profile not found');

      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          role_name: roleData.role_name,
          description: roleData.description,
          organization_id: (profile as any).organization_id,
          created_by: userId,
          permissions: [], // Permissions will be initialized by trigger
        } as any)
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
        .eq('id', roleId as any);

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

export function useUsersWithRoles() {
  return useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          user_id,
          first_name,
          last_name,
          email,
          role,
          department,
          title,
          avatar_url,
          user_role_assignments(role_name)
        `)
        .order('first_name');

      if (error) throw error;
      
      // Transform data to include custom roles
      return data.map((user: any) => ({
        ...user,
        custom_roles: user.user_role_assignments?.map((assignment: any) => assignment.role_name) || []
      }));
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const currentUserId = await getCurrentUserId();
      if (!currentUserId) throw new Error('User not authenticated');
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('user_id', currentUserId as any)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Delete all existing role assignments for this user
      await supabase
        .from('user_role_assignments')
        .delete()
        .eq('user_id', userId as any)
        .eq('organization_id', (profile as any).organization_id);

      // Create new role assignment
      const { error } = await supabase
        .from('user_role_assignments')
        .insert({
          user_id: userId,
          role_name: role,
          organization_id: (profile as any).organization_id,
          assigned_by: currentUserId,
        } as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast({
        title: "User role updated",
        description: "The user's role has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update user role",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}