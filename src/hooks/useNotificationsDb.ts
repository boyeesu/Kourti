/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Notification } from '@/components/ui/notifications';
import { getCurrentUserId } from '@/hooks/useCurrentUser';

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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', orgId, filters],
    queryFn: async () => {
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', orgId as any)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as any);
      }

      if (filters?.type) {
        query = query.eq('type', filters.type as any);
      }

      if (filters?.archived === false) {
        query = query.is('archived_at', null);
      } else if (filters?.archived === true) {
        query = query.not('archived_at', 'is', null);
      }

      const { data } = await query;

      // Apply search filter in memory if provided
      let filteredData = data || [];
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        filteredData = filteredData.filter(
          (item: any) =>
            item.title?.toLowerCase().includes(searchLower) ||
            item.description?.toLowerCase().includes(searchLower)
        );
      }

      // Transform database format to Notification interface
      return filteredData.map((item: any) => ({
        ...item,
        date: item.created_at || new Date().toISOString(),
        read: item.status === 'read',
        type: item.type || 'info',
      })) as Notification[];
    },
    enabled: !!orgId,
    staleTime: 5 * 1000, // 5 seconds
    gcTime: 60 * 1000, // 1 minute
  });

  // Subscribe to real-time inserts
  useEffect(() => {
    if (!orgId) return;
    // Categorize priority
    const categorize = (notif: Notification) => ({
      ...notif,
      priority: (notif as any).urgent ? 'high' : 'medium',
    });
    const channel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const newNotif = categorize(payload.new as Notification);
          // Prepend to existing notifications
          queryClient.setQueryData<Notification[]>(
            ['notifications', orgId, filters],
            (old = []) => [newNotif, ...old]
          );
          // Optionally show toast for high priority
          if (newNotif.priority === 'high') {
            // useToast outside hook scope? assume toast available
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          queryClient.setQueryData<Notification[]>(
            ['notifications', orgId, filters],
            (old = []) => {
              return old.map((n) => (n.id === payload.new.id ? { ...n, ...payload.new } : n));
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, filters]);

  return query;
}

export function useNotificationPreferences(orgId: string) {
  return useQuery({
    queryKey: ['notification-preferences', orgId],
    queryFn: async () => {
      const userId = await getCurrentUserId();
      if (!userId || !orgId) return null;

      // @ts-expect-error - Table not in generated types yet
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as NotificationPreferences | null;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
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

      const { organization_id, ...restPreferences } = preferences;
      // @ts-expect-error - Table not in generated types yet
      const { data, error } = await supabase
        .from('notification_preferences')
        .upsert(
          {
            user_id: userId,
            organization_id: organization_id,
            ...restPreferences,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,organization_id',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['notification-preferences', variables.organization_id],
      });
    },
  });
}

export async function pushDbNotification(
  orgId: string,
  notif: Omit<Notification, 'id' | 'read' | 'created_at'>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) throw new Error('Not authenticated');

  await supabase.from('notifications').insert([
    {
      user_id: userId,
      organization_id: orgId,
      ...notif,
    } as any,
  ]);
}

export async function archiveNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'archived' })
    .eq('id', notificationId);

  if (error) throw error;
}

export async function unarchiveNotification(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ status: 'unread' })
    .eq('id', notificationId);

  if (error) throw error;
}
