import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { useUserPlans, useCurrentUserPlan, type UserPlan } from '@/hooks/useUserPlans';
import { useCurrentSubscription, useInitiatePayment } from '@/hooks/useSubscription';
import { useFxRate } from '@/hooks/useFxRate';

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided (deep-link), the matching card is highlighted on open. */
  initialPlanId?: string;
  /** When provided, the monthly/yearly toggle starts on this cycle. */
  initialCycle?: 'monthly' | 'yearly';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanSelector({
  open,
  onOpenChange,
  initialPlanId,
  initialCycle,
}: PlanSelectorProps) {
  const { data: plans = [], isLoading: plansLoading } = useUserPlans();
  const { data: currentPlan } = useCurrentUserPlan();
  const { data: subscription } = useCurrentSubscription();
  const { data: fx } = useFxRate();

  // Re-seed selection whenever initialPlanId changes (each deep-link click).
  useEffect(() => {
    if (initialPlanId) setSelectedPlanId(initialPlanId);
  }, [initialPlanId]);
  const initiatePayment = useInitiatePayment();

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    initialCycle ?? 'monthly'
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId ?? null);

  const isYearly = billingInterval === 'yearly';

  const handleSubscribe = async (plan: UserPlan) => {
    if (plan.plan_type === 'free') return;

    // Enterprise is sold via direct contract — the backend rejects
    // Paystack initialize for it. Route the user straight to sales.
    if (plan.plan_type === 'enterprise') {
      const subject = encodeURIComponent('Enterprise plan enquiry');
      const body = encodeURIComponent(
        "Hi Kourti team,\n\nI'd like to learn more about the Enterprise plan.\n\nOrganization:\nTeam size:\nNeeds:\n\nThanks."
      );
      window.location.href = `mailto:sales@kourti.com?subject=${subject}&body=${body}`;
      return;
    }

    setSelectedPlanId(plan.id);

    try {
      const result = await initiatePayment.mutateAsync({
        plan_id: plan.id,
        billing_interval: billingInterval,
        redirect_url: `${window.location.origin}/billing/callback`,
      });

      // Redirect the user to the Paystack hosted checkout page.
      // Accept either key — backend returns both for compat.
      const checkoutUrl =
        (result as { authorization_url?: string; payment_link?: string }).authorization_url ??
        (result as { authorization_url?: string; payment_link?: string }).payment_link;
      if (!checkoutUrl) throw new Error('No checkout URL returned');
      window.location.href = checkoutUrl;
    } catch {
      // Error toast is shown by the mutation's onError callback
      setSelectedPlanId(null);
    }
  };

  // Prefer the live subscription's plan_id over the user_plan_assignments
  // record — Paystack activation updates subscriptions, not assignments, so
  // the assignment can lag after a paid upgrade.
  const activePlanId = subscription?.plan_id ?? currentPlan?.plan_id ?? null;
  const isCurrentPlan = (plan: UserPlan) => activePlanId === plan.id;

  const getButtonLabel = (plan: UserPlan) => {
    if (isCurrentPlan(plan)) return 'Current Plan';
    if (plan.plan_type === 'free') return 'Downgrade';
    if (plan.plan_type === 'enterprise') return 'Talk to sales';

    // Determine upgrade vs subscribe
    if (subscription) return 'Upgrade';
    return 'Subscribe';
  };

  // Sort plans by type hierarchy
  const sortedPlans = [...plans].sort((a, b) => {
    const order = ['free', 'starter', 'professional', 'enterprise'];
    return order.indexOf(a.plan_type) - order.indexOf(b.plan_type);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choose a Plan</DialogTitle>
          <DialogDescription>
            Select the plan that best fits your team. You can upgrade or downgrade at any time.
          </DialogDescription>
        </DialogHeader>

        {/* Billing interval toggle */}
        <div className="flex items-center justify-center gap-3 py-2">
          <Label
            htmlFor="billing-toggle"
            className={!isYearly ? 'font-semibold' : 'text-muted-foreground'}
          >
            Monthly
          </Label>
          <Switch
            id="billing-toggle"
            checked={isYearly}
            onCheckedChange={(checked) => setBillingInterval(checked ? 'yearly' : 'monthly')}
          />
          <Label
            htmlFor="billing-toggle"
            className={isYearly ? 'font-semibold' : 'text-muted-foreground'}
          >
            Yearly
          </Label>
          {isYearly && (
            <Badge variant="secondary" className="ml-1">
              <Sparkles className="mr-1 h-3 w-3" />
              Save ~17%
            </Badge>
          )}
        </div>

        {/* Plans grid */}
        {plansLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sortedPlans.map((plan) => {
              const price = isYearly ? plan.price_yearly : plan.price_monthly;
              const currency = plan.currency || 'USD';
              const isCurrent = isCurrentPlan(plan);
              const isSubmitting = initiatePayment.isPending && selectedPlanId === plan.id;

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    isCurrent
                      ? 'border-primary ring-2 ring-primary/20'
                      : selectedPlanId === plan.id
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'hover:border-primary/50'
                  }`}
                >
                  {isCurrent && (
                    <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                      Current
                    </Badge>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{plan.display_name || plan.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {plan.description || `The ${plan.plan_type} plan`}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col justify-between gap-4">
                    {/* Price */}
                    <div>
                      <p className="text-3xl font-bold">
                        {price === 0 ? 'Free' : formatCurrency(price, currency)}
                      </p>
                      {price > 0 && (
                        <p className="text-xs text-muted-foreground">
                          per {isYearly ? 'year' : 'month'}
                        </p>
                      )}
                      {/* FX preview: when settle currency is NGN and the plan
                          is priced in USD, show the NGN figure Paystack will
                          actually charge so users don't get surprised. */}
                      {price > 0 &&
                        currency.toUpperCase() === 'USD' &&
                        fx &&
                        fx.settle_currency === 'NGN' && (
                          <p className="mt-1 text-xs font-medium text-primary">
                            ≈ ₦{Math.round(price * fx.rate).toLocaleString()}{' '}
                            {isYearly ? '/year' : '/month'}
                          </p>
                        )}
                      {isYearly && plan.price_monthly > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground line-through">
                          {formatCurrency(plan.price_monthly * 12, currency)}/year
                        </p>
                      )}
                    </div>

                    {/* Features */}
                    {plan.features.length > 0 && (
                      <ul className="space-y-1.5">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Action */}
                    <Button
                      className="mt-auto w-full"
                      variant={isCurrent ? 'outline' : 'default'}
                      disabled={isCurrent || isSubmitting || plan.plan_type === 'free'}
                      onClick={() => handleSubscribe(plan)}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Redirecting...
                        </>
                      ) : (
                        getButtonLabel(plan)
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
