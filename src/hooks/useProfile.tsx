/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

export interface ProfileData {
  first_name?: string;
  last_name?: string;
  phone?: string;
  department?: string;
}

export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
}

export function useProfile() {
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .select(
          `
          id,
          user_id,
          first_name,
          last_name,
          email,
          phone,
          department,
          title,
          avatar_url,
          created_at,
          updated_at
        `
        )
        .eq('user_id', userId as any)
        .single();

      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData: ProfileData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('profiles')
        .update(profileData as any)
        .eq('user_id', userId as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      toast.success('Profile updated successfully', {
        description: 'Your profile information has been saved.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to update profile', { description: error.message });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async ({ newPassword }: PasswordChangeData) => {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Password changed successfully', {
        description: 'Your password has been updated.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to change password', { description: error.message });
    },
  });
}
