import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, FileText, ClipboardCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'kourti_promo_dismissed';
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const PromoPopup = () => {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION_MS) {
      return;
    }

    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    setExiting(true);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setTimeout(() => setVisible(false), 300);
  };

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[100] flex items-center justify-center p-4',
        'bg-black/60 backdrop-blur-sm',
        'transition-opacity duration-300',
        exiting ? 'opacity-0' : 'opacity-100 animate-in fade-in'
      )}
      onClick={dismiss}
    >
      <div
        className={cn(
          'relative w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0c14] shadow-2xl shadow-primary/10',
          'transition-all duration-300',
          exiting ? 'scale-95 opacity-0' : 'scale-100 opacity-100 animate-in zoom-in-95'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accent */}
        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content */}
        <div className="p-6 pt-8 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
            <Sparkles className="h-3 w-3" />
            New for Nigerian Lawyers
          </div>

          <h3 className="text-xl font-bold text-foreground mb-2">
            How Tech-Ready Is Your Practice?
          </h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Discover where your firm stands with our free assessment, or explore the latest
            LegalTech insights for Nigeria.
          </p>

          {/* CTA Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Link
              to="/assessment"
              onClick={dismiss}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold text-foreground">Take Assessment</span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                2 min &middot; Free
              </span>
            </Link>

            <Link
              to="/report/legaltech-nigeria-q1-2026"
              onClick={dismiss}
              className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20 transition-all"
            >
              <div className="p-2 rounded-lg bg-white/5 text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-all">
                <FileText className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold text-foreground">View Report</span>
              <span className="text-[11px] text-muted-foreground leading-tight">
                Q1 2026 Insights
              </span>
            </Link>
          </div>

          <button
            onClick={dismiss}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromoPopup;
