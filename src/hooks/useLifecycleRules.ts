import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

import { usePlatformAdmin } from './usePlatformAdmin';

export type LifecycleTrigger = 'user_signup' | 'dormant_account' | 'trial_expiring';
export type LifecycleAction = 'auto_approve' | 'flag' | 'auto_disable' | 'notify';

export interface LifecycleRule {
  id: string;
  name: string;
  trigger: LifecycleTrigger;
  action: LifecycleAction;
  params: Record<string, unknown>;
  enabled: boolean;
  created_by: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleUpsertInput {
  name: string;
  trigger: LifecycleTrigger;
  action: LifecycleAction;
  params: Record<string, unknown>;
  enabled?: boolean;
}

/** Valid actions for each trigger — mirrors TRIGGER_ACTIONS on the backend. */
export const TRIGGER_ACTIONS: Record<LifecycleTrigger, LifecycleAction[]> = {
  user_signup: ['auto_approve', 'flag'],
  dormant_account: ['flag', 'auto_disable'],
  trial_expiring: ['notify'],
};

const RULES_KEY = ['lifecycle-rules'];

export function useLifecycleRules() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: RULES_KEY,
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        return await invokeNodeApi<LifecycleRule[]>('/api/v1/admin/rules');
      } catch (error) {
        logError('Error fetching lifecycle rules', error);
        throw error;
      }
    },
    staleTime: 10 * 1000,
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RuleUpsertInput & { reason: string }) =>
      invokeNodeApi<LifecycleRule>('/api/v1/admin/rules', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Rule created');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to create rule',
      }),
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: Partial<RuleUpsertInput> & { id: string; reason: string }) =>
      invokeNodeApi<LifecycleRule>(`/api/v1/admin/rules/${id}`, { method: 'PUT', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Rule updated');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to update rule',
      }),
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      invokeNodeApi<{ ok: boolean }>(`/api/v1/admin/rules/${id}`, {
        method: 'DELETE',
        body: { reason },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      toast.success('Rule deleted');
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to delete rule',
      }),
  });
}

export function useRunRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      invokeNodeApi<{ ok: boolean; ruleId: string; action: string; affected: number }>(
        `/api/v1/admin/rules/${id}/run`,
        { method: 'POST', body: { reason } }
      ),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
      toast.success(`Rule ran — ${data.affected} affected`);
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to run rule',
      }),
  });
}

export function useRunAllRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) =>
      invokeNodeApi<{
        ok: boolean;
        rules: number;
        totalAffected: number;
        summary: { ruleId: string; action: string; affected: number }[];
      }>('/api/v1/admin/rules/run-all', { method: 'POST', body: { reason } }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: RULES_KEY });
      queryClient.invalidateQueries({ queryKey: ['admin-actions'] });
      toast.success(`Ran ${data.rules} rule(s) — ${data.totalAffected} affected`);
    },
    onError: (error) =>
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to run rules',
      }),
  });
}
