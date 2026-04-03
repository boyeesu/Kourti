import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invokeNodeApi } from '@/lib/backendApi';
import type { CommunicationLog } from '@/features/clients/types';

export function useCommLogs(clientId: string) {
  return useQuery<CommunicationLog[], Error>({
    queryKey: ['commLogs', clientId],
    queryFn: async () => {
      const data = await invokeNodeApi<CommunicationLog[]>(`/api/v1/misc/client-logs/${clientId}`);
      return (data ?? []).map((item) => ({
        ...item,
        type: item.type as 'note' | 'email' | 'phone' | 'call' | 'meeting' | 'other',
      }));
    },
    enabled: Boolean(clientId),
  });
}

export function useCreateCommLog(clientId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (
      log: Omit<CommunicationLog, 'id' | 'created_at' | 'client_id' | 'organization_id' | 'user_id'>
    ) => {
      const data = await invokeNodeApi<CommunicationLog>('/api/v1/misc/client-logs', {
        method: 'POST',
        body: {
          ...log,
          client_id: clientId,
        },
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commLogs', clientId] }),
  });
}
