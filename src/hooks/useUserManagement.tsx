import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      const params: Record<string, any> = {
        p_email: userData.email,
        p_first_name: userData.firstName,
        p_last_name: userData.lastName,
        p_department: userData.department || null,
      };
      if (userData.role) {
        params.p_role = userData.role;
      }
      if (userData.roleId) {
        params.p_role_id = userData.roleId;
      }

      const { data, error } = await supabase.rpc('invite_user_to_organization', params);

      if (error) throw error;
      
      // Check if the response indicates an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      toast({
        title: "User invited successfully",
        description: "The user invitation has been created.",
      });
      return data; // Return role information
    },
    onError: (error: Error) => {
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
      const { data, error } = await supabase
        .from('profiles')
        .select('role, is_organization_creator')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}