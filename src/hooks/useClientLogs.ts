/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CommunicationLog } from '@/types';
import { invokeNodeApi } from '@/lib/backendApi';

export function useClientLogs(clientId: string) {
  return useQuery<CommunicationLog[], Error>({
    queryKey: ['client-logs', clientId],
    queryFn: async () => {
      const data = await invokeNodeApi<any[]>(`/api/v1/misc/client-logs/${clientId}`);
      return (data || []).map((item: any) => ({
        id: item.id,
        client_id: item.client_id,
        user_id: item.user_id,
        organization_id: item.organization_id,
        type: item.type as 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other',
        content: item.content,
        created_at: item.created_at,
        created_by: item.user_id,
      })) as CommunicationLog[];
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateClientLog() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (log: { client_id: string; type: string; content: string }) => {
      const data = await invokeNodeApi<any>('/api/v1/misc/client-logs', {
        method: 'POST',
        body: log,
      });
      return { ...data, created_by: data.user_id, type: data.type } as CommunicationLog;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['client-logs', vars.client_id] });
    },
  });
}
