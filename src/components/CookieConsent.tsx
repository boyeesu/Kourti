import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie } from 'lucide-react';

const CONSENT_KEY = 'kourti_cookie_consent';

declare global {
  interface Window {
    __kourtiInitAnalytics?: () => void;
    __kourtiAnalyticsInited?: boolean;
    clarity?: (...args: unknown[]) => void;
  }
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
    window.__kourtiInitAnalytics?.();
  };

  const handleReject = () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
    window.mixpanel?.opt_out_tracking?.();
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-sm shadow-lg"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            We use cookies and analytics tools to improve your experience. By accepting you consent
            to our use of Microsoft Clarity and Mixpanel for usage analytics. See our{' '}
            <a
              href="https://kourti.com/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:no-underline"
            >
              Privacy Policy
            </a>{' '}
            for details.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Reject
          </Button>
          <Button size="sm" onClick={handleAccept}>
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
