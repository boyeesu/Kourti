import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import About from './pages/About';
import FeaturesPage from './pages/Features';
import Security from './pages/Security';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import AIPolicy from './pages/AIPolicy';
import NotFound from './pages/NotFound';
import Report from './pages/Report';
import Assessment from './pages/Assessment';
import CookieConsent from './components/ui/CookieConsent';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/security" element={<Security />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-use" element={<TermsOfUse />} />
          <Route path="/ai-policy" element={<AIPolicy />} />
          <Route path="/report/legaltech-nigeria-q1-2026" element={<Report />} />
          <Route path="/assessment" element={<Assessment />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <CookieConsent />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
