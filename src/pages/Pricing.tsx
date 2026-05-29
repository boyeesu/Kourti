import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { invokeNodeApi } from '@/lib/backendApi';
import { useAuth } from '@/hooks/useAuth';
import { useInitiatePayment } from '@/hooks/useSubscription';
import { logError } from '@/lib/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Check, Lock, Shield, Sparkles } from 'lucide-react';

// ---------- Types ----------

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

// ---------- Data ----------

const FAQ_ITEMS = [
  {
    question: 'Can I change plans later?',
    answer:
      'Yes, you can upgrade or downgrade your plan at any time. When upgrading, you will be charged the prorated difference for the remainder of your billing period. When downgrading, the new rate takes effect at the start of your next billing cycle.',
  },
  {
    question: 'What payment methods are accepted?',
    answer:
      'We accept payments via Paystack, which supports debit/credit cards (Visa, Mastercard, Verve), bank transfers, USSD, and mobile money across Africa. All payments are processed securely.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'You can cancel your subscription at any time from your account settings under the Billing section. Your access will continue until the end of your current billing period. No refunds are provided for partial periods.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Our Free plan lets you explore core features at no cost with no time limit. When you are ready for advanced capabilities such as AI-powered document review, unlimited storage, and priority support, you can upgrade to a paid plan.',
  },
];

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

// ---------- Hooks ----------

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

// ---------- Helpers ----------

function currencySymbol(currency: string) {
  if (currency === 'NGN') return '₦';
  if (currency === 'USD') return '$';
  return `${currency} `;
}

function formatAmount(amount: number, currency: string) {
  return `${currencySymbol(currency)}${amount.toLocaleString()}`;
}

// ---------- Component ----------

