import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useUserPlans, useAssignUserPlan, useCurrentUserPlan } from '@/hooks/useUserPlans';
import { PlatformUser } from '@/hooks/useAllUsers';
import { format } from 'date-fns';

interface AssignPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: PlatformUser | null;
}

export function AssignPlanDialog({ open, onOpenChange, user }: AssignPlanDialogProps) {
  const { data: plans = [], isLoading: plansLoading } = useUserPlans();
  const { data: currentPlan } = useCurrentUserPlan(user?.user_id);
  const assignPlan = useAssignUserPlan();

  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [hasExpiration, setHasExpiration] = useState(false);
  const [expirationDate, setExpirationDate] = useState<string>('');
  const [notes, setNotes] = useState('');

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
    if (open && user) {
      if (currentPlan) {
        setSelectedPlanId(currentPlan.plan_id);
      } else {
        setSelectedPlanId('');
      }
      setHasExpiration(false);
      setExpirationDate('');
      setNotes('');
    }
  }, [open, user, currentPlan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !selectedPlanId) {
      return;
    }

    const expiresAt = hasExpiration && expirationDate 
      ? new Date(expirationDate) 
      : null;

    await assignPlan.mutateAsync({
      userId: user.user_id,
      planId: selectedPlanId,
      expiresAt,
      notes: notes || undefined,
    });

    onOpenChange(false);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Assign Plan to User</DialogTitle>
          <DialogDescription>
            {user && (
              <>
                Assign a plan to {user.first_name} {user.last_name} ({user.email})
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan">Plan *</Label>
            <Select
              value={selectedPlanId}
              onValueChange={setSelectedPlanId}
              disabled={plansLoading}
            >
              <SelectTrigger id="plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.display_name} {plan.plan_type !== 'free' && `(${plan.plan_type})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlan && (
              <p className="text-sm text-muted-foreground">
                {selectedPlan.description}
              </p>
            )}
          </div>

          {currentPlan && (
            <div className="rounded-md border p-3 bg-muted/50">
              <p className="text-sm font-medium">Current Plan:</p>
              <p className="text-sm text-muted-foreground">
                {currentPlan.plan_display_name}
                {currentPlan.expires_at && (
                  <> (expires {format(new Date(currentPlan.expires_at), 'MMM dd, yyyy')})</>
                )}
              </p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="has-expiration"
              checked={hasExpiration}
              onCheckedChange={(checked) => setHasExpiration(checked as boolean)}
            />
            <Label htmlFor="has-expiration" className="cursor-pointer">
              Set expiration date
            </Label>
          </div>

          {hasExpiration && (
            <div className="space-y-2">
              <Label htmlFor="expiration-date">Expiration Date</Label>
              <Input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this plan assignment..."
              rows={3}
            />
          </div>

          {selectedPlan && selectedPlan.features.length > 0 && (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium mb-2">Plan Features:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {selectedPlan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedPlanId || assignPlan.isPending}
            >
              {assignPlan.isPending ? 'Assigning...' : 'Assign Plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
