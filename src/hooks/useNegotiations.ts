import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';

export interface Negotiation {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_title?: string;
  playbook_id: string | null;
  playbook_name?: string;
  counterparty_name: string | null;
  status: string;
  current_round: number;
  our_last_position: Record<string, unknown> | null;
  their_last_position: Record<string, unknown> | null;
  started_by: string;
  assigned_to: string | null;
  escalated_to: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
  turns?: NegotiationTurn[];
  positions?: NegotiationPosition[];
}

export interface NegotiationTurn {
  id: string;
  round_number: number;
  direction: 'incoming' | 'outgoing';
  content: string | null;
  changes: Array<{ clause: string; from: string; to: string }> | null;
  ai_analysis: Record<string, unknown> | null;
  ai_confidence: number | null;
  created_by: string | null;
  created_at: string;
}

export interface NegotiationPosition {
  id: string;
  clause_name: string;
  our_position: string | null;
  their_position: string | null;
  status: string;
  rounds_discussed: number;
}

interface SingleResponse<T> {
  success: boolean;
  data: T;
}

export function useNegotiations(status?: string) {
  return useQuery({
    queryKey: ['negotiations', status],
    queryFn: () =>
      invokeNodeApi<SingleResponse<Negotiation[]>>('/api/v1/negotiations', {
        query: { status },
      }),
  });
}

export function useNegotiation(id: string | undefined) {
  return useQuery({
    queryKey: ['negotiation', id],
    queryFn: () => invokeNodeApi<SingleResponse<Negotiation>>(`/api/v1/negotiations/${id}`),
    enabled: !!id,
  });
}

export function useCreateNegotiation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { contractId: string; playbookId?: string; counterpartyName?: string }) =>
      invokeNodeApi<SingleResponse<Negotiation>>('/api/v1/negotiations', {
        method: 'POST',
        body: params,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['negotiations'] });
      toast.success('Negotiation started');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}

export function useRecordTurn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      negotiationId: string;
      direction: 'incoming' | 'outgoing';
      content?: string;
      changes?: Array<{ clause: string; from: string; to: string }>;
    }) =>
      invokeNodeApi<SingleResponse<NegotiationTurn>>(
        `/api/v1/negotiations/${params.negotiationId}/turns`,
        {
          method: 'POST',
          body: { direction: params.direction, content: params.content, changes: params.changes },
        }
      ),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['negotiation', vars.negotiationId] });
      toast.success('Turn recorded');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}

export function useAIRespond() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (negotiationId: string) =>
      invokeNodeApi<SingleResponse<Record<string, unknown>>>(
        `/api/v1/negotiations/${negotiationId}/ai-respond`,
        {
          method: 'POST',
        }
      ),
    onSuccess: (_d, negotiationId) => {
      qc.invalidateQueries({ queryKey: ['negotiation', negotiationId] });
      qc.invalidateQueries({ queryKey: ['agent-approvals'] });
      toast.success('AI counter-proposal generated');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}

export function useEscalateNegotiation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { negotiationId: string; escalateTo?: string }) =>
      invokeNodeApi<SingleResponse<Negotiation>>(
        `/api/v1/negotiations/${params.negotiationId}/escalate`,
        {
          method: 'POST',
          body: { escalateTo: params.escalateTo },
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['negotiations'] });
      toast.success('Escalated');
    },
    onError: (e: Error) => toast.error('Failed', { description: e.message }),
  });
}
