import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  FileText,
  Users,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Clock,
  BarChart,
  RefreshCw,
  ArrowRight,
  Scale,
} from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { useDashboard } from "@/hooks/useDashboard";
import { useUserRole } from "@/hooks/useUserManagement";
import { useAllCases } from "@/hooks/useCases";
import { useAllActivities } from "@/features/activities/api/useAllActivities";
import { Case, Contract } from "@/types";
import { formatDate } from "@/lib/utils";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { useNavigate } from "react-router-dom";
import { calculateCaseStatusData } from "@/lib/analyticsUtils";

export default function Dashboard() {
  const [windowDays] = useState(7);
  const navigate = useNavigate();

  // Get data for different dashboard sections
  const { upcomingCases, upcomingContracts } = useInsights(windowDays);
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useDashboard();
  const { data: userRoleData } = useUserRole();
  const { data: casesData, isLoading: casesLoading } = useAllCases();
  const { data: activitiesData, isLoading: activitiesLoading } = useAllActivities();

  const role = userRoleData?.role;
  const isAdmin = role === "superadmin" || role === "admin";

  // Process case status data for pie chart - ONLY use real data
  const casesByStatus = useMemo(() => {
    return calculateCaseStatusData(casesData || []);
  }, [casesData]);

  // Generate monthly activity data based on real activity data
  const recentActivity = useMemo(() => {
    // If we have real activity data, calculate monthly trends by activity type
    if (activitiesData && activitiesData.length > 0) {
      const monthlyData: Record<string, Record<string, number>> = {};
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      // Initialize all months
      months.forEach(month => {
        monthlyData[month] = {};
      });

      // Count activities by month and type
      activitiesData.forEach((activity) => {
        if (activity.created_at) {
          const month = months[new Date(activity.created_at).getMonth()];
          const activityType = activity.activity_type || 'Other';
          monthlyData[month][activityType] = (monthlyData[month][activityType] || 0) + 1;
        }
      });

      // Transform to array format for the chart with top activity types
      const allActivityTypes = new Set<string>();
      Object.values(monthlyData).forEach(monthData => {
        Object.keys(monthData).forEach(type => allActivityTypes.add(type));
      });

      // Get top 3 most common activity types
      const typeCounts: Record<string, number> = {};
      activitiesData.forEach((activity) => {
        const type = activity.activity_type || 'Other';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      const topTypes = Object.entries(typeCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([type]) => type);

      return months.map(month => {
        const result: Record<string, string | number> = { month };
        topTypes.forEach(type => {
          result[type] = monthlyData[month][type] || 0;
        });
        return result;
      });
    }

    // Return empty array if no data
    return [];
  }, [activitiesData]);

  // Handle loading states
  if (dashboardLoading && casesLoading && activitiesLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (dashboardError) {
    return (
      <div className="px-4 py-12 flex flex-col items-center justify-center">
        <div className="p-4 bg-destructive/10 rounded-full mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Failed to load dashboard data</h2>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          There was an error loading your dashboard. Please try again or contact support if the problem persists.
        </p>
        <Button onClick={() => refetchDashboard()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="px-2 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Overview of your legal practice</p>
      </div>

      {/* Stats Cards (Live Data) - No Revenue */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card className="shadow-card border-0 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Matters</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    dashboardData?.activeCases ?? "0"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    dashboardData?.totalClients ?? "0"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Documents</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    dashboardData?.totalDocuments ?? "0"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-0 bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/20 dark:to-violet-900/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <Scale className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Matters</p>
                <p className="text-2xl font-bold">
                  {dashboardLoading ? (
                    <span className="animate-pulse">—</span>
                  ) : (
                    dashboardData?.totalCases ?? "0"
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ModuleErrorBoundary name="Monthly Activity Chart">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Monthly Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={recentActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={30}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                    />
                    {/* Render lines dynamically based on activity data */}
                    {recentActivity.length > 0 && Object.keys(recentActivity[0]).filter(key => key !== 'month').map((activityType, index) => {
                      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                      return (
                        <Line
                          key={activityType}
                          type="monotone"
                          dataKey={activityType}
                          name={activityType}
                          stroke={colors[index % colors.length]}
                          strokeWidth={3}
                          dot={{ fill: colors[index % colors.length], strokeWidth: 2, r: 3 }}
                          activeDot={{ r: 6 }}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No activity data available
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Cases by Status Chart">
          <Card className="shadow-card border-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Matters by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {casesByStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={casesByStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value, percent }) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                      labelLine={true}
                      strokeWidth={2}
                      stroke="hsl(var(--background))"
                    >
                      {casesByStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No matter data available
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>

      {/* Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ModuleErrorBoundary name="Upcoming Hearings">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Upcoming Hearings
                </CardTitle>
                <p className="text-muted-foreground text-sm">Next {windowDays} days</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/calendar')}
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingCases.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matter</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Court</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingCases.map((c: Case) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/matters/${c.id}`)}>
                        <TableCell className="font-medium max-w-[200px] truncate" title={c.title}>{c.title}</TableCell>
                        <TableCell>{formatDate(c.next_hearing_date)}</TableCell>
                        <TableCell className="max-w-[120px] truncate" title={c.court || 'TBD'}>{c.court || 'TBD'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 bg-muted/10 rounded-md">
                  <p className="text-muted-foreground text-sm">No upcoming hearings in the next {windowDays} days.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Contract Renewals">
          <Card className="shadow-card border-0">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Contract Renewals
                </CardTitle>
                <p className="text-muted-foreground text-sm">Expiring soon</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/contracts')}
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingContracts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingContracts.map((contract: Contract) => (
                      <TableRow
                        key={contract.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/contracts/${contract.id}`)}
                      >
                        <TableCell className="font-medium max-w-[200px] truncate" title={contract.title}>{contract.title}</TableCell>
                        <TableCell>{formatDate(contract.end_date)}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            contract.status === 'active' 
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : contract.status === 'draft'
                              ? 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                            {contract.status || 'Unknown'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-6 bg-muted/10 rounded-md">
                  <p className="text-muted-foreground text-sm">No contracts expiring in the next {windowDays} days.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>
    </div>
  );
}