export default function Pricing() {
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: plans = [], isLoading } = usePricingPlans();
  const { user } = useAuth();
  const navigate = useNavigate();
  const initiatePayment = useInitiatePayment();

  const sortedPlans = useMemo(
    () =>
      [...plans].sort((a, b) => (PLAN_ORDER[a.plan_type] ?? 99) - (PLAN_ORDER[b.plan_type] ?? 99)),
    [plans]
  );

  const defaultSelected = useMemo(() => {
    if (!sortedPlans.length) return null;
    return (
      sortedPlans.find((p) => p.plan_type === 'professional') ??
      sortedPlans.find((p) => p.plan_type !== 'free') ??
      sortedPlans[0]
    );
  }, [sortedPlans]);

  const selected = sortedPlans.find((p) => p.id === selectedId) ?? defaultSelected ?? null;

  const isYearly = billing === 'yearly';
  const isFree = selected?.plan_type === 'free';
  const isEnterprise = selected?.plan_type === 'enterprise';

  const monthly = selected?.price_monthly ?? 0;
  const yearly = selected?.price_yearly ?? 0;
  const monthlyEquivAnnual = monthly * 12;
  const savings = isYearly && monthly && yearly ? Math.max(0, monthlyEquivAnnual - yearly) : 0;
  const subtotal = isYearly ? monthlyEquivAnnual : monthly;
  const total = isYearly ? yearly : monthly;
  const currency = selected?.currency ?? 'USD';

  const ctaHref = isEnterprise ? '/contact' : user ? '/settings/billing' : '/login';
  const ctaLabel = isFree
    ? 'Get started — free'
    : isEnterprise
      ? 'Contact sales'
      : 'Continue to checkout';

  return (
    <div className="min-h-screen bg-muted/30">
      {/* ---- Header ---- */}
      <section className="pt-14 pb-8 px-4 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Choose your plan</h1>
        <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
          Pick the plan that fits your firm. Switch or cancel anytime.
        </p>
      </section>

      {/* ---- Checkout Grid ---- */}
      <section className="px-4 pb-16 max-w-6xl mx-auto">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* LEFT: Plan picker */}
          <div className="space-y-6">
            {/* Billing toggle (segmented) */}
            <div className="bg-background border rounded-xl p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold">Billing cycle</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Save 20% when you pay yearly
                  </p>
                </div>
                <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setBilling('monthly')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${
                      !isYearly
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setBilling('yearly')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition flex items-center gap-1.5 ${
                      isYearly
                        ? 'bg-background shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Yearly
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      -20%
                    </Badge>
                  </button>
                </div>
              </div>
            </div>

            {/* Plan list */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold px-1">Select a plan</h2>

              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-xl border bg-background animate-pulse" />
                  ))}
                </div>
              ) : (
                sortedPlans.map((plan) => {
                  const planIsFree = plan.plan_type === 'free';
                  const planIsEnterprise = plan.plan_type === 'enterprise';
                  const isPopular = plan.plan_type === 'professional';
                  const isSelected = selected?.id === plan.id;
                  const price = isYearly ? plan.price_yearly : plan.price_monthly;
                  const interval = isYearly ? '/yr' : '/mo';

                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedId(plan.id)}
                      className={`w-full text-left rounded-xl border bg-background p-5 transition-all ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`mt-1 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                            isSelected ? 'border-primary' : 'border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{plan.display_name}</span>
                            {isPopular && (
                              <Badge className="h-5 px-2 text-[10px] gap-1">
                                <Sparkles className="h-3 w-3" />
                                Most popular
                              </Badge>
                            )}
                          </div>
                          {plan.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {plan.description}
                            </p>
                          )}

                          {plan.features.length > 0 && (
                            <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
                              {plan.features.slice(0, 4).map((f, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-1.5 text-xs text-muted-foreground"
                                >
                                  <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                                  <span className="line-clamp-1">{f}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          {planIsFree ? (
                            <div className="font-semibold">Free</div>
                          ) : planIsEnterprise && price == null ? (
                            <div className="font-semibold text-sm">Custom</div>
                          ) : (
                            <>
                              <div className="font-semibold text-lg leading-none">
                                {formatAmount(price ?? 0, plan.currency)}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">{interval}</div>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Order summary */}
          <aside className="lg:sticky lg:top-6 self-start">
            <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b bg-muted/30">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Order summary
                </h2>
              </div>

              <div className="p-6 space-y-5">
                {selected ? (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{selected.display_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Billed {isYearly ? 'yearly' : 'monthly'}
                        </div>
                      </div>
                      {!isFree && !isEnterprise && (
                        <div className="font-semibold">{formatAmount(subtotal, currency)}</div>
                      )}
                    </div>

                    {!isFree && !isEnterprise && (
                      <>
                        <Separator />

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Subtotal</span>
                            <span>{formatAmount(subtotal, currency)}</span>
                          </div>
                          {savings > 0 && (
                            <div className="flex justify-between text-emerald-600 dark:text-emerald-500">
                              <span>Yearly discount</span>
                              <span>-{formatAmount(savings, currency)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-muted-foreground">
                            <span>Tax</span>
                            <span>Calculated at checkout</span>
                          </div>
                        </div>

                        <Separator />

                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-semibold">Total due today</span>
                          <div className="text-right">
                            <div className="text-2xl font-bold">
                              {formatAmount(total, currency)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isYearly ? 'per year' : 'per month'}
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                    {isFree && (
                      <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                        No payment required. Start using Kourti right away.
                      </div>
                    )}

                    {isEnterprise && (
                      <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                        Custom pricing based on your firm's size and needs. Our team will reach out
                        within one business day.
                      </div>
                    )}

                    <Button asChild size="lg" className="w-full">
                      <Link to={ctaHref}>{ctaLabel}</Link>
                    </Button>

                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        Secure checkout
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        Cancel anytime
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="h-40 animate-pulse bg-muted/40 rounded-lg" />
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-muted-foreground text-center px-4">
              Payments processed securely via Paystack. By continuing you agree to our{' '}
              <Link to="/terms" className="underline hover:text-foreground">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="underline hover:text-foreground">
                Privacy Policy
              </Link>
              .
            </p>
          </aside>
        </div>
      </section>

      {/* ---- FAQ ---- */}
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
