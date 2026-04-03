/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { invokeNodeApi } from '@/lib/backendApi';

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

      const result = await invokeNodeApi<{ profile: any }>('/api/v1/users/me');
      return result.profile;
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profileData: ProfileData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      return invokeNodeApi<any>('/api/v1/users/me/profile', { method: 'PATCH', body: profileData });
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
      await invokeNodeApi('/api/v1/users/me/password', {
        method: 'POST',
        body: { newPassword },
      });
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
