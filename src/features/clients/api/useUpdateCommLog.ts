import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CommunicationLog } from '@/features/clients/types';

export function useUpdateCommLog(clientId: string) {
  const qc = useQueryClient();
  return useMutation<CommunicationLog, Error, CommunicationLog>(async (log) => {
    const { data, error } = await supabase
      .from<CommunicationLog>('communication_logs')
      .update({ content: log.content, type: log.type })
      .eq('id', log.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, {
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commLogs', clientId] }),
  });
}
