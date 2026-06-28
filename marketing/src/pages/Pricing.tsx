import { useState } from 'react';
import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import { Button } from '@/components/ui/button';
import { Check, Minus, ChevronDown, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SEO from '@/components/SEO';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fetchPublicPlans, type PublicPlan } from '@/lib/api';
import {
  COMPARISON,
  PLAN_TAGLINES,
  PLAN_CTA,
  PLAN_CARD_EXTRAS,
  featureLabel,
  formatLimit,
  type CellValue,
} from '@/lib/planFeatures';

const APP_URL = 'https://app.kourti.com';

// JSON-LD FAQ structured data for this route lives in scripts/seo-routes.mjs
// and is baked into the static HTML at build time (see Index.tsx note).

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', NGN: '₦', GBP: '£', EUR: '€' };

function isContactPlan(plan: PublicPlan): boolean {
  // Enterprise is always sales-led — never show a price even if one is set.
  return plan.plan_type === 'enterprise' || plan.price_monthly == null;
}

function formatPrice(plan: PublicPlan): { price: string; period: string } {
  if (isContactPlan(plan)) return { price: 'Custom', period: 'pricing' };
  const symbol = CURRENCY_SYMBOLS[plan.currency] ?? `${plan.currency} `;
  const amount = Number.isInteger(plan.price_monthly)
    ? plan.price_monthly.toLocaleString()
    : plan.price_monthly.toFixed(2);
  return { price: `${symbol}${amount}`, period: 'per user/month' };
}

function onCtaClick(plan: PublicPlan) {
  if (isContactPlan(plan)) {
    window.location.href = '/contact';
  } else {
    window.open(APP_URL, '_blank');
  }
}

/** Highlight bullets for a card: delta vs the previous (cheaper) plan + curated extras. */
function cardHighlights(plans: PublicPlan[], idx: number): { prefix?: string; items: string[] } {
  const plan = plans[idx];
  const toLabels = (keys: string[]) =>
    keys.map(featureLabel).filter((l): l is string => Boolean(l));

  let items: string[];
  let prefix: string | undefined;
  if (idx === 0) {
    items = toLabels(plan.included_features).slice(0, 6);
  } else {
    const prev = new Set(plans[idx - 1].included_features);
    prefix = `Everything in ${plans[idx - 1].display_name}, plus`;
    items = toLabels(plan.included_features.filter((k) => !prev.has(k)));
  }
  return { prefix, items: [...items, ...(PLAN_CARD_EXTRAS[plan.plan_type] ?? [])] };
}

function Cell({ value }: { value: CellValue | undefined }) {
  if (value === true)
    return <Check className="mx-auto h-5 w-5 text-success" aria-label="Included" />;
  if (value === false || value == null)
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not included" />;
  return <span className="text-sm text-foreground">{value}</span>;
}

