import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface AgentConfig {
  organization_id: string;
  matter_review_enabled: boolean;
  max_concurrent_jobs: number;
  daily_token_budget: number;
  llm_model_override: string | null;
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useAgentConfig() {
  return useQuery({
    queryKey: ['agent-config'],
    queryFn: () => invokeNodeApi<SingleResponse<AgentConfig>>('/api/v1/agents/config'),
  });
}

export function useUpdateAgentConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      params: Partial<{
        matterReviewEnabled: boolean;
        maxConcurrentJobs: number;
        dailyTokenBudget: number;
        llmModelOverride: string | null;
      }>
    ) =>
      invokeNodeApi<SingleResponse<AgentConfig>>('/api/v1/agents/config', {
        method: 'PUT',
        body: params,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-config'] });
      toast.success('Agent configuration updated');
    },
    onError: (error: Error) => {
      toast.error('Failed to update configuration', { description: error.message });
    },
  });
}
