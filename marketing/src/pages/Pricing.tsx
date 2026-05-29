import Navigation from '@/components/ui/navigation';
import Footer from '@/components/sections/Footer';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import SpecialOfferModal from '@/components/ui/SpecialOfferModal';
import SEO from '@/components/SEO';
import { fetchPublicPlans, type PublicPlan } from '@/lib/api';

const APP_URL = 'https://app.kourti.com';

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Can I switch plans anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a setup fee?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No setup fees for Starter and Professional plans. Enterprise plans include complimentary setup and onboarding.',
      },
    },
    {
      '@type': 'Question',
      name: 'What payment methods do you accept?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'We accept all major credit cards and bank transfers. Enterprise plans can be invoiced.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my data secure?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yes, we're SOC 2 Type II compliant with enterprise-grade security, including end-to-end encryption.",
      },
    },
    {
      '@type': 'Question',
      name: 'Do you offer discounts for annual plans?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, save when you pay annually. Contact our sales team for volume discounts on Enterprise plans.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I cancel anytime?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, you can cancel your subscription at any time with no cancellation fees or penalties.',
      },
    },
  ],
};

/** Currency symbols we display; falls back to the ISO code + space. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  NGN: '₦',
  GBP: '£',
  EUR: '€',
};

function formatPrice(plan: PublicPlan): { price: string; period: string } {
  if (plan.price_monthly == null) {
    return { price: 'Custom', period: 'pricing' };
  }
  const symbol = CURRENCY_SYMBOLS[plan.currency] ?? `${plan.currency} `;
  const amount = Number.isInteger(plan.price_monthly)
    ? plan.price_monthly.toLocaleString()
    : plan.price_monthly.toFixed(2);
  return { price: `${symbol}${amount}`, period: 'per user/month' };
}

function isContactPlan(plan: PublicPlan): boolean {
  return plan.price_monthly == null;
}

const PlanCard = ({ plan }: { plan: PublicPlan }) => {
  const { price, period } = formatPrice(plan);
  const contact = isContactPlan(plan);
  const cta = contact ? 'Talk to Sales' : 'Start free trial';

  return (
    <div
      className={`relative bg-card border rounded-lg p-8 ${
        plan.highlight
          ? 'border-primary shadow-elegant scale-105'
          : 'border-border hover:border-primary/50'
      } transition-smooth`}
    >
      {plan.highlight && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}

      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-foreground mb-2">{plan.display_name}</h3>
        <div className="mb-4">
          <span className="text-4xl font-bold text-foreground">{price}</span>
          <span className="text-muted-foreground ml-2">{period}</span>
        </div>
        {plan.description && <p className="text-muted-foreground">{plan.description}</p>}
      </div>

      <div className="space-y-4 mb-8">
        <h4 className="font-semibold text-foreground">What's included:</h4>
        {plan.features.map((feature) => (
          <div key={feature} className="flex items-start space-x-3">
            <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{feature}</span>
          </div>
        ))}
      </div>

      <Button
        className={`w-full ${
          plan.highlight ? 'gradient-primary text-primary-foreground hover:shadow-glow' : ''
        }`}
        variant={plan.highlight ? 'default' : 'outline'}
        size="lg"
        onClick={() => {
          if (contact) {
            window.location.href = '/contact';
          } else {
            window.open(APP_URL, '_blank');
          }
        }}
      >
        {cta}
      </Button>
    </div>
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

  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="Pricing"
        description="Simple, transparent pricing for solo practitioners, growing firms, and enterprise legal teams. 7-day free trial, no credit card required."
        path="/pricing"
        jsonLd={faqSchema}
      />
      <SpecialOfferModal triggerDelay={15} maxWeeklyShows={2} />
      <MouseFollowGlow />
      <Navigation />
      <main className="pt-24 relative z-10">
        {/* Hero Section */}
        <section className="py-16 bg-gradient-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
              Pricing for law practices <span className="text-gradient">at every stage.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Start solo, grow into a team, and scale into advanced workflows. No need to switch
              tools.
            </p>
            <div className="bg-card border border-border rounded-lg p-4 inline-block">
              <p className="text-sm text-muted-foreground">
                💡 <strong>Free Trial:</strong> All plans include 7 days free · No credit card
                required · Cancel anytime
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {isLoading ? (
              <div className="flex justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : isError || !plans || plans.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-muted-foreground mb-6">
                  We couldn't load live pricing right now. Reach out and we'll walk you through the
                  plans.
                </p>
                <Button size="lg" onClick={() => (window.location.href = '/contact')}>
                  Talk to Sales
                </Button>
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 gap-8 ${
                  plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 max-w-4xl mx-auto'
                }`}
              >
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-muted/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
                Frequently Asked Questions
              </h2>
              <p className="text-muted-foreground">
                Get answers to common questions about our pricing and plans.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Can I switch plans anytime?
                  </h3>
                  <p className="text-muted-foreground">
                    Yes, you can upgrade or downgrade your plan at any time. Changes take effect on
                    your next billing cycle.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Is there a setup fee?</h3>
                  <p className="text-muted-foreground">
                    No setup fees for Starter and Professional plans. Enterprise plans include
                    complimentary setup and onboarding.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    What payment methods do you accept?
                  </h3>
                  <p className="text-muted-foreground">
                    We accept all major credit cards and bank transfers. Enterprise plans can be
                    invoiced.
                  </p>
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Is my data secure?</h3>
                  <p className="text-muted-foreground">
                    Yes, we're SOC 2 Type II compliant with enterprise-grade security, including
                    end-to-end encryption.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Do you offer discounts for annual plans?
                  </h3>
                  <p className="text-muted-foreground">
                    Yes, save when you pay annually. Contact our sales team for volume discounts on
                    Enterprise plans.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Can I cancel anytime?</h3>
                  <p className="text-muted-foreground">
                    Yes, you can cancel your subscription at any time with no cancellation fees or
                    penalties.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 leading-tight">
              Ready to run your practice on AI?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join legal teams using Kourti for matter tracking, contract management, and deadline
              safety.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
            <p className="text-sm text-muted-foreground mt-4">
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
