import { useState, useEffect, useCallback } from 'react';
import { X, Check, Sparkles, Clock, Gift, Zap } from 'lucide-react';
import { Button } from './button';

interface SpecialOfferModalProps {
  triggerDelay?: number; // in seconds, default 15
  maxWeeklyShows?: number; // default 2
}

const STORAGE_KEYS = {
  TIMER_START: 'kourti_offer_timer_start',
  WEEKLY_SHOWS: 'kourti_offer_weekly_shows',
  WEEK_START: 'kourti_offer_week_start',
  DISMISSED: 'kourti_offer_dismissed_session',
};

const SpecialOfferModal = ({ triggerDelay = 15, maxWeeklyShows = 2 }: SpecialOfferModalProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [countdown, setCountdown] = useState(triggerDelay);
  const [offerCountdown, setOfferCountdown] = useState({ hours: 2, minutes: 37, seconds: 30 });
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  // Check if we're in a new week
  const getWeekStart = useCallback(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return new Date(now.setDate(diff)).setHours(0, 0, 0, 0);
  }, []);

  // Check if modal can be shown based on weekly limit
  const canShowModal = useCallback(() => {
    const currentWeekStart = getWeekStart();
    const storedWeekStart = localStorage.getItem(STORAGE_KEYS.WEEK_START);
    const weeklyShows = parseInt(localStorage.getItem(STORAGE_KEYS.WEEKLY_SHOWS) || '0');
    const dismissedSession = sessionStorage.getItem(STORAGE_KEYS.DISMISSED);

    // If dismissed this session, don't show
    if (dismissedSession === 'true') {
      return false;
    }

    // If it's a new week, reset the counter
    if (!storedWeekStart || parseInt(storedWeekStart) < currentWeekStart) {
      localStorage.setItem(STORAGE_KEYS.WEEK_START, currentWeekStart.toString());
      localStorage.setItem(STORAGE_KEYS.WEEKLY_SHOWS, '0');
      return true;
    }

    // Check if under weekly limit
    return weeklyShows < maxWeeklyShows;
  }, [getWeekStart, maxWeeklyShows]);

  // Increment show counter
  const incrementShowCount = useCallback(() => {
    const currentCount = parseInt(localStorage.getItem(STORAGE_KEYS.WEEKLY_SHOWS) || '0');
    localStorage.setItem(STORAGE_KEYS.WEEKLY_SHOWS, (currentCount + 1).toString());
  }, []);

  // Initialize countdown timer with persistence
  useEffect(() => {
    if (!canShowModal()) return;

    const storedTimerStart = localStorage.getItem(STORAGE_KEYS.TIMER_START);
    const now = Date.now();

    let elapsedSeconds = 0;

    if (storedTimerStart) {
      elapsedSeconds = Math.floor((now - parseInt(storedTimerStart)) / 1000);
    } else {
      localStorage.setItem(STORAGE_KEYS.TIMER_START, now.toString());
    }

    const remainingSeconds = Math.max(0, triggerDelay - elapsedSeconds);
    setCountdown(remainingSeconds);

    if (remainingSeconds === 0) {
      setIsVisible(true);
      incrementShowCount();
      localStorage.removeItem(STORAGE_KEYS.TIMER_START);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsVisible(true);
          incrementShowCount();
          localStorage.removeItem(STORAGE_KEYS.TIMER_START);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [triggerDelay, canShowModal, incrementShowCount]);

  // Offer countdown timer (cosmetic urgency)
  useEffect(() => {
    if (!isVisible) return;

    const timer = setInterval(() => {
      setOfferCountdown((prev) => {
        let { hours, minutes, seconds } = prev;
        seconds--;

        if (seconds < 0) {
          seconds = 59;
          minutes--;
        }
        if (minutes < 0) {
          minutes = 59;
          hours--;
        }
        if (hours < 0) {
          hours = 23;
          minutes = 59;
          seconds = 59;
        }

        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible]);

  const handleClose = () => {
    setIsVisible(false);
    sessionStorage.setItem(STORAGE_KEYS.DISMISSED, 'true');
  };

  const handleClaimOffer = (planName: string) => {
    // Store that user claimed an offer for analytics purposes
    localStorage.setItem(
      'kourti_claimed_offer',
      JSON.stringify({
        plan: planName,
        timestamp: Date.now(),
        billingCycle: selectedPlan,
      })
    );

    // Redirect to app with offer context
    window.open(
      `https://app.kourti.com?offer=special40&plan=${planName.toLowerCase()}&billing=${selectedPlan}`,
      '_blank'
    );
    handleClose();
  };

  const formatTime = (value: number) => value.toString().padStart(2, '0');

  const plans = [
    {
      name: 'Starter',
      originalPrice: selectedPlan === 'yearly' ? '$20' : '$24',
      discountedPrice: selectedPlan === 'yearly' ? '$12' : '$14',
      period: '/user/month',
      features: [
        'Up to 8 active cases',
        'AI-powered contract analysis',
        'Basic document management',
        'Standard email support',
      ],
      popular: false,
    },
    {
      name: 'Professional',
      originalPrice: selectedPlan === 'yearly' ? '$50' : '$60',
      discountedPrice: selectedPlan === 'yearly' ? '$30' : '$36',
      period: '/user/month',
      features: [
        'Unlimited cases',
        'AI risk analysis & redlining',
        'AI-powered contract creation',
        'Audio recording & transcription',
        'Priority email support',
      ],
      bonus: selectedPlan === 'yearly' ? '+2 months free' : '+7 days free',
      popular: true,
    },
    {
      name: 'Enterprise',
      originalPrice: 'Custom',
      discountedPrice: 'Custom',
      period: 'pricing',
      features: [
        'Everything in Professional',
        'Custom integrations',
        'White-label options',
        'Dedicated account manager',
        'SLA guarantees',
      ],
      bonus: '+Free onboarding',
      popular: false,
    },
  ];

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998] animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 animate-scale-in">
        <div
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-b from-[#1a1a2e] to-[#0f0f17] rounded-2xl border border-primary/20 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all z-10"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Header */}
          <div className="text-center pt-8 pb-6 px-6">
            <div className="inline-flex items-center gap-2 mb-4">
              <Gift className="h-8 w-8 text-yellow-400 animate-float" />
              <span className="text-2xl md:text-3xl font-bold text-foreground">
                Congrats! You've unlocked special pricing
              </span>
            </div>

            {/* Discount Badge */}
            <div className="relative inline-block">
              <h2 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent animate-pulse">
                40% OFF
              </h2>
              <Sparkles className="absolute -top-2 -right-6 h-6 w-6 text-yellow-400 animate-float" />
            </div>
          </div>

          {/* Billing Toggle */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center bg-background/50 border border-border rounded-full p-1">
              <button
                onClick={() => setSelectedPlan('monthly')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  selectedPlan === 'monthly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setSelectedPlan('yearly')}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  selectedPlan === 'yearly'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Yearly
                <span className="bg-success/20 text-success text-xs px-2 py-0.5 rounded-full">
                  Save 20%
                </span>
              </button>
            </div>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-6 pb-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-xl p-5 transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-b from-primary/10 to-background border-2 border-primary shadow-lg shadow-primary/20 scale-105'
                    : 'bg-background/30 border border-border hover:border-primary/50'
                }`}
              >
                {/* Popular Badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <Zap className="h-3 w-3" /> BEST VALUE
                    </span>
                  </div>
                )}

                <div className="text-center mb-4">
                  <h3 className="text-lg font-bold text-foreground mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {plan.name === 'Starter' && 'Perfect for solo practitioners'}
                    {plan.name === 'Professional' && 'Ideal for growing firms'}
                    {plan.name === 'Enterprise' && 'For large organizations'}
                  </p>

                  <div className="flex items-center justify-center gap-2">
                    {plan.originalPrice !== 'Custom' && (
                      <span className="text-muted-foreground line-through text-sm">
                        {plan.originalPrice}
                      </span>
                    )}
                    <span className="text-3xl font-bold text-foreground">
                      {plan.discountedPrice}
                    </span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>

                  {plan.bonus && (
                    <div className="mt-2">
                      <span className="bg-success/20 text-success text-xs font-medium px-2 py-1 rounded-full">
                        {plan.bonus}
                      </span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2 mb-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  onClick={() => handleClaimOffer(plan.name)}
                  className={`w-full ${
                    plan.popular
                      ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-bold hover:from-yellow-300 hover:to-amber-400 shadow-lg shadow-yellow-500/25'
                      : 'bg-foreground text-background hover:bg-foreground/90'
                  }`}
                  size="lg"
                >
                  {plan.name === 'Enterprise' ? 'Contact Sales' : 'Claim Offer'}
                </Button>
              </div>
            ))}
          </div>

          {/* Countdown Timer */}
          <div className="flex items-center justify-center gap-3 py-4 bg-background/50 border-t border-border mt-4">
            <Clock className="h-5 w-5 text-amber-400" />
            <span className="text-sm text-muted-foreground">Limited-time bonus expires in:</span>
            <div className="flex items-center gap-1 font-mono font-bold text-amber-400">
              <span className="bg-amber-400/10 px-2 py-1 rounded">
                {formatTime(offerCountdown.hours)}
              </span>
              <span>:</span>
              <span className="bg-amber-400/10 px-2 py-1 rounded">
                {formatTime(offerCountdown.minutes)}
              </span>
              <span>:</span>
              <span className="bg-amber-400/10 px-2 py-1 rounded">
                {formatTime(offerCountdown.seconds)}
              </span>
            </div>
          </div>

          {/* Footer Note */}
          <div className="text-center py-3 px-6 border-t border-border/50">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="h-3 w-3 text-primary" />
              Instant access • 7-day free trial included • No credit card required
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SpecialOfferModal;
