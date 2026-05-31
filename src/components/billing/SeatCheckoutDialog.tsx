import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Minus, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { UserPlan } from '@/hooks/useUserPlans';
import { useInitiatePayment } from '@/hooks/useSubscription';
import { useFxRate } from '@/hooks/useFxRate';
import { isSafeHttpsUrl, PAYMENT_REDIRECT_ORIGINS } from '@/lib/safeUrl';

function formatCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SeatCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: UserPlan | null;
  billingInterval: 'monthly' | 'yearly';
  /** Seats already consumed (active members + pending invites). */
  currentUsed: number;
}

export function SeatCheckoutDialog({
  open,
  onOpenChange,
  plan,
  billingInterval,
  currentUsed,
}: SeatCheckoutDialogProps) {
  const initiatePayment = useInitiatePayment();
  const { data: fx } = useFxRate();

  const isYearly = billingInterval === 'yearly';
  const perSeat = plan ? ((isYearly ? plan.price_yearly : plan.price_monthly) ?? 0) : 0;
  const currency = plan?.currency || 'USD';
  const minSeats = Math.max(1, currentUsed);

  const [seats, setSeats] = useState(minSeats);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) {
      setSeats(minSeats);
      setEmails([]);
      setDraft('');
    }
  }, [open, minSeats]);

  // Seats must cover existing members plus everyone being invited now.
  const requiredSeats = Math.max(seats, currentUsed + emails.length);
  const total = perSeat * requiredSeats;

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e) || emails.includes(e)) return;
    setEmails((prev) => [...prev, e]);
    setDraft('');
  };

  const handleDraftKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      addEmail(draft);
    }
  };

  const ngnPreview = useMemo(() => {
    if (currency.toUpperCase() !== 'USD' || !fx || fx.settle_currency !== 'NGN') return null;
    return Math.round(total * fx.rate).toLocaleString();
  }, [currency, fx, total]);

  const handleSubmit = async () => {
    if (!plan) return;
    try {
      const result = await initiatePayment.mutateAsync({
        plan_id: plan.id,
        billing_interval: billingInterval,
        seats: requiredSeats,
        invite_emails: emails,
        redirect_url: `${window.location.origin}/billing/callback`,
      });
      const url =
        (result as { authorization_url?: string; payment_link?: string }).authorization_url ??
        (result as { authorization_url?: string; payment_link?: string }).payment_link;
      // Defense-in-depth: only navigate to a server-supplied checkout URL when
      // it is https and on an expected payment-provider origin.
      if (isSafeHttpsUrl(url, PAYMENT_REDIRECT_ORIGINS)) {
        window.location.href = url;
      } else if (url) {
        toast.error('Checkout error', {
          description: 'Received an unexpected payment URL. Please try again or contact support.',
        });
      }
    } catch {
      // toast handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{plan?.display_name || plan?.name} — choose seats</DialogTitle>
          <DialogDescription>
            You pay per user. Set how many seats you need and (optionally) invite your team — they
            get an email the moment payment succeeds.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Seat stepper */}
          <div className="space-y-2">
            <Label>Seats</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSeats((s) => Math.max(minSeats, s - 1))}
                disabled={requiredSeats <= minSeats}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-lg font-semibold">{requiredSeats}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSeats((s) => Math.max(requiredSeats, s) + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                × {formatCurrency(perSeat, currency)}/{isYearly ? 'yr' : 'mo'}
              </span>
            </div>
            {currentUsed > 0 && (
              <p className="text-xs text-muted-foreground">
                {currentUsed} seat{currentUsed === 1 ? '' : 's'} already in use (you + your team).
              </p>
            )}
          </div>

          {/* Invite emails */}
          <div className="space-y-2">
            <Label htmlFor="seat-emails">Invite teammates (optional)</Label>
            <Input
              id="seat-emails"
              type="email"
              placeholder="name@firm.com — press Enter to add"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKey}
              onBlur={() => addEmail(draft)}
            />
            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {emails.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1">
                    {e}
                    <button
                      type="button"
                      onClick={() => setEmails((prev) => prev.filter((x) => x !== e))}
                      className="ml-0.5 rounded-full hover:text-destructive"
                      aria-label={`Remove ${e}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {emails.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Seats auto-adjust to cover everyone you invite.
              </p>
            )}
          </div>

          {/* Total */}
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                Total ({requiredSeats} seat{requiredSeats === 1 ? '' : 's'})
              </span>
              <span className="text-2xl font-bold tracking-tight">
                {formatCurrency(total, currency)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  /{isYearly ? 'yr' : 'mo'}
                </span>
              </span>
            </div>
            {ngnPreview && (
              <p className="mt-1 text-right text-xs font-medium text-primary">≈ ₦{ngnPreview}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={initiatePayment.isPending}>
            {initiatePayment.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              `Continue to payment`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
