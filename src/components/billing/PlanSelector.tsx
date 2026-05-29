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
import { Check, Loader2, Sparkles, Zap, Rocket, Building2, Leaf } from 'lucide-react';
import { useUserPlans, useCurrentUserPlan, type UserPlan } from '@/hooks/useUserPlans';
import { useCurrentSubscription, useSeatUsage } from '@/hooks/useSubscription';
import { useFxRate } from '@/hooks/useFxRate';
import { SeatCheckoutDialog } from './SeatCheckoutDialog';

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
  const { data: seatUsage } = useSeatUsage();
  const { data: fx } = useFxRate();

  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>(
    initialCycle ?? 'monthly'
  );
  const [seatPlan, setSeatPlan] = useState<UserPlan | null>(null);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);

  // Re-seed the seat dialog's plan whenever a deep-link plan is provided.
  useEffect(() => {
    if (initialPlanId) {
      const match = plans.find((p) => p.id === initialPlanId);
      if (match) setSeatPlan(match);
    }
  }, [initialPlanId, plans]);

  const isYearly = billingInterval === 'yearly';

  const handleSubscribe = (plan: UserPlan) => {
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

    // Paid plan → open the seat-selection + invite step, which collects
    // quantity and teammate emails before sending the user to Paystack.
    setSeatPlan(plan);
    setSeatDialogOpen(true);
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

  const planIcon = (type: string) => {
    switch (type) {
      case 'free':
        return Leaf;
      case 'starter':
        return Zap;
      case 'professional':
        return Rocket;
      case 'enterprise':
        return Building2;
      default:
        return Sparkles;
    }
  };

  const isPopular = (type: string) => type === 'professional';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="border-b bg-gradient-to-b from-muted/40 to-background px-6 pb-5 pt-6 sm:px-8">
          <DialogHeader className="space-y-1.5 text-center sm:text-left">
            <DialogTitle className="text-2xl font-semibold tracking-tight">
              Choose a Plan
            </DialogTitle>
            <DialogDescription className="text-sm">
              Select the plan that best fits your team. Upgrade or downgrade at any time.
            </DialogDescription>
          </DialogHeader>

          {/* Billing interval toggle — segmented control */}
          <div className="mt-5 flex items-center justify-center gap-3">
            <div
              role="tablist"
              aria-label="Billing interval"
              className="inline-flex items-center rounded-full border bg-background p-1 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!isYearly}
                onClick={() => setBillingInterval('monthly')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  !isYearly
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isYearly}
                onClick={() => setBillingInterval('yearly')}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isYearly
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yearly
              </button>
            </div>
            <Badge
              variant="secondary"
              className={`gap-1 transition-opacity ${isYearly ? 'opacity-100' : 'opacity-0'}`}
            >
              <Sparkles className="h-3 w-3" />
              Save ~17%
            </Badge>
          </div>
        </div>

        {/* Plans grid */}
        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 sm:px-8">
          {plansLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div
              className={`grid gap-5 sm:grid-cols-2 ${
                sortedPlans.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
              }`}
            >
              {sortedPlans.map((plan) => {
                const price = isYearly ? plan.price_yearly : plan.price_monthly;
                const currency = plan.currency || 'USD';
                const isCurrent = isCurrentPlan(plan);
                const Icon = planIcon(plan.plan_type);
                const popular = isPopular(plan.plan_type);

                return (
                  <Card
                    key={plan.id}
                    className={`relative flex flex-col overflow-hidden transition-all duration-200 ${
                      isCurrent
                        ? 'border-primary ring-2 ring-primary/30'
                        : popular
                          ? 'border-primary/60 shadow-lg shadow-primary/10 lg:-translate-y-1'
                          : 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
                    }`}
                  >
                    {popular && !isCurrent && (
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/70 to-primary" />
                    )}
                    {isCurrent ? (
                      <Badge className="absolute right-3 top-3 bg-primary/10 text-primary hover:bg-primary/10">
                        Current
                      </Badge>
                    ) : (
                      popular && (
                        <Badge className="absolute right-3 top-3 gap-1 bg-primary text-primary-foreground">
                          <Sparkles className="h-3 w-3" />
                          Popular
                        </Badge>
                      )
                    )}

                    <CardHeader className="space-y-3 pb-3">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          popular
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <CardTitle className="text-base font-semibold">
                          {plan.display_name || plan.name}
                        </CardTitle>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {plan.description || `The ${plan.plan_type} plan`}
                        </p>
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col justify-between gap-5">
                      {/* Price. Enterprise (and any plan with no configured
                          price) is sold via contract — show "Custom", never a
                          bogus $0.00. */}
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold tracking-tight">
                            {plan.plan_type === 'enterprise' || price == null
                              ? 'Custom'
                              : price === 0
                                ? 'Free'
                                : formatCurrency(price, currency)}
                          </span>
                          {price != null && price > 0 && (
                            <span className="text-sm text-muted-foreground">
                              /{isYearly ? 'yr' : 'mo'}
                            </span>
                          )}
                        </div>
                        {price != null &&
                          price > 0 &&
                          currency.toUpperCase() === 'USD' &&
                          fx &&
                          fx.settle_currency === 'NGN' && (
                            <p className="text-xs font-medium text-primary">
                              ≈ ₦{Math.round(price * fx.rate).toLocaleString()}{' '}
                              {isYearly ? '/year' : '/month'}
                            </p>
                          )}
                        {isYearly && (plan.price_monthly ?? 0) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            <span className="line-through">
                              {formatCurrency((plan.price_monthly ?? 0) * 12, currency)}
                            </span>{' '}
                            billed yearly
                          </p>
                        )}
                      </div>

                      {/* Action — placed above features so CTA is in primary scan path */}
                      <Button
                        className="w-full"
                        size="sm"
                        variant={isCurrent ? 'outline' : popular ? 'default' : 'secondary'}
                        disabled={isCurrent || plan.plan_type === 'free'}
                        onClick={() => handleSubscribe(plan)}
                      >
                        {getButtonLabel(plan)}
                      </Button>

                      {/* Features */}
                      {plan.features.length > 0 && (
                        <ul className="space-y-2 border-t pt-4">
                          {plan.features.map((feature, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2 text-sm text-foreground"
                            >
                              <span
                                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                  popular ? 'bg-primary/15' : 'bg-muted'
                                }`}
                              >
                                <Check
                                  className={`h-3 w-3 ${
                                    popular ? 'text-primary' : 'text-foreground'
                                  }`}
                                />
                              </span>
                              <span className="leading-snug">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            All plans include secure data storage and product updates. Taxes may apply.
          </p>
        </div>
      </DialogContent>

      <SeatCheckoutDialog
        open={seatDialogOpen}
        onOpenChange={setSeatDialogOpen}
        plan={seatPlan}
        billingInterval={billingInterval}
        currentUsed={seatUsage?.used ?? 1}
      />
    </Dialog>
  );
}
