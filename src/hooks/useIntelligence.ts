import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface IntelligenceSnapshot {
  id: string;
  organization_id: string;
  snapshot_type: string;
  data: Record<string, unknown>;
  generated_by_job_id: string | null;
  created_at: string;
}

export interface IntelligenceRecommendation {
  id: string;
  organization_id: string;
  snapshot_id: string;
  category: string;
  priority: string;
  title: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  action_url: string | null;
  status: string;
  snapshot_date?: string;
  created_at: string;
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useLatestIntelligence() {
  return useQuery({
    queryKey: ['intelligence-latest'],
    queryFn: () =>
      invokeNodeApi<SingleResponse<IntelligenceSnapshot | null>>('/api/v1/intelligence/latest'),
  });
}

export function useIntelligenceRecommendations(status = 'active') {
  return useQuery({
    queryKey: ['intelligence-recs', status],
    queryFn: () =>
      invokeNodeApi<SingleResponse<IntelligenceRecommendation[]>>(
        '/api/v1/intelligence/recommendations',
        {
          query: { status },
        }
      ),
  });
}

export function useGenerateIntelligence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invokeNodeApi<SingleResponse<{ jobId: string }>>('/api/v1/intelligence/generate', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-jobs'] });
      toast.success('Intelligence synthesis started');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}

export function useDismissRecommendation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { id: string; status: 'acted_on' | 'dismissed' }) =>
      invokeNodeApi<SingleResponse<IntelligenceRecommendation>>(
        `/api/v1/intelligence/recommendations/${params.id}`,
        {
          method: 'PATCH',
          body: { status: params.status },
        }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['intelligence-recs'] }),
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}
