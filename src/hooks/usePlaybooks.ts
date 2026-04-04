import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface Playbook {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  contract_types: string[] | null;
  rules: Array<Record<string, unknown>>;
  escalation_config: Record<string, unknown> | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function usePlaybooks() {
  return useQuery({
    queryKey: ['playbooks'],
    queryFn: () => invokeNodeApi<SingleResponse<Playbook[]>>('/api/v1/playbooks'),
  });
}

export function usePlaybook(id: string | undefined) {
  return useQuery({
    queryKey: ['playbook', id],
    queryFn: () => invokeNodeApi<SingleResponse<Playbook>>(`/api/v1/playbooks/${id}`),
    enabled: !!id,
  });
}

export function useCreatePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      description?: string;
      contractTypes?: string[];
      rules?: Array<Record<string, unknown>>;
      escalationConfig?: Record<string, unknown>;
      isDefault?: boolean;
    }) =>
      invokeNodeApi<SingleResponse<Playbook>>('/api/v1/playbooks', {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] });
      toast.success('Playbook created');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}

export function useDeletePlaybook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      invokeNodeApi<SingleResponse<{ deleted: boolean }>>(`/api/v1/playbooks/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playbooks'] });
      toast.success('Playbook deleted');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}
