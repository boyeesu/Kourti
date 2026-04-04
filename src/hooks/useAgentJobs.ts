import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface AgentJob {
  id: string;
  agent_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  progress: number;
  progress_message: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  created_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentJobWithSteps extends AgentJob {
  steps: AgentJobStep[];
}

export interface AgentJobStep {
  id: string;
  step_name: string;
  step_index: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  output: Record<string, unknown> | null;
  error: string | null;
  tokens_used: number;
  model_used: string | null;
  duration_ms: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface AgentAuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
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

export function useAgentJobs(filters?: {
  status?: string;
  agentType?: string;
  page?: number;
  pageSize?: number;
}) {
  return useQuery({
    queryKey: ['agent-jobs', filters],
    queryFn: () =>
      invokeNodeApi<PaginatedResponse<AgentJob>>('/api/v1/agents/jobs', {
        query: {
          page: filters?.page ?? 1,
          pageSize: filters?.pageSize ?? 20,
          status: filters?.status,
          agentType: filters?.agentType,
        },
      }),
    refetchInterval: 5000,
  });
}

export function useAgentJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ['agent-job', jobId],
    queryFn: () => invokeNodeApi<SingleResponse<AgentJobWithSteps>>(`/api/v1/agents/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === 'pending' || status === 'running') return 3000;
      return false;
    },
  });
}

export function useAgentJobAudit(jobId: string | undefined) {
  return useQuery({
    queryKey: ['agent-job-audit', jobId],
    queryFn: () =>
      invokeNodeApi<SingleResponse<AgentAuditEntry[]>>(`/api/v1/agents/jobs/${jobId}/audit`),
    enabled: !!jobId,
  });
}

export function useCreateAgentJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { agentType: string; input: Record<string, unknown> }) =>
      invokeNodeApi<SingleResponse<{ id: string; status: string }>>('/api/v1/agents/jobs', {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-jobs'] });
      toast.success('Agent job created', {
        description: 'The agent is now processing your request.',
      });
    },
    onError: (error: Error) => {
      toast.error('Failed to create agent job', { description: error.message });
    },
  });
}

export function useCancelAgentJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: string) =>
      invokeNodeApi<SingleResponse<{ id: string; status: string }>>(
        `/api/v1/agents/jobs/${jobId}/cancel`,
        { method: 'POST' }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['agent-job'] });
      toast.success('Job cancelled');
    },
    onError: (error: Error) => {
      toast.error('Failed to cancel job', { description: error.message });
    },
  });
}
