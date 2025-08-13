import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Notification } from '@/components/ui/notifications';

export function useNotificationsDb(orgId: string) {
  return useQuery({
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
  });
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
