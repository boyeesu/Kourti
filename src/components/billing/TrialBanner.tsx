import { Link } from 'react-router-dom';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';

export function TrialBanner() {
  const { data } = useTrialStatus();
  const { data: isPlatformAdmin } = usePlatformAdmin();
  if (!data) return null;

  // Platform admins/staff aren't billed — don't nag them about the org's trial.
  if (isPlatformAdmin) return null;

  if (data.status === 'active') return null;

  if (data.status === 'trialing' && !data.is_expired) {
    const days = data.days_remaining;
    return (
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-gradient-to-r from-[#afc8f0]/15 to-[#79a5ea]/15 px-4 py-2 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Sparkles className="h-4 w-4 text-[#79a5ea]" />
          <span>
            <strong>{days}</strong> day{days === 1 ? '' : 's'} left in your free trial.
          </span>
        </div>
        <Button asChild size="sm" variant="default">
          <Link to="/pricing">Upgrade now</Link>
        </Button>
      </div>
    );
  }

  // expired / none / past_due
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-400/40 bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/40">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="h-4 w-4" />
        <span>Your free trial has ended. Subscribe to keep using Kourti.</span>
      </div>
      <Button asChild size="sm">
        <Link to="/pricing">Choose a plan</Link>
      </Button>
    </div>
  );
}
