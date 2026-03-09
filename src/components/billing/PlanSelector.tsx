import { useState } from 'react';
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

// ---------------------------------------------------------------------------
// Plan pricing map (amounts in the base currency, e.g. USD)
// These would ideally come from the backend; kept here as a display fallback.
// ---------------------------------------------------------------------------

const PLAN_PRICING: Record<string, { monthly: number; yearly: number; currency: string }> = {
  free: { monthly: 0, yearly: 0, currency: 'USD' },
  starter: { monthly: 29, yearly: 290, currency: 'USD' },
  professional: { monthly: 79, yearly: 790, currency: 'USD' },
  enterprise: { monthly: 199, yearly: 1990, currency: 'USD' },
};

function getPricing(planType: string) {
  return PLAN_PRICING[planType] ?? PLAN_PRICING.free;
}

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlanSelector({ open, onOpenChange }: PlanSelectorProps) {
  const { data: plans = [], isLoading: plansLoading } = useUserPlans();
  const { data: currentPlan } = useCurrentUserPlan();
  const { data: subscription } = useCurrentSubscription();
  const initiatePayment = useInitiatePayment();

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const isYearly = billingInterval === 'yearly';

  const handleSubscribe = async (plan: UserPlan) => {
    if (plan.plan_type === 'free') return;

    setSelectedPlanId(plan.id);

    try {
      const result = await initiatePayment.mutateAsync({
        plan_id: plan.id,
        billing_interval: billingInterval,
        redirect_url: window.location.href,
      });

      // Redirect the user to the Flutterwave payment page
      window.location.href = result.payment_link;
    } catch {
      // Error toast is shown by the mutation's onError callback
      setSelectedPlanId(null);
    }
  };

  const isCurrentPlan = (plan: UserPlan) => currentPlan?.plan_id === plan.id;

  const getButtonLabel = (plan: UserPlan) => {
    if (isCurrentPlan(plan)) return 'Current Plan';
    if (plan.plan_type === 'free') return 'Downgrade';

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
              const pricing = getPricing(plan.plan_type);
              const price = isYearly ? pricing.yearly : pricing.monthly;
              const isCurrent = isCurrentPlan(plan);
              const isSubmitting = initiatePayment.isPending && selectedPlanId === plan.id;

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    isCurrent ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'
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
                        {price === 0 ? 'Free' : formatCurrency(price, pricing.currency)}
                      </p>
                      {price > 0 && (
                        <p className="text-xs text-muted-foreground">
                          per {isYearly ? 'year' : 'month'}
                        </p>
                      )}
                      {isYearly && pricing.monthly > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground line-through">
                          {formatCurrency(pricing.monthly * 12, pricing.currency)}/year
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
