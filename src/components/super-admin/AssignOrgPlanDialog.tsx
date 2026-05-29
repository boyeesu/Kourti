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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useUserPlans } from '@/hooks/useUserPlans';
import { useAssignOrgPlan } from '@/hooks/useOrgPlan';
import { format } from 'date-fns';

interface AssignOrgPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
  /** Pre-select the plan the org is already on, if any. */
  currentPlanId?: string | null;
}

type ExpiryChoice = '30d' | '1y' | 'custom' | 'none';

export function AssignOrgPlanDialog({
  open,
  onOpenChange,
  orgId,
  orgName,
  currentPlanId,
}: AssignOrgPlanDialogProps) {
  const { data: plans = [], isLoading: plansLoading } = useUserPlans();
  const assignPlan = useAssignOrgPlan();

  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [expiry, setExpiry] = useState<ExpiryChoice>('none');
  const [customDate, setCustomDate] = useState<string>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedPlanId(currentPlanId ?? '');
      setExpiry('none');
      setCustomDate('');
      setNotes('');
    }
  }, [open, currentPlanId]);

  const resolveExpiresAt = (): string | null => {
    const now = new Date();
    if (expiry === '30d') {
      now.setDate(now.getDate() + 30);
      return now.toISOString();
    }
    if (expiry === '1y') {
      now.setFullYear(now.getFullYear() + 1);
      return now.toISOString();
    }
    if (expiry === 'custom') {
      return customDate ? new Date(customDate).toISOString() : null;
    }
    return null; // 'none' → open-ended comp grant
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlanId) return;
    if (expiry === 'custom' && !customDate) return;

    await assignPlan.mutateAsync({
      orgId,
      planId: selectedPlanId,
      expiresAt: resolveExpiresAt(),
      notes: notes || undefined,
    });
    onOpenChange(false);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Plan to Organization</DialogTitle>
          <DialogDescription>
            Grant a plan to every current member of <strong>{orgName}</strong>. This is a manual
            grant and does not create a Paystack charge.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-plan">Plan *</Label>
            <Select
              value={selectedPlanId}
              onValueChange={setSelectedPlanId}
              disabled={plansLoading}
            >
              <SelectTrigger id="org-plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.display_name}
                    {plan.plan_type !== 'free' && ` (${plan.plan_type})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlan?.description && (
              <p className="text-sm text-muted-foreground">{selectedPlan.description}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-expiry">Expiry</Label>
            <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
              <SelectTrigger id="org-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No expiry (comp)</SelectItem>
                <SelectItem value="30d">30 days</SelectItem>
                <SelectItem value="1y">1 year</SelectItem>
                <SelectItem value="custom">Custom date…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {expiry === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="org-expiry-date">Expiration date *</Label>
              <Input
                id="org-expiry-date"
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="org-notes">Notes (optional)</Label>
            <Textarea
              id="org-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for this grant (e.g. contract, comp, trial extension)…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !selectedPlanId || (expiry === 'custom' && !customDate) || assignPlan.isPending
              }
            >
              {assignPlan.isPending ? 'Assigning…' : 'Assign Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
