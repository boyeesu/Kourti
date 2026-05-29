import { ArrowRight, Sparkles } from 'lucide-react';
import { Mascot } from '@/components/ui/Mascot';

const CTA = () => {
  return (
    <section className="py-16 sm:py-24 bg-gradient-cta relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[200px] bg-primary/5 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Mascot Peeking from top on large screens */}
        <div className="absolute -top-24 -left-12 hidden lg:block rotate-12">
          <Mascot variant="float" size="sm" className="opacity-90" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm mb-6 sm:mb-8">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Join 500+ legal professionals
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4 sm:mb-6 leading-tight px-2">
          Start running your practice <span className="text-gradient">on AI today.</span>
        </h2>

        <p className="text-base sm:text-lg text-muted-foreground mb-8 sm:mb-10 max-w-2xl mx-auto px-4">
          Join legal teams using Kourti to move faster, stay deadline-safe, and spend less time on
          admin work.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            className="btn-primary h-14 px-10 text-base group inline-flex items-center justify-center"
            onClick={() => window.open('https://app.kourti.com', '_blank')}
          >
            Start free trial
            <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            className="btn-gradient-border h-14 px-10 text-base text-foreground hover:bg-primary/5 rounded-full font-semibold inline-flex items-center justify-center"
            onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
          >
            Book a demo
          </button>
        </div>

        {/* Trust Microcopy */}
        <p className="text-xs sm:text-sm text-muted-foreground mt-6">
          No credit card required · Setup in minutes
        </p>
      </div>
    </section>
  );
};

export default CTA;
