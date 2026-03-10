import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logError } from '@/lib/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Check, Sparkles } from 'lucide-react';

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
      'We accept payments via Flutterwave, which supports debit/credit cards (Visa, Mastercard, Verve), bank transfers, USSD, and mobile money across Africa. All payments are processed securely.',
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

// ---------- Hooks ----------

function usePricingPlans() {
  return useQuery({
    queryKey: ['pricing-plans'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('user_plans')
          .select('*')
          .eq('is_active', true)
          .order('plan_type', { ascending: true });

        if (error) throw error;

        return (data || []).map((plan) => ({
          id: plan.id,
          name: plan.name,
          display_name: plan.display_name,
          description: plan.description,
          plan_type: plan.plan_type as PricingPlan['plan_type'],
          features: (plan.features as string[]) || [],
          price_monthly: ((plan as Record<string, unknown>).price_monthly as number | null) ?? null,
          price_yearly: ((plan as Record<string, unknown>).price_yearly as number | null) ?? null,
          currency: ((plan as Record<string, unknown>).currency as string) || 'USD',
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

function formatPrice(amount: number | null | undefined, currency = 'USD') {
  if (amount == null || amount === 0) return null;
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

const PLAN_ORDER: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

// ---------- Component ----------

export default function Pricing() {
  const [isYearly, setIsYearly] = useState(false);
  const { data: plans = [], isLoading } = usePricingPlans();
  const { user } = useAuth();

  const sortedPlans = [...plans].sort(
    (a, b) => (PLAN_ORDER[a.plan_type] ?? 99) - (PLAN_ORDER[b.plan_type] ?? 99)
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ---- Header ---- */}
      <section className="pt-16 pb-12 px-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, Transparent Pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that works for your firm
        </p>

        {/* Billing Toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <span
            className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            Monthly
          </span>
          <Switch checked={isYearly} onCheckedChange={setIsYearly} />
          <span
            className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            Yearly
          </span>
          {isYearly && (
            <Badge variant="secondary" className="ml-1 gap-1">
              <Sparkles className="h-3 w-3" />
              Save 20%
            </Badge>
          )}
        </div>
      </section>

      {/* ---- Plan Cards ---- */}
      <section className="px-4 pb-16 max-w-7xl mx-auto">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="space-y-3">
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-8 w-28 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-3 w-3/4 bg-muted rounded" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sortedPlans.map((plan) => {
              const isFree = plan.plan_type === 'free';
              const isPopular = plan.plan_type === 'professional';
              const price = isYearly ? plan.price_yearly : plan.price_monthly;
              const formattedPrice = formatPrice(price, plan.currency);
              const interval = isYearly ? '/yr' : '/mo';
              const ctaLabel = isFree ? 'Get Started' : 'Subscribe';
              const ctaHref = user ? '/settings/billing' : '/login';

              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col ${
                    isPopular ? 'border-primary border-2 shadow-lg shadow-primary/10' : ''
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="px-3 py-1 text-xs">Most Popular</Badge>
                    </div>
                  )}

                  <CardHeader className="pb-4">
                    <CardDescription className="text-sm font-medium uppercase tracking-wide">
                      {plan.plan_type}
                    </CardDescription>
                    <CardTitle className="text-xl">{plan.display_name}</CardTitle>

                    <div className="mt-4">
                      {isFree ? (
                        <div className="text-4xl font-bold">Free</div>
                      ) : formattedPrice ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold">{formattedPrice}</span>
                          <span className="text-muted-foreground text-sm">{interval}</span>
                        </div>
                      ) : (
                        <div className="text-4xl font-bold">Contact Us</div>
                      )}
                    </div>

                    {plan.description && (
                      <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    {/* Features */}
                    <ul className="space-y-3 flex-1">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <div className="mt-6">
                      <Button
                        asChild
                        className="w-full"
                        variant={isPopular ? 'default' : 'outline'}
                        size="lg"
                      >
                        <Link to={ctaHref}>{ctaLabel}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
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
