import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { logError } from '@/lib/logger';
import { invokeNodeApi } from '@/lib/backendApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Subscription {
  id: string;
  organization_id: string;
  user_id: string;
  plan_id: string;
  flutterwave_subscription_id: string | null;
  flutterwave_customer_email: string;
  billing_interval: 'monthly' | 'yearly';
  status: 'active' | 'cancelled' | 'paused' | 'past_due' | 'trialing';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  organization_id: string;
  subscription_id: string | null;
  flutterwave_tx_ref: string;
  flutterwave_tx_id: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'successful' | 'failed' | 'refunded';
  payment_type: 'subscription' | 'one_time' | 'upgrade';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrganizationBilling {
  subscription: Subscription | null;
  plan: {
    id: string;
    name: string;
    display_name: string;
    plan_type: string;
    features: string[];
  } | null;
  recent_payments: PaymentTransaction[];
}

export interface InitiatePaymentParams {
  plan_id: string;
  billing_interval: 'monthly' | 'yearly';
  redirect_url?: string;
}

export interface ManageSubscriptionParams {
  action: 'activate' | 'deactivate' | 'cancel';
  subscription_id: string;
}

export interface VerifyPaymentParams {
  tx_ref: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  payment_status: 'pending' | 'successful' | 'failed' | 'unknown';
  subscription_status: string | null;
  subscription_id?: string;
  already_processed?: boolean;
  message?: string;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the active subscription for the current user's organization.
 */
export function useCurrentSubscription() {
  const { data: organization } = useCurrentUserOrganization();
  const orgId = organization?.id;

  return useQuery({
    queryKey: ['subscription', orgId],
    queryFn: async () => {
      try {
        if (!orgId) return null;

        return invokeNodeApi<Subscription | null>('/api/v1/misc/subscriptions/current');
      } catch (error) {
        logError('Error fetching current subscription', error);
        throw error;
      }
    },
    enabled: !!orgId,
    staleTime: 1 * 60 * 1000, // Cache for 1 minute
  });
}

/**
 * Fetches payment transaction history for the current user's organization.
 */
export function usePaymentHistory(limit = 20) {
  const { data: organization } = useCurrentUserOrganization();
  const orgId = organization?.id;

  return useQuery({
    queryKey: ['payment-history', orgId, limit],
    queryFn: async () => {
      try {
        if (!orgId) return [];

        return invokeNodeApi<PaymentTransaction[]>('/api/v1/misc/subscriptions/payments', {
          query: { limit: String(limit) },
        });
      } catch (error) {
        logError('Error fetching payment history', error);
        throw error;
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });
}

/**
 * Mutation that calls the Node backend to initiate a Flutterwave payment
 * and returns a payment link the caller can redirect to.
 */
export function useInitiatePayment() {
  return useMutation({
    mutationFn: async (params: InitiatePaymentParams) => {
      try {
        const data = await invokeNodeApi<{ payment_link: string; tx_ref: string }>(
          '/api/v1/misc/subscriptions/initiate-payment',
          { method: 'POST', body: params }
        );

        if (!data?.payment_link) {
          throw new Error('No payment link returned from server');
        }

        return data;
      } catch (error) {
        logError('Error initiating payment', error);
        throw error;
      }
    },
    onError: (error) => {
      toast.error('Payment Error', {
        description:
          error instanceof Error ? error.message : 'Failed to initiate payment. Please try again.',
      });
    },
  });
}

/**
 * Mutation that calls the Node backend to activate, deactivate, or cancel
 * a subscription.
 */
export function useManageSubscription() {
  const queryClient = useQueryClient();

  const { data: organization } = useCurrentUserOrganization();

  return useMutation({
    mutationFn: async (params: ManageSubscriptionParams) => {
      try {
        return await invokeNodeApi<unknown>('/api/v1/misc/subscriptions/manage', {
          method: 'POST',
          body: params,
        });
      } catch (error) {
        logError('Error managing subscription', error);
        throw error;
      }
    },
    onSuccess: (_, params) => {
      const orgId = organization?.id;
      queryClient.invalidateQueries({ queryKey: ['subscription', orgId] });
      queryClient.invalidateQueries({ queryKey: ['payment-history', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-billing', orgId] });

      const messages: Record<string, string> = {
        activate: 'Subscription activated successfully',
        deactivate: 'Subscription paused successfully',
        cancel:
          'Subscription cancelled. It will remain active until the end of the billing period.',
      };

      toast.success('Success', { description: messages[params.action] || 'Subscription updated' });
    },
    onError: (error) => {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Failed to update subscription',
      });
    },
  });
}

/**
 * Mutation that calls the Node backend to verify a pending transaction
 * with Flutterwave and activate the subscription if payment was successful.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient();

  const { data: organization } = useCurrentUserOrganization();

  return useMutation({
    mutationFn: async (params: VerifyPaymentParams): Promise<VerifyPaymentResult> => {
      try {
        return await invokeNodeApi<VerifyPaymentResult>(
          '/api/v1/misc/subscriptions/verify-payment',
          { method: 'POST', body: params }
        );
      } catch (error) {
        logError('Error verifying payment', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      const orgId = organization?.id;
      if (data.payment_status === 'successful') {
        queryClient.invalidateQueries({ queryKey: ['subscription', orgId] });
        queryClient.invalidateQueries({ queryKey: ['payment-history', orgId] });
        queryClient.invalidateQueries({ queryKey: ['organization-billing', orgId] });
        queryClient.invalidateQueries({ queryKey: ['current-user-plan'] });
        toast.success('Payment Verified', {
          description: 'Your subscription has been activated successfully.',
        });
      }
    },
    onError: (error) => {
      toast.error('Verification Error', {
        description:
          error instanceof Error ? error.message : 'Failed to verify payment. Please try again.',
      });
    },
  });
}

/**
 * Combines subscription, plan, and payment history into a single query
 * via the Node backend.
 */
export function useOrganizationBilling() {
  const { user } = useAuth();
  const { data: organization } = useCurrentUserOrganization();
  const orgId = organization?.id;

  return useQuery({
    queryKey: ['organization-billing', orgId],
    queryFn: async () => {
      try {
        if (!orgId) return null;

        return invokeNodeApi<OrganizationBilling | null>('/api/v1/misc/subscriptions/billing');
      } catch (error) {
        logError('Error fetching organization billing', error);
        throw error;
      }
    },
    enabled: !!orgId && !!user?.id,
    staleTime: 1 * 60 * 1000,
  });
}
