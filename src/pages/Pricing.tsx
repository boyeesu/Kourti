import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { invokeNodeApi } from '@/lib/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { logError } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Check } from 'lucide-react';

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

const FAQ_ITEMS = [
  {
    question: 'Can I change plans later?',
    answer:
      'Yes, you can upgrade or downgrade your plan at any time. When upgrading, you will be charged the prorated difference for the remainder of your billing period. When downgrading, the new rate takes effect at the start of your next billing cycle.',
  },
  {
    question: 'What payment methods are accepted?',
    answer:
      'We accept debit/credit cards (Visa, Mastercard, Verve), bank transfers, USSD, and mobile money across Africa. All payments are processed securely.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'You can cancel your subscription at any time from your account settings under the Billing section. Your access will continue until the end of your current billing period. No refunds are provided for partial periods.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Every paid plan starts with a free trial. Upgrade, downgrade, or cancel anytime — no credit card required to get started.',
  },
];

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

function usePricingPlans() {
  return useQuery({
    queryKey: ['pricing-plans'],
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

function currencySymbol(currency: string) {
  if (currency === 'NGN') return '₦';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

function formatAmount(amount: number, currency: string) {
  return `${currencySymbol(currency)}${amount.toLocaleString()}`;
}

// Dedupe by plan_type — keep the row with the richest features list. Defensive
// against any DB state where duplicate tier rows slip back in.
function cleanPlans(plans: PricingPlan[]): PricingPlan[] {
  const byType = new Map<string, PricingPlan>();
  for (const p of plans) {
    if (!p?.plan_type) continue;
    const current = byType.get(p.plan_type);
    if (!current || (p.features?.length ?? 0) > (current.features?.length ?? 0)) {
      byType.set(p.plan_type, p);
    }
  }
  return [...byType.values()].sort(
    (a, b) => (PLAN_ORDER[a.plan_type] ?? 99) - (PLAN_ORDER[b.plan_type] ?? 99)
  );
}

export default function Pricing() {
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const { data: plans = [], isLoading } = usePricingPlans();
  const { user } = useAuth();

  const tiers = useMemo(() => cleanPlans(plans), [plans]);
  const isYearly = billing === 'yearly';

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="pt-16 pb-10 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Pick the plan that fits your firm. Switch or cancel anytime.
        </p>

        <div className="mt-8 inline-flex rounded-full border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 text-sm font-medium rounded-full transition ${
              !isYearly ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBilling('yearly')}
            className={`px-5 py-2 text-sm font-medium rounded-full transition flex items-center gap-2 ${
              isYearly ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Yearly
            <Badge variant="secondary" className="h-5 px-2 text-[10px]">
              Save 20%
            </Badge>
          </button>
        </div>
      </section>

      {/* Tier cards */}
      <section className="px-4 pb-16 max-w-6xl mx-auto">
        {isLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[520px] rounded-2xl border bg-card animate-pulse" />
            ))}
          </div>
        ) : tiers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            Pricing is currently unavailable. Please try again shortly.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3 items-stretch">
            {tiers.map((plan) => {
              const isFree = plan.plan_type === 'free';
              const isPopular = plan.plan_type === 'professional';
              const isEnterprise = plan.plan_type === 'enterprise';
              const price = isYearly ? plan.price_yearly : plan.price_monthly;
              const interval = isYearly ? '/user/year' : '/user/month';

              const ctaLabel = isEnterprise
                ? 'Talk to sales'
                : isFree
                  ? 'Get started'
                  : 'Start free trial';

              const ctaHref = isEnterprise
                ? 'mailto:sales@kourti.com?subject=Enterprise%20plan%20enquiry'
                : user
                  ? '/settings/billing'
                  : '/login';

              const isExternal = ctaHref.startsWith('mailto:') || ctaHref.startsWith('http');

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border bg-card p-8 flex flex-col ${
                    isPopular ? 'border-primary border-2 shadow-lg shadow-primary/10' : ''
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="px-3 py-1 text-xs rounded-full">Most Popular</Badge>
                    </div>
                  )}

                  <div className="text-center">
                    <h2 className="text-xl font-semibold">{plan.display_name}</h2>

                    <div className="mt-4 flex items-baseline justify-center gap-1">
                      {isFree ? (
                        <span className="text-5xl font-bold">Free</span>
                      ) : isEnterprise && (price == null || price === 0) ? (
                        <>
                          <span className="text-5xl font-bold">Custom</span>
                          <span className="text-muted-foreground text-sm ml-1">pricing</span>
                        </>
                      ) : (
                        <>
                          <span className="text-5xl font-bold">
                            {formatAmount(price ?? 0, plan.currency)}
                          </span>
                          <span className="text-muted-foreground text-sm">{interval}</span>
                        </>
                      )}
                    </div>

                    {plan.description && (
                      <p className="mt-3 text-sm text-muted-foreground min-h-[2.5rem]">
                        {plan.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-8 flex-1">
                    {plan.features.length > 0 && (
                      <>
                        <p className="text-sm font-semibold mb-3">What's included:</p>
                        <ul className="space-y-2.5">
                          {plan.features.map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2.5 text-sm">
                              <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                              <span className="text-foreground/90">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="mt-8">
                    <Button
                      asChild
                      size="lg"
                      className="w-full rounded-full"
                      variant={isPopular ? 'default' : 'outline'}
                    >
                      {isExternal ? (
                        <a href={ctaHref}>{ctaLabel}</a>
                      ) : (
                        <Link to={ctaHref}>{ctaLabel}</Link>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="px-4 pb-20 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>

        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((faq, idx) => (
            <AccordionItem key={idx} value={`faq-${idx}`}>
              <AccordionTrigger className="text-left">{faq.question}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
