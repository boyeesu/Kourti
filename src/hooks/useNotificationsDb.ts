import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Notification } from '@/components/ui/notifications';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useNotificationsDb(orgId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('organisation_id', orgId)
        .order('created_at', { ascending: false });
      return (data as Notification[]) ?? [];
    },
    enabled: !!orgId,
    staleTime: 5 * 1000, // 5 seconds
    cacheTime: 60 * 1000, // 1 minute
  });

  // Subscribe to real-time inserts
  useEffect(() => {
    if (!orgId) return;
    // Categorize priority
    const categorize = (notif: Notification) => ({
      ...notif,
      priority: notif.urgent ? 'high' : 'medium',
    });
    const channel = supabase
      .channel('public:notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `organisation_id=eq.${orgId}` }, (payload) => {
        const newNotif = categorize(payload.new as Notification);
        // Prepend to existing notifications
        queryClient.setQueryData<Notification[]>(['notifications', orgId], (old = []) => [newNotif, ...old]);
        // Optionally show toast for high priority
        if (newNotif.priority === 'high') {
          // useToast outside hook scope? assume toast available
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  return query;
}

export async function pushDbNotification(
  orgId: string,
  notif: Omit<Notification, 'id' | 'read' | 'created_at'>
) {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;
  if (!userId) throw new Error('Not authenticated');

  await supabase.from('notifications').insert([{ 
    user_id: userId,
    organisation_id: orgId,
    ...notif,
  }]);
}
