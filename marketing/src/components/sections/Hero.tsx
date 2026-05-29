import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, CheckCircle, Sun, Moon, FileText } from 'lucide-react';
import dashboardDark from '@/assets/dashboard-dark.png';
import dashboardLight from '@/assets/dashboard-light.png';
import { Mascot } from '@/components/ui/Mascot';

const Hero = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);

  const badges = [
    { label: '50% Faster', icon: Zap },
    { label: '>99% Accuracy', icon: CheckCircle },
    { label: 'SOC 2 Compliant', icon: Shield },
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-halftone">
      {/* Background Elements */}
      <div className="absolute inset-0 bg-dot-pattern"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl"></div>

      {/* Floating Mascot - Hidden on small mobile, visible on tablet+ */}
      <div className="absolute top-[15%] right-[10%] hidden md:block z-20 opacity-80 hover:opacity-100 transition-opacity">
        <Mascot variant="float" size="md" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center pt-40 sm:pt-52 pb-16 sm:pb-24">
        {/* Announcement Banner */}
        <div className="mb-6 animate-fade-in">
          <Link
            to="/report/legaltech-nigeria-q1-2026"
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30 transition-all duration-300 group"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20">
              <FileText className="h-3 w-3 text-primary" />
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">
              <span className="text-primary font-semibold">New:</span> Q1 2026 State of LegalTech in
              Nigeria Report
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-primary group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {/* Main Headline */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.2] mb-6 tracking-tight animate-fade-in">
          One platform.
          <span className="block text-gradient mt-2 pb-2">Every legal task.</span>
        </h1>

        {/* Value Statement */}
        <p
          className="text-sm sm:text-base md:text-lg text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed animate-fade-in"
          style={{ animationDelay: '0.1s' }}
        >
          From managing matters and deadlines to summarizing documents and flagging risk, everything
          your team needs in one place.
        </p>

        {/* CTA Buttons */}
        <div
          className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in"
          style={{ animationDelay: '0.2s' }}
        >
          <Button
            size="lg"
            className="btn-primary h-12 px-6 text-sm group"
            onClick={() => window.open('https://app.kourti.com', '_blank')}
          >
            Start free trial
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="btn-secondary h-12 px-6 text-sm group"
            onClick={() => window.open('https://cal.com/kourti-legal/discovery', '_blank')}
          >
            Book a demo
          </Button>
        </div>

        {/* Trust Microcopy */}
        <p
          className="text-xs sm:text-sm text-muted-foreground mt-4 animate-fade-in"
          style={{ animationDelay: '0.25s' }}
        >
          No credit card required · Setup in minutes
        </p>

        {/* Product Hunt Badge Placeholder */}
        <div className="mt-8 animate-fade-in px-4" style={{ animationDelay: '0.4s' }}>
          <a
            href="https://www.producthunt.com/products/kourti-legal?launch=kourti-legal"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#DA552F]/10 border border-[#DA552F]/30 hover:bg-[#DA552F]/20 transition-colors cursor-pointer"
          >
            <span className="text-xs sm:text-sm text-[#DA552F] font-medium text-center">
              🚀 Kourti Legal - AI-Powered Legal Management | Product Hunt
            </span>
          </a>
        </div>

        {/* Dashboard Preview */}
        <div className="mt-16 mb-10 relative animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 rounded-3xl blur-2xl"></div>
          <div className="relative card-dark overflow-hidden rounded-2xl border border-border/50">
            {/* Theme Toggle */}
            <div className="absolute top-4 right-4 z-30">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-md border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all duration-300 shadow-lg"
              >
                <div className="relative w-10 h-5 rounded-full bg-muted/50 p-0.5 transition-colors duration-300">
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-foreground shadow-md transition-all duration-300 flex items-center justify-center ${
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

            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80 z-10"></div>

            {/* Dark Mode Image */}
            <img
              src={dashboardDark}
              alt="Kourti Legal Hub Dashboard - Dark Mode"
              className={`w-full h-auto max-h-[500px] object-cover object-top transition-opacity duration-500 ${
                isDarkMode ? 'opacity-100' : 'opacity-0 absolute inset-0'
              }`}
            />

            {/* Light Mode Image */}
            <img
              src={dashboardLight}
              alt="Kourti Legal Hub Dashboard - Light Mode"
              className={`w-full h-auto max-h-[500px] object-cover object-top transition-opacity duration-500 ${
                !isDarkMode ? 'opacity-100' : 'opacity-0 absolute inset-0'
              }`}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
