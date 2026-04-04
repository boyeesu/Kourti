import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface AgentAlert {
  id: string;
  organization_id: string;
  monitor_id: string | null;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  status: 'active' | 'acknowledged' | 'resolved' | 'dismissed';
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AlertSummary {
  active: number;
  critical: number;
  warning: number;
  info: number;
}

interface AlertsResponse {
  success: boolean;
  data: AgentAlert[];
  summary: AlertSummary;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useAgentAlerts(filters?: {
  status?: string;
  severity?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['agent-alerts', filters],
    queryFn: () =>
      invokeNodeApi<AlertsResponse>('/api/v1/agents/alerts', {
        query: {
          page: filters?.page ?? 1,
          pageSize: filters?.pageSize ?? 20,
          status: filters?.status,
          severity: filters?.severity,
          entityType: filters?.entityType,
        },
      }),
    refetchInterval: 30000,
  });
}

export function useAlertSummary() {
  return useQuery({
    queryKey: ['agent-alerts-summary'],
    queryFn: () => invokeNodeApi<SingleResponse<AlertSummary>>('/api/v1/agents/alerts/summary'),
    refetchInterval: 30000,
  });
}

export function useUpdateAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { alertId: string; status: 'acknowledged' | 'resolved' | 'dismissed' }) =>
      invokeNodeApi<SingleResponse<AgentAlert>>(`/api/v1/agents/alerts/${params.alertId}`, {
        method: 'PATCH',
        body: { status: params.status },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['agent-alerts-summary'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to update alert', { description: error.message });
    },
  });
}
