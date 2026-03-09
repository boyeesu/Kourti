import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentUserOrganization } from '@/hooks/useOrganization';
import { logError } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers – minimal query-builder type for tables / RPCs missing from the
// generated Supabase schema.  This avoids using `any` while still allowing
// the fluent chained API (.from().select().eq()…).
// ---------------------------------------------------------------------------
interface SupabaseQueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface SupabaseQueryBuilder extends PromiseLike<SupabaseQueryResult> {
  select: (columns: string) => SupabaseQueryBuilder;
  eq: (column: string, value: string) => SupabaseQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => SupabaseQueryBuilder;
  limit: (count: number) => SupabaseQueryBuilder;
  maybeSingle: () => PromiseLike<SupabaseQueryResult>;
}

interface UntypedSupabaseClient {
  from: (table: string) => SupabaseQueryBuilder;
  rpc: (fn: string, params: Record<string, unknown>) => Promise<SupabaseQueryResult>;
}

const untypedClient = supabase as unknown as UntypedSupabaseClient;

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

        const { data, error } = await untypedClient
          .from('subscriptions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;

        return (data as Subscription) ?? null;
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

        const { data, error } = await untypedClient
          .from('payment_transactions')
          .select('*')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;

        return (data || []) as PaymentTransaction[];
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
 * Mutation that calls the `flutterwave-init-payment` edge function and
 * returns a payment link the caller can redirect to.
 */
export function useInitiatePayment() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: InitiatePaymentParams) => {
      try {
        const { data, error } = await supabase.functions.invoke('flutterwave-init-payment', {
          body: params,
        });

        if (error) throw error;

        if (!data?.payment_link) {
          throw new Error('No payment link returned from server');
        }

        return data as { payment_link: string; tx_ref: string };
      } catch (error) {
        logError('Error initiating payment', error);
        throw error;
      }
    },
    onError: (error) => {
      toast({
        title: 'Payment Error',
        description:
          error instanceof Error ? error.message : 'Failed to initiate payment. Please try again.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Mutation that calls the `flutterwave-subscription-manage` edge function
 * to activate, deactivate, or cancel a subscription.
 */
export function useManageSubscription() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organization } = useCurrentUserOrganization();

  return useMutation({
    mutationFn: async (params: ManageSubscriptionParams) => {
      try {
        const { data, error } = await supabase.functions.invoke('flutterwave-subscription-manage', {
          body: params,
        });

        if (error) throw error;
        return data;
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

      toast({
        title: 'Success',
        description: messages[params.action] || 'Subscription updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update subscription',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Mutation that calls the `flutterwave-verify-payment` edge function to
 * manually verify a pending transaction with Flutterwave and activate
 * the subscription if the payment was successful.
 */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: organization } = useCurrentUserOrganization();

  return useMutation({
    mutationFn: async (params: VerifyPaymentParams): Promise<VerifyPaymentResult> => {
      try {
        const { data, error } = await supabase.functions.invoke('flutterwave-verify-payment', {
          body: params,
        });

        if (error) throw error;
        return data as VerifyPaymentResult;
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
        toast({
          title: 'Payment Verified',
          description: 'Your subscription has been activated successfully.',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Verification Error',
        description:
          error instanceof Error ? error.message : 'Failed to verify payment. Please try again.',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Combines subscription, plan, and payment history into a single query
 * using the `get_organization_billing` RPC.
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

        const { data, error } = await untypedClient.rpc('get_organization_billing', {
          p_organization_id: orgId,
        });

        if (error) throw error;

        // The RPC may return a single row or an array; normalize.
        const billing = Array.isArray(data) ? data[0] : data;

        return (billing as OrganizationBilling) ?? null;
      } catch (error) {
        logError('Error fetching organization billing', error);
        throw error;
      }
    },
    enabled: !!orgId && !!user?.id,
    staleTime: 1 * 60 * 1000,
  });
}
