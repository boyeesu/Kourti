import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  job_id: string | null;
  alert_id: string | null;
  requested_by_agent: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  summary: string;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  expires_at: string | null;
  executed_at: string | null;
  execution_result: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentDashboardData {
  jobs: { today: number; running: number; completed: number; failed: number };
  alerts: { active: number; critical: number };
  approvals: { pending: number };
  tokensUsedToday: number;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pendingCount?: number;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useApprovals(filters?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: ['agent-approvals', filters],
    queryFn: () =>
      invokeNodeApi<PaginatedResponse<ApprovalRequest>>('/api/v1/agents/approvals', {
        query: { page: filters?.page ?? 1, status: filters?.status },
      }),
    refetchInterval: 10000,
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { approvalId: string; notes?: string }) =>
      invokeNodeApi<SingleResponse<ApprovalRequest>>(
        `/api/v1/agents/approvals/${params.approvalId}/approve`,
        { method: 'POST', body: { notes: params.notes } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success('Action approved');
    },
    onError: (e: Error) => toast.error('Failed to approve', { description: e.message }),
  });
}

export function useRejectRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { approvalId: string; notes?: string }) =>
      invokeNodeApi<SingleResponse<ApprovalRequest>>(
        `/api/v1/agents/approvals/${params.approvalId}/reject`,
        { method: 'POST', body: { notes: params.notes } }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['agent-dashboard'] });
      toast.success('Action rejected');
    },
    onError: (e: Error) => toast.error('Failed to reject', { description: e.message }),
  });
}

export function useAgentDashboard() {
  return useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: () => invokeNodeApi<SingleResponse<AgentDashboardData>>('/api/v1/agents/dashboard'),
    refetchInterval: 15000,
  });
}

export function useAgentAuditLog(page = 1) {
  return useQuery({
    queryKey: ['agent-audit-log', page],
    queryFn: () =>
      invokeNodeApi<
        PaginatedResponse<{
          id: string;
          action: string;
          details: Record<string, unknown>;
          created_at: string;
        }>
      >('/api/v1/agents/audit', { query: { page, pageSize: 50 } }),
  });
}
