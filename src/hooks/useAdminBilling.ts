import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';

import { usePlatformAdmin } from './usePlatformAdmin';

// ---------- Types ----------

export interface ReconciliationRow {
  organization_id: string;
  organization_name: string | null;
  granted_plan_id: string | null;
  granted_plan_name: string | null;
  subscription_id: string | null;
  subscription_plan_id: string | null;
  subscription_plan_name: string | null;
  subscription_status: string | null;
  divergence_reason: 'grant_without_active_subscription' | 'plan_mismatch';
}

export interface DunningRow {
  subscription_id: string;
  organization_id: string | null;
  organization_name: string | null;
  status: string | null;
  billing_interval: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  provider: string | null;
  provider_customer_email: string | null;
  plan_display_name: string | null;
  currency: string | null;
}

export interface SeatUsage {
  purchased: number | null;
  used: number;
}

export interface OrgSubscription {
  id: string;
  plan_id: string | null;
  status: string | null;
  billing_interval: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  provider: string | null;
  provider_customer_email: string | null;
  plan_display_name: string | null;
  plan_name: string | null;
  currency: string | null;
}

export interface SubscriptionAdjustment {
  id: string;
  subscription_id: string | null;
  adjustment_type: string;
  params: Record<string, unknown>;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BillingCredit {
  id: string;
  amount_minor: number;
  currency: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface OrgBilling {
  subscription: OrgSubscription | null;
  net_credit_minor: number;
  credit_currency: string | null;
  adjustments: SubscriptionAdjustment[];
  credits: BillingCredit[];
}

export type AdjustmentType =
  | 'extend_trial'
  | 'change_seats'
  | 'force_sync'
  | 'mark_paid'
  | 'cancel'
  | 'reactivate';

// ---------- Read hooks ----------

export function useBillingReconciliation() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-billing-reconciliation'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        const data = await invokeNodeApi<ReconciliationRow[]>(
          '/api/v1/admin/billing/reconciliation'
        );
        return data || [];
      } catch (error) {
        logError('Error fetching billing reconciliation', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useBillingDunning() {
  const { data: isPlatformAdmin } = usePlatformAdmin();
  return useQuery({
    queryKey: ['admin-billing-dunning'],
    enabled: !!isPlatformAdmin,
    queryFn: async () => {
      try {
        const data = await invokeNodeApi<DunningRow[]>('/api/v1/admin/billing/dunning');
        return data || [];
      } catch (error) {
        logError('Error fetching dunning queue', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

export function useOrgSeatUsage(orgId: string | null) {
  return useQuery({
    queryKey: ['admin-org-seat-usage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      try {
        return await invokeNodeApi<SeatUsage>(`/api/v1/admin/organizations/${orgId}/seat-usage`);
      } catch (error) {
        logError('Error fetching seat usage', error);
        throw error;
      }
    },
    staleTime: 15 * 1000,
  });
}

export function useOrgBilling(orgId: string | null) {
  return useQuery({
    queryKey: ['admin-org-billing', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      try {
        return await invokeNodeApi<OrgBilling>(`/api/v1/admin/organizations/${orgId}/billing`);
      } catch (error) {
        logError('Error fetching org billing', error);
        throw error;
      }
    },
    staleTime: 15 * 1000,
  });
}

// ---------- Mutations ----------

export function useAddCredit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orgId: string;
      amountMinor: number;
      currency?: string;
      reason: string;
    }) => {
      return invokeNodeApi<BillingCredit>(`/api/v1/admin/organizations/${params.orgId}/credits`, {
        method: 'POST',
        body: {
          amountMinor: params.amountMinor,
          currency: params.currency,
          reason: params.reason,
        },
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-org-billing', vars.orgId] });
      toast.success('Credit recorded', { description: 'The billing credit was applied.' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to add credit',
      });
    },
  });
}

export function useRecordAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orgId: string;
      adjustmentType: AdjustmentType;
      params: Record<string, unknown>;
      reason: string;
    }) => {
      return invokeNodeApi<
        SubscriptionAdjustment & { applied: boolean; apply_error: string | null }
      >(`/api/v1/admin/organizations/${params.orgId}/subscription-adjustments`, {
        method: 'POST',
        body: {
          adjustmentType: params.adjustmentType,
          params: params.params,
          reason: params.reason,
        },
      });
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-org-billing', vars.orgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-org-seat-usage', vars.orgId] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['admin-billing-dunning'] });
      if (data.apply_error) {
        toast.warning('Adjustment recorded', { description: data.apply_error });
      } else {
        toast.success('Adjustment recorded', {
          description: data.applied
            ? 'The adjustment was applied to the subscription.'
            : 'The adjustment was recorded.',
        });
      }
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to record adjustment',
      });
    },
  });
}
