
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CommunicationLog } from '@/types';

export function useClientLogs(clientId: string) {
  return useQuery<CommunicationLog[], Error>({
    queryKey: ['client-logs', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CommunicationLog[];
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateClientLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: Omit<CommunicationLog, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('communication_logs')
        .insert([log])
        .select()
        .single();
      if (error) throw error;
      return data as CommunicationLog;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['client-logs', vars.client_id] });
    },
  });
}
