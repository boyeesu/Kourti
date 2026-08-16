import Navigation from '@/components/ui/navigation';
import Hero from '@/components/sections/Hero';
import HowItWorks from '@/components/sections/HowItWorks';
import Features from '@/components/sections/Features';
import CTA from '@/components/sections/CTA';
import Footer from '@/components/sections/Footer';
import SEO from '@/components/SEO';

// JSON-LD structured data for this route lives in scripts/seo-routes.mjs and is
// baked into the static HTML at build time, so non-JS crawlers and social
// scrapers see it. Keeping it out of the runtime head avoids duplicate
// <script type="application/ld+json"> blocks after hydration.

const Index = () => {
  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <SEO
        title="Kourti Legal | The open-source workspace for legal practice"
        description="Keep matters, clients, documents and deadlines in one focused workspace. Kourti is open source and available for guided demos."
        path="/"
      />
      <Navigation />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <CTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
