/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';

export interface CreateNotificationData {
  title: string;
  description?: string;
  type:
    | 'info'
    | 'success'
    | 'warning'
    | 'error'
    | 'case'
    | 'client'
    | 'contract'
    | 'calendar'
    | 'document';
  user_id?: string;
}

export interface UpdateNotificationData {
  id: string;
  status?: 'read' | 'unread';
}

/**
 * Hook for fetching user notifications
 */
export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const targetUserId = userId || (await getCurrentUserId());
      if (!targetUserId) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', targetUserId as any)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: true,
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Hook for fetching unread notifications count
 */
export function useUnreadNotificationsCount(userId?: string) {
  return useQuery({
    queryKey: ['notifications', 'unread-count', userId],
    queryFn: async () => {
      const targetUserId = userId || (await getCurrentUserId());
      if (!targetUserId) throw new Error('User not authenticated');

      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', targetUserId as any)
        .eq('status', 'unread' as any);

      if (error) throw error;
      return count || 0;
    },
    enabled: true,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for creating a new notification
 */
export function useCreateNotification() {
  const queryClient = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (notificationData: CreateNotificationData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');
      if (!organizationId) throw new Error('Organization not found');

      const targetUserId = notificationData.user_id || userId;

      const { data, error } = await supabase
        .from('notifications')
        .insert({
          ...notificationData,
          user_id: targetUserId,
          organization_id: organizationId,
          status: 'unread',
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create notification.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Hook for updating notification status
 */
export function useUpdateNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: UpdateNotificationData) => {
      const { data, error } = await supabase
        .from('notifications')
        .update({ status } as any)
        .eq('id', id as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update notification.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Hook for marking all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('notifications')
        .update({ status: 'read' } as any)
        .eq('user_id', userId as any)
        .eq('status', 'unread' as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Success', { description: 'All notifications marked as read.' });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to mark notifications as read.';
      toast.error('Error', { description: errorMessage });
    },
  });
}

/**
 * Hook for deleting a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId as any);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Success', { description: 'Notification deleted successfully.' });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete notification.';
      toast.error('Error', { description: errorMessage });
    },
  });
}
