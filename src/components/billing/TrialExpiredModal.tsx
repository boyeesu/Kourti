import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { invokeNodeApi } from '@/lib/backendApi';
import { logError } from '@/lib/logger';
import { useTrialStatus } from '@/hooks/useTrialStatus';

interface PricingPlan {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  plan_type: 'free' | 'starter' | 'professional' | 'enterprise';
  features: string[];
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
}

type BillingCycle = 'monthly' | 'yearly';

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

// Routes where the modal must NOT block — the user is already trying to fix
// the billing problem (or hasn't finished onboarding yet).
const ALLOWED_PATHS = ['/pricing', '/settings/billing', '/onboarding', '/login', '/logout'];

function currencySymbol(currency: string) {
  if (currency === 'NGN') return '₦';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

function formatAmount(amount: number, currency: string) {
  return `${currencySymbol(currency)}${amount.toLocaleString()}`;
}

function cleanPlans(plans: PricingPlan[]): PricingPlan[] {
  const byType = new Map<string, PricingPlan>();
  for (const p of plans) {
    const current = byType.get(p.plan_type);
    if (!current || (p.features?.length ?? 0) > (current.features?.length ?? 0)) {
      byType.set(p.plan_type, p);
    }
  }
  return [...byType.values()]
    .filter((p) => p.plan_type !== 'free') // No free option once trial has ended
    .sort((a, b) => (PLAN_ORDER[a.plan_type] ?? 99) - (PLAN_ORDER[b.plan_type] ?? 99));
}

function usePricingPlans(enabled: boolean) {
  return useQuery({
    queryKey: ['pricing-plans'],
    enabled,
    queryFn: async () => {
      try {
        const plans = await invokeNodeApi<Array<Record<string, unknown>>>('/api/v1/plans', {
          query: { is_active: true, order: 'plan_type.asc' },
        });
        return (plans || []).map((plan) => ({
          id: plan.id as string,
          name: plan.name as string,
          display_name: plan.display_name as string,
          description: plan.description as string | null,
          plan_type: plan.plan_type as PricingPlan['plan_type'],
          features: (plan.features as string[]) || [],
          price_monthly: (plan.price_monthly as number | null) ?? null,
          price_yearly: (plan.price_yearly as number | null) ?? null,
          currency: (plan.currency as string) || 'USD',
        })) as PricingPlan[];
      } catch (error) {
        logError('Error fetching pricing plans', error);
        throw error;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function TrialExpiredModal() {
  const { data: trial } = useTrialStatus();
  const location = useLocation();
  const navigate = useNavigate();

  const expired =
    !!trial && (trial.is_expired || trial.status === 'expired' || trial.status === 'past_due');
  const onAllowedPath = ALLOWED_PATHS.some((p) => location.pathname.startsWith(p));
  const shouldShow = expired && !onAllowedPath;

  const { data: plans = [], isLoading } = usePricingPlans(shouldShow);
  const tiers = useMemo(() => cleanPlans(plans), [plans]);

  const [billing, setBilling] = useState<BillingCycle>('yearly');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const defaultId = tiers.find((t) => t.plan_type === 'professional')?.id ?? tiers[0]?.id ?? null;
  const selected = tiers.find((t) => t.id === selectedId) ?? tiers.find((t) => t.id === defaultId);
  const isYearly = billing === 'yearly';

  if (!shouldShow) return null;

  function handleNext() {
    if (!selected) return;
    navigate(`/settings/billing?plan=${selected.id}&cycle=${billing}`);
  }

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-3xl p-0 gap-0 [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="p-6 sm:p-8">
          <DialogHeader className="space-y-2">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <DialogTitle className="text-2xl">Your trial has ended</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a plan to keep using Kourti.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0">
                  Save up to 20%
                </Badge>
                <Select value={billing} onValueChange={(v) => setBilling(v as BillingCycle)}>
                  <SelectTrigger className="w-[200px]">
                    <div className="text-left">
                      <div className="text-[10px] uppercase text-muted-foreground leading-none">
                        Subscription type
                      </div>
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Annual | Billed yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </DialogHeader>

          {/* Tier cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {isLoading || tiers.length === 0
              ? Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-72 rounded-xl border bg-muted/30 animate-pulse" />
                ))
              : tiers.slice(0, 2).map((plan) => {
                  const isEnterprise = plan.plan_type === 'enterprise';
                  const isRecommended = plan.plan_type === 'professional';
                  const isSelected = selected?.id === plan.id;
                  const price = isYearly ? plan.price_yearly : plan.price_monthly;
                  const annualCommit =
                    isYearly && price ? price : !isYearly && price ? price * 12 : 0;

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedId(plan.id)}
                      className={`relative text-left rounded-xl border-2 p-5 transition ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      {isRecommended && (
                        <Badge className="absolute -top-2.5 left-4 h-5 px-2 text-[10px]">
                          Recommended
                        </Badge>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{plan.display_name}</h3>
                        <div
                          className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isSelected ? 'border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                      </div>

                      <div className="mt-3 flex items-baseline gap-1">
                        {isEnterprise && (price == null || price === 0) ? (
                          <span className="text-3xl font-bold">Custom</span>
                        ) : (
                          <>
                            <span className="text-3xl font-bold">
                              {formatAmount(price ?? 0, plan.currency)}
                            </span>
                            <span className="text-xs text-muted-foreground">/user/month</span>
                          </>
                        )}
                      </div>

                      {!isEnterprise && annualCommit > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isYearly ? 'Annual' : 'Monthly'} commitment of{' '}
                          {formatAmount(annualCommit, plan.currency)}. Tax may apply.
                        </p>
                      )}

                      <ul className="mt-4 space-y-2">
                        {plan.features.slice(0, 5).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs">
                            <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            <span className="text-foreground/90">{f}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => navigate('/pricing')}>
              View all plans
            </Button>
            <Button onClick={handleNext} disabled={!selected}>
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
