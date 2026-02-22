import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import type { CommunicationLog } from '@/features/clients/types';

export function useCommLogs(clientId: string) {
  return useQuery<CommunicationLog[], Error>({
    queryKey: ['commLogs', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((item) => ({
        ...item,
        type: item.type as 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other'
      }));
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateCommLog(clientId: string) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (log: Omit<CommunicationLog, 'id' | 'created_at' | 'client_id' | 'organization_id' | 'user_id'>) => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }
      if (!organizationId) {
        throw new Error('Organization not found');
      }

      const { data, error } = await supabase
        .from('communication_logs')
        .insert({
          ...log,
          client_id: clientId,
          organization_id: organizationId,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commLogs', clientId] }),
  });
}
