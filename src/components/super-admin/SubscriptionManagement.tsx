import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logError } from '@/lib/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CreditCard,
  DollarSign,
  Search,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Users,
} from 'lucide-react';
import { format } from 'date-fns';

// ---------- Types ----------

interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'cancelled' | 'paused' | 'past_due' | 'trialing';
  interval: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  current_period_end: string | null;
  created_at: string;
  user_email?: string;
  organization_name?: string;
  plan_name?: string;
}

interface PlanPricing {
  id: string;
  name: string;
  display_name: string;
  plan_type: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
  flutterwave_plan_id_monthly: string | null;
  flutterwave_plan_id_yearly: string | null;
  is_active: boolean;
}

type EditedPrices = Record<
  string,
  {
    price_monthly?: number | null;
    price_yearly?: number | null;
    currency?: string;
  }
>;

// ---------- Hooks ----------

function useSubscriptions() {
  return useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('subscriptions' as never)
          .select('*, user_plans!inner(name, display_name)')
          .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as unknown as Subscription[];
      } catch (error) {
        logError('Error fetching subscriptions', error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
  });
}

function usePlanPricing() {
  return useQuery({
    queryKey: ['admin-plan-pricing'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('user_plans')
          .select('*')
          .order('plan_type', { ascending: true });

        if (error) throw error;

        return (data || []).map((plan) => ({
          id: plan.id,
          name: plan.name,
          display_name: plan.display_name,
          plan_type: plan.plan_type,
          price_monthly: ((plan as Record<string, unknown>).price_monthly as number | null) ?? null,
          price_yearly: ((plan as Record<string, unknown>).price_yearly as number | null) ?? null,
          currency: ((plan as Record<string, unknown>).currency as string) || 'NGN',
          flutterwave_plan_id_monthly:
            ((plan as Record<string, unknown>).flutterwave_plan_id_monthly as string | null) ??
            null,
          flutterwave_plan_id_yearly:
            ((plan as Record<string, unknown>).flutterwave_plan_id_yearly as string | null) ?? null,
          is_active: plan.is_active,
        })) as PlanPricing[];
      } catch (error) {
        logError('Error fetching plan pricing', error);
        throw error;
      }
    },
    staleTime: 60 * 1000,
  });
}

function useSavePrices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (
      updates: {
        id: string;
        price_monthly?: number | null;
        price_yearly?: number | null;
        currency?: string;
      }[]
    ) => {
      for (const update of updates) {
        const updateData: Record<string, unknown> = {};
        if (update.price_monthly !== undefined) updateData.price_monthly = update.price_monthly;
        if (update.price_yearly !== undefined) updateData.price_yearly = update.price_yearly;
        if (update.currency !== undefined) updateData.currency = update.currency;

        const { error } = await supabase
          .from('user_plans')
          .update(updateData as never)
          .eq('id', update.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plan-pricing'] });
      queryClient.invalidateQueries({ queryKey: ['user-plans'] });
      toast({ title: 'Success', description: 'Plan prices updated successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save prices',
        variant: 'destructive',
      });
    },
  });
}

function useSyncFlutterwave() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('flutterwave-sync-plans');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-plan-pricing'] });
      toast({ title: 'Success', description: 'Plans synced with Flutterwave successfully' });
    },
    onError: (error) => {
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Failed to sync with Flutterwave',
        variant: 'destructive',
      });
    },
  });
}

// ---------- Helpers ----------