const PlanCard = ({ plans, idx }: { plans: PublicPlan[]; idx: number }) => {
  const plan = plans[idx];
  const { price, period } = formatPrice(plan);
  const { prefix, items } = cardHighlights(plans, idx);
  const cta =
    PLAN_CTA[plan.plan_type] ?? (isContactPlan(plan) ? 'Talk to sales' : 'Start free trial');

  return (
    <div
      className={`relative flex flex-col rounded-lg border bg-card p-8 ${
        plan.highlight
          ? 'border-primary shadow-elegant lg:scale-105'
          : 'border-border hover:border-primary/50'
      } transition-smooth`}
    >
      {plan.highlight && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-6 text-center">
        <h3 className="mb-1 text-2xl font-bold text-foreground">{plan.display_name}</h3>
        <p className="mb-4 min-h-[40px] text-sm text-muted-foreground">
          {PLAN_TAGLINES[plan.plan_type] ?? plan.description ?? ''}
        </p>
        <div>
          <span className="text-4xl font-bold text-foreground">{price}</span>
          <span className="ml-2 text-muted-foreground">{period}</span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {formatLimit(plan.limits.cases)} matters ·{' '}
          {formatLimit(plan.limits.storage_mb, 'storage')} storage
        </p>
      </div>

      <div className="mb-8 flex-1 space-y-3">
        {prefix && <p className="text-sm font-semibold text-foreground">{prefix}:</p>}
        {items.map((feature) => (
          <div key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
            <span className="text-sm text-muted-foreground">{feature}</span>
          </div>
        ))}
      </div>

      <Button
        className={`w-full ${
          plan.highlight ? 'gradient-primary text-primary-foreground hover:shadow-glow' : ''
        }`}
        variant={plan.highlight ? 'default' : 'outline'}
        size="lg"
        onClick={() => onCtaClick(plan)}
      >
        {cta}
      </Button>
    </div>
  );
};

const CategoryRows = ({
  category,
  plans,
}: {
  category: (typeof COMPARISON)[number];
  plans: PublicPlan[];
}) => (
  <>
    <tr className="border-b border-border bg-muted/20">
      <td
        colSpan={plans.length + 1}
        className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {category.name}
      </td>
    </tr>
    {category.rows.map((row, i) => (
      <tr key={i} className="border-b border-border/60 last:border-0">
        <td
          className="sticky left-0 z-10 bg-card p-4 text-sm text-foreground"
          title={'description' in row ? row.description : undefined}
        >
          {row.label}
        </td>
        {plans.map((plan) => {
          let value: CellValue | undefined;
          if (row.kind === 'feature') value = plan.included_features.includes(row.key);
          else if (row.kind === 'limit') value = formatLimit(plan.limits[row.limitKey], row.format);
          else value = row.values[plan.plan_type];
          return (
            <td key={plan.id} className="p-4 text-center">
              <Cell value={value} />
            </td>
          );
        })}
      </tr>
    ))}
  </>
);

const ComparisonTable = ({ plans }: { plans: PublicPlan[] }) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-16">
      <div className="text-center">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="lg" className="gap-2">
            {open ? 'Hide' : 'Compare'} all features
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="mt-8 data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-10 bg-muted/30 p-4 align-bottom text-sm font-semibold text-foreground">
                  Features
                </th>
                {plans.map((plan) => {
                  const { price, period } = formatPrice(plan);
                  return (
                    <th key={plan.id} className="min-w-[140px] p-4 text-center align-bottom">
                      <div className="flex flex-col items-center gap-1">
                        {plan.highlight && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                            Most Popular
                          </span>
                        )}
                        <span className="text-base font-bold text-foreground">
                          {plan.display_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {price}
                          {!isContactPlan(plan) && <span className="block">{period}</span>}
                        </span>
                        <Button
                          variant={plan.highlight ? 'default' : 'outline'}
                          size="sm"
                          className="mt-1"
                          onClick={() => onCtaClick(plan)}
                        >
                          {isContactPlan(plan) ? 'Talk to sales' : 'Start trial'}
                        </Button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((category) => (
                <CategoryRows key={category.name} category={category} plans={plans} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Feature availability per plan reflects your live account entitlements.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
};

const Pricing = () => {
  const {
    data: plans,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['public-plans'],
    queryFn: fetchPublicPlans,
    staleTime: 5 * 60 * 1000,
  });

  const hasPlans = !!plans && plans.length > 0;

  return (
    <div className="relative min-h-screen bg-background">
      <SEO
        title="Pricing"
        description="Simple, transparent per-seat pricing for solo practitioners, growing firms, and enterprise legal teams. Compare every feature. 7-day free trial, no credit card required."
        path="/pricing"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10 pt-24">
        {/* Hero */}
        <section className="bg-gradient-subtle py-16">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <h1 className="mb-6 text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
              Pricing for law practices <span className="text-gradient">at every stage.</span>
            </h1>
            <p className="mx-auto mb-8 max-w-3xl text-xl text-muted-foreground">
              Start solo, grow into a team, and scale into advanced workflows — without switching
              tools. Pay per seat, add capacity as you grow.
            </p>
            <div className="inline-block rounded-lg border border-border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                💡 <strong>Free Trial:</strong> All plans include 7 days free · No credit card
                required · Cancel anytime
              </p>
            </div>
          </div>
        </section>

        {/* Plans + comparison */}
        <section className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !hasPlans || isError ? (
              <div className="py-24 text-center">
                <p className="mb-6 text-muted-foreground">
                  We couldn't load live pricing right now. Reach out and we'll walk you through the
                  plans.
                </p>
                <Button size="lg" onClick={() => (window.location.href = '/contact')}>
                  Talk to sales
                </Button>
              </div>
            ) : (
              <>
                <div
                  className={`grid grid-cols-1 gap-8 ${
                    plans!.length >= 3 ? 'md:grid-cols-3' : 'mx-auto max-w-4xl md:grid-cols-2'
                  }`}
                >
                  {plans!.map((_, idx) => (
                    <PlanCard key={plans![idx].id} plans={plans!} idx={idx} />
                  ))}
                </div>
                <ComparisonTable plans={plans!} />
              </>
            )}
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-muted/30 py-16">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="mb-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
                Frequently Asked Questions
              </h2>
              <p className="text-muted-foreground">
                Answers to common questions about our pricing and plans.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">
                    Can I switch plans anytime?
                  </h3>
                  <p className="text-muted-foreground">
                    Yes — upgrade or downgrade at any time. Changes take effect on your next billing
                    cycle.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">
                    How does per-seat pricing work?
                  </h3>
                  <p className="text-muted-foreground">
                    Plans are priced per user, per month. Add or remove seats as your team changes
                    and only pay for what you use.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">
                    What payment methods do you accept?
                  </h3>
                  <p className="text-muted-foreground">
                    Cards (Visa, Mastercard, Verve), bank transfer, USSD, and mobile money.
                    Enterprise plans can be invoiced.
                  </p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">Is my data secure?</h3>
                  <p className="text-muted-foreground">
                    Yes — encrypted in transit and at rest, with role-based access and tenant
                    isolation. We follow SOC 2-aligned controls and are pursuing formal SOC 2 Type
                    II certification.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">
                    Do you offer annual discounts?
                  </h3>
                  <p className="text-muted-foreground">
                    Yes — save when you pay annually. Contact sales for volume discounts on
                    Enterprise.
                  </p>
                </div>
                <div>
                  <h3 className="mb-2 font-semibold text-foreground">Can I cancel anytime?</h3>
                  <p className="text-muted-foreground">
                    Yes — cancel at any time with no cancellation fees or penalties.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="mb-4 text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl lg:text-5xl">
              Ready to run your practice on AI?
            </h2>
            <p className="mb-8 text-xl text-muted-foreground">
              Join legal teams using Kourti for matter tracking, contract management, and deadline
              safety.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="gradient-primary text-primary-foreground hover:shadow-glow"
                onClick={() => window.open(APP_URL, '_blank')}
              >
                Start free trial
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
              >
                Book a demo
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              No credit card required · Setup in minutes
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Pricing;
