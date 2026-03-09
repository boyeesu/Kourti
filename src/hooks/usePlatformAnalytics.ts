import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllUsers } from './useAllUsers';
import { useAllOrganizations } from './useAllOrganizations';
import { useAdminActions } from './useAdminActions';
import { logError } from '@/lib/logger';

export interface SubscriptionSummary {
  total: number;
  active: number;
  cancelled: number;
  paused: number;
  pastDue: number;
  trialing: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  estimatedMRR: number;
  currency: string;
  byPlan: Record<string, number>;
}

export interface PlatformAnalytics {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  pendingUsers: number;
  approvedUsers: number;
  totalOrganizations: number;
  activeOrganizations: number;
  newUsersThisMonth: number;
  newOrgsThisMonth: number;
  adminActionsToday: number;
  adminActionsThisWeek: number;
  usersByRole: Record<string, number>;
  usersByStatus: Record<string, number>;
  subscriptions: SubscriptionSummary;
  recentAdminActions: Array<{
    id: string;
    action_type: string;
    target_type: string;
    created_at: string;
  }>;
}

interface RawSubscription {
  id: string;
  status: string;
  billing_interval: string;
  plan_name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  currency: string;
}

function useAdminSubscriptions() {
  return useQuery({
    queryKey: ['admin-subscriptions-summary'],
    queryFn: async () => {
      try {
        const client = supabase as unknown as {
          from: (table: string) => {
            select: (cols: string) => PromiseLike<{
              data: unknown;
              error: { message: string } | null;
            }>;
          };
        };

        const { data, error } = await client.from('subscriptions').select(
          `id, status, billing_interval,
             user_plans!inner(name, price_monthly, price_yearly, currency)`
        );

        if (error) throw error;

        return ((data as Record<string, unknown>[]) || []).map((row) => {
          const plan = row.user_plans as {
            name: string;
            price_monthly: number | null;
            price_yearly: number | null;
            currency: string;
          } | null;

          return {
            id: row.id as string,
            status: row.status as string,
            billing_interval: row.billing_interval as string,
            plan_name: plan?.name || 'unknown',
            price_monthly: plan?.price_monthly ?? null,
            price_yearly: plan?.price_yearly ?? null,
            currency: plan?.currency || 'NGN',
          } as RawSubscription;
        });
      } catch (error) {
        logError('Error fetching subscriptions for analytics', error);
        return [];
      }
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Hook to fetch platform-wide analytics
 */
export function usePlatformAnalytics() {
  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const { data: orgs = [], isLoading: orgsLoading } = useAllOrganizations();
  const { data: adminActions = [], isLoading: actionsLoading } = useAdminActions();
  const { data: subs = [], isLoading: subsLoading } = useAdminSubscriptions();

  const analytics = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // User stats
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === 'active').length;
    const disabledUsers = users.filter((u) => u.status === 'disabled').length;
    const pendingUsers = users.filter((u) => u.status === 'pending').length;
    const approvedUsers = users.filter((u) => u.status === 'approved').length;

    // New users this month
    const newUsersThisMonth = users.filter((u) => {
      const createdAt = new Date(u.created_at);
      return createdAt >= startOfMonth;
    }).length;

    // Organization stats
    const totalOrganizations = orgs.length;
    const activeOrganizations = orgs.filter((o) => o.status === 'active').length;

    // New orgs this month
    const newOrgsThisMonth = orgs.filter((o) => {
      const createdAt = new Date(o.created_at);
      return createdAt >= startOfMonth;
    }).length;

    // Admin actions
    const adminActionsToday = adminActions.filter((a) => {
      const createdAt = new Date(a.created_at);
      return createdAt >= startOfToday;
    }).length;

    const adminActionsThisWeek = adminActions.filter((a) => {
      const createdAt = new Date(a.created_at);
      return createdAt >= startOfWeek;
    }).length;

    // Users by role
    const usersByRole: Record<string, number> = {};
    users.forEach((u) => {
      const role = u.role || 'unknown';
      usersByRole[role] = (usersByRole[role] || 0) + 1;
    });

    // Users by status
    const usersByStatus: Record<string, number> = {};
    users.forEach((u) => {
      const status = u.status || 'unknown';
      usersByStatus[status] = (usersByStatus[status] || 0) + 1;
    });

    // Subscription stats
    const activeSubs = subs.filter((s) => s.status === 'active');
    const monthlyRevenue = activeSubs
      .filter((s) => s.billing_interval === 'monthly')
      .reduce((sum, s) => sum + (s.price_monthly || 0), 0);
    const yearlyRevenue = activeSubs
      .filter((s) => s.billing_interval === 'yearly')
      .reduce((sum, s) => sum + (s.price_yearly || 0), 0);

    const byPlan: Record<string, number> = {};
    activeSubs.forEach((s) => {
      byPlan[s.plan_name] = (byPlan[s.plan_name] || 0) + 1;
    });

    const subscriptionsSummary: SubscriptionSummary = {
      total: subs.length,
      active: activeSubs.length,
      cancelled: subs.filter((s) => s.status === 'cancelled').length,
      paused: subs.filter((s) => s.status === 'paused').length,
      pastDue: subs.filter((s) => s.status === 'past_due').length,
      trialing: subs.filter((s) => s.status === 'trialing').length,
      monthlyRevenue,
      yearlyRevenue,
      estimatedMRR: monthlyRevenue + yearlyRevenue / 12,
      currency: 'NGN',
      byPlan,
    };

    // Recent admin actions (last 10)
    const recentAdminActions = adminActions.slice(0, 10).map((a) => ({
      id: a.id,
      action_type: a.action_type,
      target_type: a.target_type,
      created_at: a.created_at,
    }));

    return {
      totalUsers,
      activeUsers,
      disabledUsers,
      pendingUsers,
      approvedUsers,
      totalOrganizations,
      activeOrganizations,
      newUsersThisMonth,
      newOrgsThisMonth,
      adminActionsToday,
      adminActionsThisWeek,
      usersByRole,
      usersByStatus,
      subscriptions: subscriptionsSummary,
      recentAdminActions,
    } as PlatformAnalytics;
  }, [users, orgs, adminActions, subs]);

  return {
    data: analytics,
    isLoading: usersLoading || orgsLoading || actionsLoading || subsLoading,
  };
}
