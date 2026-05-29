import { useEffect, useState } from 'react';
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
import { useAddSeats } from '@/hooks/useSubscription';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AddSeatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSeatsDialog({ open, onOpenChange }: AddSeatsDialogProps) {
  const addSeats = useAddSeats();

  const [count, setCount] = useState(1);
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) {
      setCount(1);
      setEmails([]);
      setDraft('');
    }
  }, [open]);

  // Seats must cover everyone being invited in this batch.
  const seatsToAdd = Math.max(count, emails.length);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || emails.includes(e)) return;
    setEmails((prev) => [...prev, e]);
    setDraft('');
  };

  const handleDraftKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      addEmail(draft);
    }
  };

  const handleSubmit = async () => {
    try {
      const result = await addSeats.mutateAsync({
        seats: seatsToAdd,
        invite_emails: emails,
        redirect_url: `${window.location.origin}/billing/callback`,
      });
      const url =
        (result as { authorization_url?: string; payment_link?: string }).authorization_url ??
        (result as { authorization_url?: string; payment_link?: string }).payment_link;
      if (url) window.location.href = url;
    } catch {
      // toast handled by the mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add team members</DialogTitle>
          <DialogDescription>
            Buy more seats for your plan. You&apos;re charged a prorated amount for the rest of your
            current billing period — the exact total is shown on the payment page. New seats renew
            with your plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Seats to add</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                disabled={seatsToAdd <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-lg font-semibold">{seatsToAdd}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setCount((c) => Math.max(seatsToAdd, c) + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-seat-emails">Invite teammates (optional)</Label>
            <Input
              id="add-seat-emails"
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
                Seats auto-adjust to cover everyone you invite. Invites send once payment succeeds.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={addSeats.isPending}>
            {addSeats.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              `Add ${seatsToAdd} seat${seatsToAdd === 1 ? '' : 's'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
