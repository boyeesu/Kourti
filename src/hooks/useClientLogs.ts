import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { CommunicationLog } from '@/types';
import { getCurrentUserId } from '@/hooks/useCurrentUser';
import { useUserOrganization } from '@/hooks/useUserOrganization';

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
      
      // Map database results to interface
      return (data || []).map(item => ({
        id: item.id,
        client_id: item.client_id,
        user_id: item.user_id,
        organization_id: item.organization_id,
        type: item.type as 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other',
        content: item.content,
        created_at: item.created_at,
        created_by: item.user_id,
      } as CommunicationLog));
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateClientLog() {
  const qc = useQueryClient();
  const { data: organizationId } = useUserOrganization();

  return useMutation({
    mutationFn: async (log: { client_id: string; type: string; content: string }) => {
      const userId = await getCurrentUserId();
      
      const logData = {
        ...log,
        user_id: userId!,
        organization_id: organizationId!,
      };

      const { data, error } = await supabase
        .from('communication_logs')
        .insert([logData])
        .select()
        .single();
      if (error) throw error;
      
      return {
        id: data.id,
        client_id: data.client_id,
        user_id: data.user_id,
        organization_id: data.organization_id,
        type: data.type as 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other',
        content: data.content,
        created_at: data.created_at,
        created_by: data.user_id,
      } as CommunicationLog;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['client-logs', vars.client_id] });
    },
  });
}