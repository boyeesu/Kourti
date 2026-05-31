import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kourti_cookie_consent';

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY);
    if (consent) return;

    const timer = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(timer);
  }, []);

  const accept = () => {
    setExiting(true);
    localStorage.setItem(STORAGE_KEY, 'accepted');
    // Initialise analytics now that the user has consented
    window.__kourtiInitAnalytics?.();
    setTimeout(() => setVisible(false), 300);
  };

  const decline = () => {
    setExiting(true);
    localStorage.setItem(STORAGE_KEY, 'declined');
    // Ensure Mixpanel stops tracking if it was somehow already loaded
    window.mixpanel?.opt_out_tracking?.();
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-[90] p-4 sm:p-6',
        'transition-all duration-300',
        exiting
          ? 'translate-y-full opacity-0'
          : 'translate-y-0 opacity-100 animate-in slide-in-from-bottom'
      )}
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#0c0c14]/95 backdrop-blur-xl shadow-2xl shadow-primary/5">
        {/* Top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Icon + Text */}
            <div className="flex items-start gap-3 flex-1">
              <div className="shrink-0 p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <Cookie className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  We Value Your Privacy
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We use cookies and similar technologies to enhance your experience, analyse site
                  usage, and assist in our marketing efforts. By clicking "Accept", you consent to
                  the use of these technologies. Read our{' '}
                  <Link
                    to="/privacy-policy"
                    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                  >
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link
                    to="/cookie-policy"
                    className="text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
                  >
                    Cookie Policy
                  </Link>{' '}
                  to learn more.
                </p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                onClick={decline}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
              >
                Decline
              </button>
              <button
                onClick={accept}
                className="flex-1 sm:flex-none px-5 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
