import { useMemo } from 'react';
import { useAllUsers } from './useAllUsers';
import { useAllOrganizations } from './useAllOrganizations';
import { useAdminActions } from './useAdminActions';

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
  recentAdminActions: Array<{
    id: string;
    action_type: string;
    target_type: string;
    created_at: string;
  }>;
}

/**
 * Hook to fetch platform-wide analytics
 */
export function usePlatformAnalytics() {
  const { data: users = [], isLoading: usersLoading } = useAllUsers();
  const { data: orgs = [], isLoading: orgsLoading } = useAllOrganizations();
  const { data: adminActions = [], isLoading: actionsLoading } = useAdminActions();

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

    // Recent admin actions (last 10)
    const recentAdminActions = adminActions
      .slice(0, 10)
      .map((a) => ({
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
      recentAdminActions,
    } as PlatformAnalytics;
  }, [users, orgs, adminActions]);

  return {
    data: analytics,
    isLoading: usersLoading || orgsLoading || actionsLoading,
  };
}