function getSubscriptionStatusBadge(status: string) {
  const config: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
  > = {
    active: { variant: 'default', label: 'Active' },
    cancelled: { variant: 'secondary', label: 'Cancelled' },
    paused: { variant: 'outline', label: 'Paused' },
    past_due: { variant: 'destructive', label: 'Past Due' },
    trialing: { variant: 'outline', label: 'Trialing' },
  };

  const c = config[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function formatCurrency(amount: number | null | undefined, currency = 'NGN') {
  if (amount == null) return '--';
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : currency;
  return `${symbol}${amount.toLocaleString()}`;
}

// ---------- Component ----------

export function SubscriptionManagement() {
  const { data: subscriptions = [], isLoading: subsLoading } = useSubscriptions();
  const { data: plans = [], isLoading: plansLoading } = usePlanPricing();
  const savePrices = useSavePrices();
  const syncFlutterwave = useSyncFlutterwave();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editedPrices, setEditedPrices] = useState<EditedPrices>({});

  // ---- Revenue calculations ----
  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const totalActive = activeSubscriptions.length;

  const monthlyRevenue = activeSubscriptions
    .filter((s) => s.interval === 'monthly')
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  const yearlyRevenue = activeSubscriptions
    .filter((s) => s.interval === 'yearly')
    .reduce((sum, s) => sum + (s.amount || 0), 0);

  // ---- Subscription filtering ----
  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch =
      !searchQuery ||
      sub.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.organization_name?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // ---- Price editing ----
  const handlePriceChange = (
    planId: string,
    field: 'price_monthly' | 'price_yearly' | 'currency',
    value: string
  ) => {
    setEditedPrices((prev) => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        [field]: field === 'currency' ? value : value === '' ? null : Number(value),
      },
    }));
  };

  const getEditedValue = (
    plan: PlanPricing,
    field: 'price_monthly' | 'price_yearly' | 'currency'
  ) => {
    const edited = editedPrices[plan.id];
    if (edited && field in edited) {
      return edited[field as keyof typeof edited];
    }
    return plan[field];
  };

  const hasEdits = Object.keys(editedPrices).length > 0;

  const handleSavePrices = () => {
    const updates = Object.entries(editedPrices).map(([id, changes]) => ({
      id,
      ...changes,
    }));
    savePrices.mutate(updates, {
      onSuccess: () => setEditedPrices({}),
    });
  };

  return (
    <div className="space-y-8">
      {/* ---- Page Header ---- */}
      <div>
        <h2 className="text-2xl font-bold">Subscription Management</h2>
        <p className="text-muted-foreground">
          Monitor subscriptions, revenue, and manage plan pricing
        </p>
      </div>

      {/* ---- Revenue Overview ---- */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalActive}</div>
                <p className="text-xs text-muted-foreground">
                  {subscriptions.length} total (all statuses)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Recurring Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subsLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(monthlyRevenue)}</div>
                <p className="text-xs text-muted-foreground">From monthly plans</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Yearly Recurring Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subsLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold">{formatCurrency(yearlyRevenue)}</div>
                <p className="text-xs text-muted-foreground">From yearly plans</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Subscriptions Table ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>All subscription records across the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by email or organization..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border rounded-md bg-background text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="cancelled">Cancelled</option>
              <option value="paused">Paused</option>
              <option value="past_due">Past Due</option>
            </select>
          </div>

          {subsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery || statusFilter !== 'all'
                  ? 'No subscriptions match the current filters'
                  : 'No subscriptions found'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>User Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Interval</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubscriptions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.organization_name || '--'}</TableCell>
                      <TableCell>{sub.user_email || sub.user_id}</TableCell>
                      <TableCell>{sub.plan_name || sub.plan_id}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {sub.interval}
                        </Badge>
                      </TableCell>
                      <TableCell>{getSubscriptionStatusBadge(sub.status)}</TableCell>
                      <TableCell>
                        {sub.current_period_end
                          ? format(new Date(sub.current_period_end), 'MMM dd, yyyy')
                          : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Plan Pricing Management ---- */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Plan Pricing Management</CardTitle>
              <CardDescription>Update plan prices and sync with Flutterwave</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncFlutterwave.mutate()}
                disabled={syncFlutterwave.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${syncFlutterwave.isPending ? 'animate-spin' : ''}`}
                />
                Sync to Flutterwave
              </Button>
              <Button
                size="sm"
                onClick={handleSavePrices}
                disabled={!hasEdits || savePrices.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {savePrices.isPending ? 'Saving...' : 'Save Prices'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {plansLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No plans found</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Monthly Price</TableHead>
                    <TableHead>Yearly Price</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>Flutterwave IDs</TableHead>
                    <TableHead>Sync Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => {
                    const hasFwMonthly = !!plan.flutterwave_plan_id_monthly;
                    const hasFwYearly = !!plan.flutterwave_plan_id_yearly;
                    const isSynced = hasFwMonthly || hasFwYearly;
                    const monthlyVal = getEditedValue(plan, 'price_monthly');
                    const yearlyVal = getEditedValue(plan, 'price_yearly');
                    const currencyVal = getEditedValue(plan, 'currency');

                    return (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>{plan.display_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {plan.plan_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="w-28"
                            placeholder="0"
                            value={monthlyVal ?? ''}
                            onChange={(e) =>
                              handlePriceChange(plan.id, 'price_monthly', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="w-28"
                            placeholder="0"
                            value={yearlyVal ?? ''}
                            onChange={(e) =>
                              handlePriceChange(plan.id, 'price_yearly', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="w-20"
                            placeholder="NGN"
                            value={currencyVal ?? ''}
                            onChange={(e) => handlePriceChange(plan.id, 'currency', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                          <div className="space-y-1">
                            <div
                              className="truncate"
                              title={plan.flutterwave_plan_id_monthly || ''}
                            >
                              M: {plan.flutterwave_plan_id_monthly || '--'}
                            </div>
                            <div className="truncate" title={plan.flutterwave_plan_id_yearly || ''}>
                              Y: {plan.flutterwave_plan_id_yearly || '--'}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isSynced ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Synced
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Not Synced
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
