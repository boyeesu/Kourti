import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlatformAnalytics } from '@/hooks/usePlatformAnalytics';
import { useAllUsers } from '@/hooks/useAllUsers';
import { useAllOrganizations } from '@/hooks/useAllOrganizations';
import { useAdminActions } from '@/hooks/useAdminActions';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
import { format, subDays, eachDayOfInterval } from 'date-fns';

function formatCurrency(amount: number | null | undefined, currency = 'NGN') {
  if (amount == null) return '--';
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : currency;
  return `${symbol}${Math.round(amount).toLocaleString()}`;
}

export function AnalyticsTab() {
  const { data: analytics, isLoading } = usePlatformAnalytics();
  const { data: users = [] } = useAllUsers();
  const { data: orgs = [] } = useAllOrganizations();
  const { data: actions = [] } = useAdminActions();

  // Prepare user growth data
  const userGrowthData = useMemo(() => {
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 30),
      end: new Date(),
    });

    return last30Days.map((date) => {
      const usersOnDate = users.filter((u) => {
        const created = new Date(u.created_at);
        return created <= date;
      }).length;

      return {
        date: format(date, 'MMM dd'),
        users: usersOnDate,
      };
    });
  }, [users]);

  // Prepare org growth data
  const orgGrowthData = useMemo(() => {
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 30),
      end: new Date(),
    });

    return last30Days.map((date) => {
      const orgsOnDate = orgs.filter((o) => {
        const created = new Date(o.created_at);
        return created <= date;
      }).length;

      return {
        date: format(date, 'MMM dd'),
        organizations: orgsOnDate,
      };
    });
  }, [orgs]);

  // Prepare admin actions data
  const actionsData = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 7),
      end: new Date(),
    });

    return last7Days.map((date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const actionsOnDate = actions.filter((a) => {
        const created = new Date(a.created_at);
        return format(created, 'yyyy-MM-dd') === dateStr;
      }).length;

      return {
        date: format(date, 'MMM dd'),
        actions: actionsOnDate,
      };
    });
  }, [actions]);

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff00'];

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Growth (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={userGrowthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#8884d8"
                strokeWidth={2}
                name="Total Users"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization Growth (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={orgGrowthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="organizations"
                stroke="#82ca9d"
                strokeWidth={2}
                name="Total Organizations"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Users by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics && (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={Object.entries(analytics.usersByStatus).map(([status, count]) => ({
                      name: status,
                      value: count,
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {Object.entries(analytics.usersByStatus).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users by Role</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={Object.entries(analytics.usersByRole).map(([role, count]) => ({
                    role,
                    count,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="role" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Admin Actions (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={actionsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="actions" fill="#ffc658" name="Actions" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Subscription & Revenue Analytics */}
      {analytics && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Subscriptions by Status</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const subStatusData = [
                  { name: 'Active', value: analytics.subscriptions.active },
                  { name: 'Cancelled', value: analytics.subscriptions.cancelled },
                  { name: 'Paused', value: analytics.subscriptions.paused },
                  { name: 'Past Due', value: analytics.subscriptions.pastDue },
                  { name: 'Trialing', value: analytics.subscriptions.trialing },
                ].filter((d) => d.value > 0);

                if (subStatusData.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No subscription data yet
                    </div>
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={subStatusData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {subStatusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscribers by Plan</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const planData = Object.entries(analytics.subscriptions.byPlan).map(
                  ([plan, count]) => ({ plan, count })
                );

                if (planData.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                      No subscription data yet
                    </div>
                  );
                }

                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={planData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="plan" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#82ca9d" name="Subscribers" />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Revenue Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="space-y-1 rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground">Monthly Plans Revenue</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      analytics.subscriptions.monthlyRevenue,
                      analytics.subscriptions.currency
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analytics.subscriptions.active} active subscriptions
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border p-4 text-center">
                  <p className="text-sm text-muted-foreground">Yearly Plans Revenue</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      analytics.subscriptions.yearlyRevenue,
                      analytics.subscriptions.currency
                    )}
                  </p>
                </div>
                <div className="space-y-1 rounded-lg border p-4 text-center bg-primary/5">
                  <p className="text-sm text-muted-foreground">Estimated MRR</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatCurrency(
                      analytics.subscriptions.estimatedMRR,
                      analytics.subscriptions.currency
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">monthly + yearly/12</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
