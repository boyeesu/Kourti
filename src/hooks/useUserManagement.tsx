import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

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
        p_role: userData.role ?? 'user',
        p_department: userData.department || null,
      };

      const { data, error } = await supabase.rpc('invite_user_to_organization', params as any);

      if (error) throw error;
      
      // Check if the response indicates an error
      if (data && typeof data === 'object' && 'error' in data) {
        throw new Error(data.error as string);
      }

        // Send invitation email if invitation was successful  
        try {
          await supabase.functions.invoke('send-invitation-email', {
            body: {
              email: userData.email,
              firstName: userData.firstName,
              role: userData.role ?? 'user',
              organizationName: 'Your Organization', // You might want to fetch this
              inviterName: 'Admin' // You might want to fetch current user's name
            }
          });
        } catch (emailError) {
          console.warn('Failed to send invitation email:', emailError);
          // Don't fail the invitation if email fails
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