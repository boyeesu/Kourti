/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { Notification } from '@/components/ui/notifications';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { invokeNodeApi } from '@/lib/backendApi';

export interface NotificationFilters {
  status?: 'read' | 'unread' | 'all';
  type?: string;
  archived?: boolean;
  search?: string;
}

export interface NotificationPreferences {
  id: string;
  user_id: string;
  organization_id: string;
  email_enabled: boolean;
  email_frequency: 'immediate' | 'daily' | 'weekly' | 'never';
  in_app_enabled: boolean;
  case_notifications: boolean;
  client_notifications: boolean;
  document_notifications: boolean;
  contract_notifications: boolean;
  calendar_notifications: boolean;
  task_notifications: boolean;
  invoice_notifications: boolean;
  general_notifications: boolean;
}

export function useNotificationsDb(orgId: string, filters?: NotificationFilters) {
  const transformNotifications = (rows: any[]) => {
    return rows.map((item: any) => ({
      ...item,
      date: item.created_at || new Date().toISOString(),
      read: item.status === 'read',
      type: item.type || 'info',
    })) as Notification[];
  };

  const query = useQuery({
    queryKey: ['notifications', orgId, filters],
    queryFn: async () => {
      const data = await invokeNodeApi<any[]>('/api/v1/notifications', {
        query: {
          status: filters?.status,
          type: filters?.type,
          archived: filters?.archived,
          search: filters?.search,
        },
      });

      return transformNotifications(data || []);
    },
    enabled: !!orgId,
    staleTime: 5 * 1000,
    gcTime: 60 * 1000,
    refetchInterval: 5 * 1000,
  });

  return query;
}

export function useNotificationPreferences(orgId: string) {
  return useQuery({
    queryKey: ['notification-preferences', orgId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId || !orgId) return null;

      return invokeNodeApi<NotificationPreferences | null>('/api/v1/notifications/preferences');
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      preferences: Partial<NotificationPreferences> & { organization_id: string }
    ) => {
      const userId = await getCurrentUserId();
      if (!userId) throw new Error('User not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { organization_id: _orgId, ...restPreferences } = preferences;

      return invokeNodeApi<NotificationPreferences>('/api/v1/notifications/preferences', {
        method: 'PUT',
        body: restPreferences,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['notification-preferences', variables.organization_id],
      });
    },
  });
}

export async function pushDbNotification(
  _orgId: string,
  notif: Omit<Notification, 'id' | 'read' | 'created_at'>
) {
  await invokeNodeApi('/api/v1/notifications', {
    method: 'POST',
    body: {
      title: notif.title,
      description: notif.description,
      type: notif.type,
    },
  });
}

export async function archiveNotification(notificationId: string) {
  await invokeNodeApi(`/api/v1/notifications/${notificationId}`, {
    method: 'PATCH',
    body: { status: 'archived' },
  });
}

export async function unarchiveNotification(notificationId: string) {
  await invokeNodeApi(`/api/v1/notifications/${notificationId}`, {
    method: 'PATCH',
    body: { status: 'unread' },
  });
}
