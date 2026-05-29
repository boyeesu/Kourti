import Navigation from '@/components/ui/navigation';
import Hero from '@/components/sections/Hero';
import HowItWorks from '@/components/sections/HowItWorks';
import Features from '@/components/sections/Features';
import Stats from '@/components/sections/Stats';
import Testimonials from '@/components/sections/Testimonials';
import CTA from '@/components/sections/CTA';
import Footer from '@/components/sections/Footer';
import MouseFollowGlow from '@/components/ui/MouseFollowGlow';
import PromoPopup from '@/components/ui/PromoPopup';
import SEO from '@/components/SEO';

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Kourti Legal',
  url: 'https://kourti.com',
  logo: 'https://kourti.com/favicon.png',
  description:
    'AI-powered legal practice management software for matters, contracts, deadlines and document analysis.',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'info@kourti.com',
    contactType: 'customer support',
  },
  sameAs: [],
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Kourti Legal',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'AI-powered legal practice management app for matters, contracts, deadlines, document analysis and client management.',
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'USD',
    lowPrice: '20',
    highPrice: '50',
    offerCount: '3',
  },
};

const Index = () => {
  return (
    <div className="min-h-screen bg-background relative">
      <SEO
        title="Kourti Legal | AI-Powered Legal Practice Management Software"
        description="Run your law practice on AI. Manage matters, clients, contracts, and deadlines in one place — while AI summarizes documents, flags risk, and keeps your team on track. Start your 7-day free trial."
        path="/"
        jsonLd={[organizationSchema, softwareSchema]}
      />
      <MouseFollowGlow />
      <Navigation />
      <main className="relative z-10">
        <Hero />
        <HowItWorks />
        <Features />
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
