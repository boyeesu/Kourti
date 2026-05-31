import { useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CreditCard, RefreshCw, Search, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  useAddCredit,
  useBillingDunning,
  useBillingReconciliation,
  useOrgBilling,
  useOrgSeatUsage,
  useRecordAdjustment,
  type AdjustmentType,
} from '@/hooks/useAdminBilling';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function formatMinor(amountMinor: number | null | undefined, currency: string | null | undefined) {
  if (amountMinor == null) return '--';
  const cur = currency || 'NGN';
  const symbol = cur === 'NGN' ? '₦' : cur === 'USD' ? '$' : `${cur} `;
  return `${symbol}${(amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null | undefined) {
  return d ? format(new Date(d), 'MMM dd, yyyy') : '--';
}

// ---------- Reconciliation ----------

function ReconciliationCard() {
  const { data: rows = [], isLoading, refetch, isFetching } = useBillingReconciliation();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Reconciliation</CardTitle>
            <CardDescription>
              Orgs where a manual plan grant diverges from the live subscription
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No divergences detected. Grants and subscriptions are in sync.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Granted Plan</TableHead>
                  <TableHead>Subscription Plan</TableHead>
                  <TableHead>Sub Status</TableHead>
                  <TableHead>Divergence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.organization_id}>
                    <TableCell className="font-medium">
                      {r.organization_name || r.organization_id}
                    </TableCell>
                    <TableCell>{r.granted_plan_name || '--'}</TableCell>
                    <TableCell>{r.subscription_plan_name || '--'}</TableCell>
                    <TableCell>
                      {r.subscription_status ? (
                        <Badge variant="outline" className="capitalize">
                          {r.subscription_status}
                        </Badge>
                      ) : (
                        '--'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {r.divergence_reason === 'grant_without_active_subscription'
                          ? 'Grant, no active sub'
                          : 'Plan mismatch'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Dunning ----------

function DunningCard() {
  const { data: rows = [], isLoading, refetch, isFetching } = useBillingDunning();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dunning Queue</CardTitle>
            <CardDescription>
              Past-due / unpaid subscriptions and pending cancellations
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No failed payments or pending cancellations.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Auto-Renew</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead>Customer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.subscription_id}>
                    <TableCell className="font-medium">
                      {r.organization_name || r.organization_id || '--'}
                    </TableCell>
                    <TableCell>{r.plan_display_name || '--'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'past_due' || r.status === 'unpaid'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="capitalize"
                      >
                        {r.status || '--'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.cancel_at_period_end ? 'secondary' : 'outline'}>
                        {r.cancel_at_period_end ? 'Cancelling' : 'Yes'}
                      </Badge>
                    </TableCell>
                    <TableCell>{fmtDate(r.current_period_end)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.provider_customer_email || '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Org lookup ----------

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string }[] = [
  { value: 'extend_trial', label: 'Extend trial' },
  { value: 'change_seats', label: 'Change seats' },
  { value: 'force_sync', label: 'Force sync' },
  { value: 'mark_paid', label: 'Mark paid' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'reactivate', label: 'Reactivate' },
];

function OrgLookupCard() {
  const [orgInput, setOrgInput] = useState('');
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const seatUsage = useOrgSeatUsage(activeOrgId);
  const billing = useOrgBilling(activeOrgId);

  // Credit form
  const [creditAmount, setCreditAmount] = useState('');
  const [creditCurrency, setCreditCurrency] = useState('NGN');
  const [creditReason, setCreditReason] = useState('');
  const addCredit = useAddCredit();

  // Adjustment form
  const [adjType, setAdjType] = useState<AdjustmentType>('extend_trial');
  const [adjDays, setAdjDays] = useState('');
  const [adjSeats, setAdjSeats] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const recordAdjustment = useRecordAdjustment();

  const inputIsValid = UUID_RE.test(orgInput.trim());

  const handleLookup = () => {
    if (inputIsValid) setActiveOrgId(orgInput.trim());
  };

  const handleAddCredit = () => {
    if (!activeOrgId) return;
    const amountMinor = Math.round(Number(creditAmount));
    if (!Number.isInteger(amountMinor) || creditAmount.trim() === '') return;
    addCredit.mutate(
      {
        orgId: activeOrgId,
        amountMinor,
        currency: creditCurrency.trim() || undefined,
        reason: creditReason.trim(),
      },
      {
        onSuccess: () => {
          setCreditAmount('');
          setCreditReason('');
        },
      }
    );
  };

  const handleRecordAdjustment = () => {
    if (!activeOrgId) return;
    const params: Record<string, unknown> = {};
    if (adjType === 'extend_trial') params.days = Number(adjDays);
    if (adjType === 'change_seats') params.seats = Number(adjSeats);
    recordAdjustment.mutate(
      {
        orgId: activeOrgId,
        adjustmentType: adjType,
        params,
        reason: adjReason.trim(),
      },
      {
        onSuccess: () => {
          setAdjDays('');
          setAdjSeats('');
          setAdjReason('');
        },
      }
    );
  };

  const creditReasonValid = creditReason.trim().length >= 3;
  const adjReasonValid = adjReason.trim().length >= 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Billing Lookup</CardTitle>
        <CardDescription>
          Enter an organization ID to inspect seat usage and billing, and to apply credits or
          adjustments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="org-id">Organization ID</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="org-id"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                className="pl-10 font-mono text-sm"
              />
            </div>
          </div>
          <Button onClick={handleLookup} disabled={!inputIsValid}>
            Look up
          </Button>
        </div>

        {!activeOrgId ? (
          <div className="text-center py-8 text-muted-foreground">
            Enter a valid organization ID above to begin.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Seat usage + credit balance */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Seat Usage</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {seatUsage.isLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold">
                      {seatUsage.data?.used ?? 0}
                      <span className="text-base text-muted-foreground font-normal">
                        {' '}
                        / {seatUsage.data?.purchased ?? '∞'}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">used / purchased</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Credit</CardTitle>
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {billing.isLoading ? (
                    <Skeleton className="h-8 w-28" />
                  ) : (
                    <div className="text-2xl font-bold">
                      {formatMinor(
                        billing.data?.net_credit_minor ?? 0,
                        billing.data?.credit_currency
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">sum of billing credits</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Subscription</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {billing.isLoading ? (
                    <Skeleton className="h-8 w-28" />
                  ) : billing.data?.subscription ? (
                    <>
                      <div className="text-lg font-bold">
                        {billing.data.subscription.plan_display_name ||
                          billing.data.subscription.plan_name ||
                          '--'}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {billing.data.subscription.status} · ends{' '}
                        {fmtDate(billing.data.subscription.current_period_end)}
                      </p>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">No active subscription</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Forms */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Add credit */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Add Credit</CardTitle>
                  <CardDescription>
                    Amount is in minor units (e.g. kobo/cents). Negative claws back.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="credit-amount">Amount (minor)</Label>
                      <Input
                        id="credit-amount"
                        type="number"
                        placeholder="50000"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div className="w-24">
                      <Label htmlFor="credit-currency">Currency</Label>
                      <Input
                        id="credit-currency"
                        placeholder="NGN"
                        maxLength={3}
                        value={creditCurrency}
                        onChange={(e) => setCreditCurrency(e.target.value.toUpperCase())}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="credit-reason">Reason (required)</Label>
                    <Textarea
                      id="credit-reason"
                      placeholder="Why is this credit being applied?"
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleAddCredit}
                    disabled={
                      addCredit.isPending || creditAmount.trim() === '' || !creditReasonValid
                    }
                  >
                    {addCredit.isPending ? 'Saving...' : 'Add Credit'}
                  </Button>
                </CardContent>
              </Card>

              {/* Record adjustment */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Record Adjustment</CardTitle>
                  <CardDescription>
                    Extend trial / change seats apply immediately; others are recorded as intent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="adj-type">Type</Label>
                    <select
                      id="adj-type"
                      value={adjType}
                      onChange={(e) => setAdjType(e.target.value as AdjustmentType)}
                      className="mt-1 w-full px-3 py-2 border rounded-md bg-background text-sm"
                    >
                      {ADJUSTMENT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {adjType === 'extend_trial' && (
                    <div>
                      <Label htmlFor="adj-days">Days to extend</Label>
                      <Input
                        id="adj-days"
                        type="number"
                        min={1}
                        placeholder="14"
                        value={adjDays}
                        onChange={(e) => setAdjDays(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
                  {adjType === 'change_seats' && (
                    <div>
                      <Label htmlFor="adj-seats">New seat count</Label>
                      <Input
                        id="adj-seats"
                        type="number"
                        min={0}
                        placeholder="5"
                        value={adjSeats}
                        onChange={(e) => setAdjSeats(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="adj-reason">Reason (required)</Label>
                    <Textarea
                      id="adj-reason"
                      placeholder="Why is this adjustment being made?"
                      value={adjReason}
                      onChange={(e) => setAdjReason(e.target.value)}
                      className="mt-1"
                      rows={2}
                    />
                  </div>
                  <Button
                    onClick={handleRecordAdjustment}
                    disabled={
                      recordAdjustment.isPending ||
                      !adjReasonValid ||
                      (adjType === 'extend_trial' && Number(adjDays) <= 0) ||
                      (adjType === 'change_seats' && adjSeats.trim() === '')
                    }
                  >
                    {recordAdjustment.isPending ? 'Saving...' : 'Record Adjustment'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* History */}
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Adjustments</CardTitle>
                </CardHeader>
                <CardContent>
                  {billing.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (billing.data?.adjustments.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No adjustments yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {billing.data!.adjustments.map((a) => (
                        <div key={a.id} className="p-3 border rounded-md text-sm">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="capitalize">
                              {a.adjustment_type.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(a.created_at)}
                            </span>
                          </div>
                          {a.reason && <p className="mt-1 text-muted-foreground">{a.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Credits</CardTitle>
                </CardHeader>
                <CardContent>
                  {billing.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (billing.data?.credits.length ?? 0) === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No credits yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {billing.data!.credits.map((c) => (
                        <div key={c.id} className="p-3 border rounded-md text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">
                              {formatMinor(c.amount_minor, c.currency)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {fmtDate(c.created_at)}
                            </span>
                          </div>
                          {c.reason && <p className="mt-1 text-muted-foreground">{c.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Tab ----------

export function BillingOpsTab() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold">Billing Operations</h2>
        <p className="text-muted-foreground">
          Reconciliation, dunning, and per-organization billing controls
        </p>
      </div>

      <ReconciliationCard />
      <DunningCard />
      <OrgLookupCard />
    </div>
  );
}
