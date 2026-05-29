import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { CreditCard, Calendar, AlertTriangle, ArrowUpRight, Loader2, Users } from 'lucide-react';
import {
  useCurrentSubscription,
  useManageSubscription,
  useSeatUsage,
} from '@/hooks/useSubscription';
import { useCurrentUserPlan } from '@/hooks/useUserPlans';
import { PlanSelector } from '@/components/billing/PlanSelector';
import { AddSeatsDialog } from '@/components/billing/AddSeatsDialog';
import { PaymentHistory } from '@/components/billing/PaymentHistory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANTS: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  trialing: {
    label: 'Trialing',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  },
  past_due: {
    label: 'Past Due',
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  paused: {
    label: 'Paused',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
};

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BillingTab() {
  const { data: subscription, isLoading: subLoading } = useCurrentSubscription();
  const { data: currentPlan, isLoading: planLoading } = useCurrentUserPlan();
  const { data: seatUsage } = useSeatUsage();
  const manageSubscription = useManageSubscription();

  const [planSelectorOpen, setPlanSelectorOpen] = useState(false);
  const [addSeatsOpen, setAddSeatsOpen] = useState(false);

  // auto-open PlanSelector when redirected with ?plan=…&cycle=… (e.g.
  // from the TrialExpiredModal). One-shot per navigation so we don't
  // fight the user closing it. We also forward the picked plan + cycle
  // into PlanSelector so the dialog opens already aligned with what the
  // user chose upstream.
  const [searchParams] = useSearchParams();
  const autoOpenPlan = searchParams.get('plan');
  const autoOpenCycle = searchParams.get('cycle');
  const initialCycle: 'monthly' | 'yearly' = autoOpenCycle === 'yearly' ? 'yearly' : 'monthly';
  const [autoOpenedFor, setAutoOpenedFor] = useState<string | null>(null);
  if (autoOpenPlan && autoOpenedFor !== autoOpenPlan && !planSelectorOpen) {
    setAutoOpenedFor(autoOpenPlan);
    setPlanSelectorOpen(true);
  }
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const isLoading = subLoading || planLoading;

  // ----- Cancel handler -----
  const handleCancelSubscription = async () => {
    if (!subscription) return;

    try {
      await manageSubscription.mutateAsync({
        action: 'cancel',
        subscription_id: subscription.id,
      });
      setCancelDialogOpen(false);
    } catch {
      // Error is handled in the mutation's onError callback
    }
  };

  // ----- Loading state -----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading billing information...</span>
      </div>
    );
  }

  const hasActiveSubscription = !!subscription && subscription.status !== 'cancelled';

  return (
    <div className="space-y-6">
      {/* ---- Current Plan Card ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Current Plan
              </CardTitle>
              <CardDescription>Your active subscription and billing details</CardDescription>
            </div>
            {hasActiveSubscription && (
              <Badge className={STATUS_VARIANTS[subscription.status]?.className}>
                {STATUS_VARIANTS[subscription.status]?.label ?? subscription.status}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasActiveSubscription && currentPlan ? (
            <>
              {/* Plan details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Plan</p>
                  <p className="text-lg font-semibold">
                    {currentPlan.plan_display_name || currentPlan.plan_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Type</p>
                  <p className="text-lg font-semibold capitalize">{currentPlan.plan_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Billing Interval</p>
                  <p className="text-lg font-semibold capitalize">
                    {subscription.billing_interval}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Next Billing Date</p>
                  <p className="text-lg font-semibold flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {formatDate(subscription.current_period_end)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Seats</p>
                  <p className="text-lg font-semibold flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {seatUsage ? `${seatUsage.used} of ${seatUsage.seats} used` : '—'}
                  </p>
                </div>
              </div>

              {/* Cancel at period end notice */}
              {subscription.cancel_at_period_end && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Your subscription has been cancelled and will remain active until{' '}
                    <strong>{formatDate(subscription.current_period_end)}</strong>. After that you
                    will be moved to the Free plan.
                  </p>
                </div>
              )}

              {/* Features */}
              {currentPlan.features && currentPlan.features.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted-foreground">
                      Included Features
                    </p>
                    <ul className="grid gap-1 sm:grid-cols-2">
                      {currentPlan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-foreground">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Actions */}
              <Separator />
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setPlanSelectorOpen(true)}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Change Plan
                </Button>
                <Button variant="outline" onClick={() => setAddSeatsOpen(true)}>
                  <Users className="mr-2 h-4 w-4" />
                  Add team members
                </Button>
                {!subscription.cancel_at_period_end && (
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Subscription
                  </Button>
                )}
              </div>
            </>
          ) : (
            /* ---- Free / No Subscription State ---- */
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="rounded-full bg-muted p-4">
                <CreditCard className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">You&apos;re on the Free plan</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upgrade to unlock premium features and increase your team&apos;s productivity.
                </p>
              </div>
              <Button onClick={() => setPlanSelectorOpen(true)}>
                <ArrowUpRight className="mr-2 h-4 w-4" />
                Upgrade Now
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Payment History ---- */}
      <PaymentHistory />

      {/* ---- Plan Selector Dialog ---- */}
      <PlanSelector
        open={planSelectorOpen}
        onOpenChange={setPlanSelectorOpen}
        initialPlanId={autoOpenPlan ?? undefined}
        initialCycle={initialCycle}
      />

      {/* ---- Add Seats Dialog ---- */}
      <AddSeatsDialog open={addSeatsOpen} onOpenChange={setAddSeatsOpen} />

      {/* ---- Cancel Confirmation Dialog ---- */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your subscription? Your plan will remain active until{' '}
              <strong>{formatDate(subscription?.current_period_end)}</strong>. After that you will
              be downgraded to the Free plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={manageSubscription.isPending}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubscription}
              disabled={manageSubscription.isPending}
            >
              {manageSubscription.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
