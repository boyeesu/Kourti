import Navigation from '@/components/ui/navigation';
import Hero from '@/components/sections/Hero';
import TrustedBy from '@/components/sections/TrustedBy';
import HowItWorks from '@/components/sections/HowItWorks';
import Features from '@/components/sections/Features';
import Personas from '@/components/sections/Personas';
import Stats from '@/components/sections/Stats';
import Testimonials from '@/components/sections/Testimonials';
import CTA from '@/components/sections/CTA';
import Footer from '@/components/sections/Footer';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import PromoPopup from '@/components/ui/PromoPopup';
import SEO from '@/components/SEO';

// JSON-LD structured data for this route lives in scripts/seo-routes.mjs and is
// baked into the static HTML at build time, so non-JS crawlers and social
// scrapers see it. Keeping it out of the runtime head avoids duplicate
// <script type="application/ld+json"> blocks after hydration.

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="Kourti Legal | AI-Powered Legal Practice Management Software"
        description="Run your law practice on AI. Manage matters, clients, contracts, and deadlines in one place — while AI summarizes documents, flags risk, and keeps your team on track. Start your 7-day free trial."
        path="/"
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10">
        <Hero />
        <TrustedBy />
        <HowItWorks />
        <Features />
        <Personas />
        <Stats />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
      <PromoPopup />
    </div>
  );
};

export default Index;
