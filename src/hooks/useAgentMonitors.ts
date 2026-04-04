import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface AgentMonitor {
  id?: string;
  organization_id: string;
  monitor_type: string;
  enabled: boolean;
  config: Record<string, unknown>;
  last_run_at: string | null;
  next_run_at: string | null;
  run_interval_minutes: number;
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useAgentMonitors() {
  return useQuery({
    queryKey: ['agent-monitors'],
    queryFn: () => invokeNodeApi<SingleResponse<AgentMonitor[]>>('/api/v1/agents/monitors'),
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      type: string;
      enabled?: boolean;
      config?: Record<string, unknown>;
      runIntervalMinutes?: number;
    }) =>
      invokeNodeApi<SingleResponse<AgentMonitor>>(`/api/v1/agents/monitors/${params.type}`, {
        method: 'PUT',
        body: {
          enabled: params.enabled,
          config: params.config,
          runIntervalMinutes: params.runIntervalMinutes,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-monitors'] });
      toast.success('Monitor updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update monitor', { description: error.message });
    },
  });
}

export function useTriggerMonitor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (type: string) =>
      invokeNodeApi<SingleResponse<{ message: string }>>(`/api/v1/agents/monitors/${type}/run`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-monitors'] });
      queryClient.invalidateQueries({ queryKey: ['agent-alerts'] });
      toast.success('Monitor run triggered');
    },
    onError: (error: Error) => {
      toast.error('Failed to trigger monitor', { description: error.message });
    },
  });
}
