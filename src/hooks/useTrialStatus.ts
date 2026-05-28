import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

export type TrialStatusValue = 'none' | 'trialing' | 'active' | 'past_due' | 'expired';

export interface TrialStatus {
  status: TrialStatusValue;
  is_trial: boolean;
  is_expired: boolean;
  days_remaining: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan: {
    id: string;
    name: string | null;
    display_name: string | null;
    plan_type: string | null;
  } | null;
}

export function useTrialStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['trial-status', user?.id],
    queryFn: () => invokeNodeApi<TrialStatus>('/api/v1/billing/trial-status'),
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });
}

export function useStartTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invokeNodeApi<TrialStatus & { already_existed: boolean }>('/api/v1/billing/start-trial', {
        method: 'POST',
        body: {},
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['trial-status'] });
      qc.invalidateQueries({ queryKey: ['subscription'] });
      qc.invalidateQueries({ queryKey: ['organization-billing'] });
      if (!data.already_existed) {
        toast.success('Free trial started', {
          description: `You have ${data.days_remaining} days to explore Kourti.`,
        });
      }
    },
    onError: (err) => {
      logError('Failed to start trial', err);
      toast.error('Could not start trial', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });
}
