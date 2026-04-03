import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { invokeNodeApi } from '@/lib/backendApi';

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

      return invokeNodeApi<
        Array<{
          id: string;
          title: string | null;
          description: string | null;
          type: string | null;
          status: string | null;
          created_at: string | null;
        }>
      >('/api/v1/notifications', {
        query: {
          userId: targetUserId,
        },
      });
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

      const response = await invokeNodeApi<{ count: number }>(
        '/api/v1/notifications/unread-count',
        {
          query: {
            userId: targetUserId,
          },
        }
      );
      return response.count || 0;
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

  return useMutation({
    mutationFn: async (notificationData: CreateNotificationData) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      const targetUserId = notificationData.user_id || userId;

      return invokeNodeApi('/api/v1/notifications', {
        method: 'POST',
        body: {
          ...notificationData,
          user_id: targetUserId,
        },
      });
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
      return invokeNodeApi(`/api/v1/notifications/${id}`, {
        method: 'PATCH',
        body: { status },
      });
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

      await invokeNodeApi('/api/v1/notifications/mark-all-read', {
        method: 'POST',
      });
      return;
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
      await invokeNodeApi(`/api/v1/notifications/${notificationId}`, {
        method: 'DELETE',
      });
      return;
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
