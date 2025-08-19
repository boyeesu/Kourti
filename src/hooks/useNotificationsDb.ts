
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Notification, NotificationType } from '@/components/ui/notifications';

export function useNotificationsDb(orgId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['notifications', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      
      // Transform database format to Notification interface
      return (data || []).map(item => ({
        ...item,
        date: item.created_at || new Date().toISOString(),
        read: item.status === 'read',
        type: (item.type || 'info') as NotificationType,
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `organization_id=eq.${orgId}` }, (payload) => {
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
    organization_id: orgId,
    ...notif,
  }]);
}
