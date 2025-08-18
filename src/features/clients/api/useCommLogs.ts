import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
      return data;
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateCommLog(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (log: Omit<CommunicationLog, 'id' | 'created_at' | 'client_id' | 'organization_id'>) => {
      const { data, error } = await supabase
        .from('communication_logs')
        .insert({ 
          ...log, 
          client_id: clientId,
          organization_id: '' // This will be handled by RLS
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commLogs', clientId] }),
  });
}
