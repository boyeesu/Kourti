import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sun, Moon, FileText } from 'lucide-react';
import dashboardDark from '@/assets/dashboard-dark.png';
import dashboardLight from '@/assets/dashboard-light.png';
import { Mascot } from '@/components/ui/Mascot';

const Hero = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-halftone">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-dot-pattern"></div>
      <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-primary/5 blur-3xl"></div>

      {/* Floating Mascot - Hidden on small mobile, visible on tablet+ */}
      <div className="absolute right-[10%] top-[15%] z-20 hidden opacity-80 transition-opacity hover:opacity-100 md:block">
        <Mascot variant="float" size="md" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-16 pt-40 text-center sm:px-6 sm:pb-24 sm:pt-52 lg:px-8">
        {/* Announcement Banner */}
        <div className="animate-fade-in mb-6">
          <Link
            to="/report/legaltech-nigeria-q1-2026"
            className="group inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 transition-all duration-300 hover:border-primary/30 hover:bg-primary/15"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20">
              <FileText className="h-3 w-3 text-primary" />
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              <span className="font-semibold text-primary">New:</span> Q1 2026 State of LegalTech in
              Nigeria Report
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-primary transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Main Headline */}
        <h1 className="animate-fade-in mb-6 text-3xl font-bold leading-[1.2] tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
          Your AI legal associate.
          <span className="mt-2 block pb-2 text-gradient">From first draft to final deadline.</span>
        </h1>

        {/* Value Statement */}
        <p
          className="animate-fade-in mx-auto mb-8 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base md:text-lg"
          style={{ animationDelay: '0.1s' }}
        >
          Kourti reviews documents, redlines contracts, and negotiates alongside you — then keeps
          every matter, client, and deadline on track. All in one place.
        </p>

        {/* CTA Buttons */}
        <div
          className="animate-fade-in flex flex-col justify-center gap-4 sm:flex-row"
          style={{ animationDelay: '0.2s' }}
        >
          <Button
            size="lg"
            className="btn-primary group h-12 px-6 text-sm"
            onClick={() => window.open('https://app.kourti.com', '_blank')}
          >
            Start free trial
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="btn-secondary group h-12 px-6 text-sm"
            onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
          >
            Book a demo
          </Button>
        </div>

        {/* Trust Microcopy */}
        <p
          className="animate-fade-in mt-4 text-xs text-muted-foreground sm:text-sm"
          style={{ animationDelay: '0.25s' }}
        >
          7-day free trial · No credit card required · Setup in minutes
        </p>

        {/* Dashboard Preview */}
        <div className="animate-slide-up relative mb-10 mt-16" style={{ animationDelay: '0.5s' }}>
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-primary/20 via-transparent to-primary/20 blur-2xl"></div>
          <div className="card-dark relative overflow-hidden rounded-2xl border border-border/50">
            {/* Theme Toggle */}
            <div className="absolute right-4 top-4 z-30">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                aria-label={`Switch dashboard preview to ${isDarkMode ? 'light' : 'dark'} mode`}
                className="flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur-md transition-all duration-300 hover:border-primary/50 hover:text-foreground"
              >
                <div className="relative h-5 w-10 rounded-full bg-muted/50 p-0.5 transition-colors duration-300">
                  <div
                    className={`absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-foreground shadow-md transition-all duration-300 ${
                      isDarkMode ? 'left-0.5' : 'left-[calc(100%-18px)]'
                    }`}
                  >
                    {isDarkMode ? (
                      <Moon className="h-2.5 w-2.5 text-background" />
                    ) : (
                      <Sun className="h-2.5 w-2.5 text-background" />
                    )}
                  </div>
                </div>
                <span className="hidden sm:inline">{isDarkMode ? 'Dark' : 'Light'}</span>
              </button>
            </div>

            <div className="absolute inset-0 z-10 bg-gradient-to-b from-transparent to-background/80"></div>

            {/* Dark Mode Image */}
            <img
              src={dashboardDark}
              alt="Kourti Legal dashboard in dark mode"
              className={`h-auto max-h-[500px] w-full object-cover object-top transition-opacity duration-500 ${
                isDarkMode ? 'opacity-100' : 'absolute inset-0 opacity-0'
              }`}
            />

            {/* Light Mode Image */}
            <img
              src={dashboardLight}
              alt="Kourti Legal dashboard in light mode"
              className={`h-auto max-h-[500px] w-full object-cover object-top transition-opacity duration-500 ${
                !isDarkMode ? 'opacity-100' : 'absolute inset-0 opacity-0'
              }`}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
