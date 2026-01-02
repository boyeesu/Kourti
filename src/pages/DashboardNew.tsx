import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardSkeleton, PageSkeleton } from "@/components/ui/loading-states";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Tooltip as RechartsTooltip,
  Legend,
  BarChart as RechartBarChart,
  Bar
} from "recharts";
import {
  FileText,
  Users,
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  RefreshCw,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Eye,
  FileCheck,
  Activity,
  Plus
} from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { useDashboard } from "@/hooks/useDashboard";
import { useUserRole } from "@/hooks/useUserManagement";
import { useProfile } from "@/hooks/useProfile";
import { useCases } from "@/hooks/useCases";
import { useContracts } from "@/hooks/useContracts";
import { Case, Contract } from "@/types";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { calculateCaseStatusData } from "@/lib/analyticsUtils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, subMonths } from "date-fns";

// Components
const StatCard = ({
  title,
  value,
  icon,
  description,
  trend,
  loading,
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10"
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  trend?: { value: number; label: string };
  loading?: boolean;
  iconColor?: string;
  iconBgColor?: string;
}) => {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-1">{title}</div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <h3 className="text-2xl font-bold">{value}</h3>
            )}
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
            {trend && (
              <div className="flex items-center mt-2">
                <Badge variant={trend.value > 0 ? "secondary" : "destructive"} className="px-1.5 h-5">
                  {trend.value > 0 ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowRight className="h-3 w-3 mr-1" />}
                  {Math.abs(trend.value)}%
                </Badge>
                <span className="text-xs text-muted-foreground ml-2">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={cn("p-3 rounded-full", iconBgColor)}>
            <div className={cn("h-5 w-5", iconColor)}>
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Types for chart tooltip
interface TooltipPayload {
  name: string;
  value: number | string;
  color?: string;
  fill?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

// Custom tooltip for charts
const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border p-3 rounded-lg shadow-lg">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((entry, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-sm">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            <span className="font-medium">{entry.name}:</span>
            <span>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

// Main Dashboard Component
export default function Dashboard() {
  const [windowDays] = useState(7);
  const [chartView, setChartView] = useState("monthly");
  const navigate = useNavigate();

  // Get data for different dashboard sections
  const { upcomingCases, upcomingContracts } = useInsights(windowDays);
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useDashboard();
  const { data: userRoleData } = useUserRole();
  const { data: casesData, isLoading: casesLoading } = useCases();
  const { data: contractsData, isLoading: contractsLoading } = useContracts();
  const { data: profileData } = useProfile();

  const role = userRoleData?.role;
  const isAdmin = role === "superadmin" || role === "admin";
  const welcomeName = profileData?.first_name?.trim();

  // Process case status data for pie chart
  const casesByStatus = useMemo(() => {
    return calculateCaseStatusData(casesData?.cases || []);
  }, [casesData]);

  // Generate monthly activity data based on real data if available
  const recentActivity = useMemo(() => {
    // If we have real case and contract data, calculate monthly trends
    if (casesData?.cases && contractsData) {
      const monthlyData: Record<string, { cases: number; contracts: number }> = {};
      const currentMonth = startOfMonth(new Date());
      const monthLabels = Array.from({ length: 12 }, (_, index) => {
        const monthDate = subMonths(currentMonth, 11 - index);
        return format(monthDate, "MMM yyyy");
      });

      // Initialize all months to zero
      monthLabels.forEach(monthLabel => {
        monthlyData[monthLabel] = { cases: 0, contracts: 0 };
      });

      // Count cases by month
      casesData.cases.forEach((c: Case) => {
        if (c.created_at) {
          const monthKey = format(startOfMonth(new Date(c.created_at)), "MMM yyyy");
          if (monthlyData[monthKey]) {
            monthlyData[monthKey].cases += 1;
          }
        }
      });

      // Count contracts by month - handle both array and object formats
      const contractsList = Array.isArray(contractsData) ? contractsData : contractsData?.contracts || [];
      contractsList.forEach((contract: Contract) => {
        if (contract.created_at) {
          const monthKey = format(startOfMonth(new Date(contract.created_at)), "MMM yyyy");
          if (monthlyData[monthKey]) {
            monthlyData[monthKey].contracts += 1;
          }
        }
      });

      // Transform to array format for the chart
      return monthLabels.map(monthLabel => ({
        month: monthLabel,
        cases: monthlyData[monthLabel].cases,
        contracts: monthlyData[monthLabel].contracts
      }));
    }

    // Return empty array if no data
    return [];
  }, [casesData, contractsData]);

  // Weekly activity data
  const weeklyActivity = useMemo(() => {
    if (!casesData?.cases && !contractsData) {
      return [];
    }

    const weeksToShow = 8;
    const now = new Date();
    const normalizeDate = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const getWeekStart = (date: Date) => {
      const normalized = normalizeDate(date);
      const dayOfWeek = normalized.getDay();
      const diff = (dayOfWeek + 6) % 7;
      normalized.setDate(normalized.getDate() - diff);
      return normalized;
    };

    const currentWeekStart = getWeekStart(now);
    const weekStarts = Array.from({ length: weeksToShow }, (_, index) => {
      const start = new Date(currentWeekStart);
      start.setDate(start.getDate() - (weeksToShow - 1 - index) * 7);
      return start;
    });

    const weeklyBuckets = new Map<string, { day: string; cases: number; contracts: number }>();
    weekStarts.forEach((start) => {
      const key = start.toISOString().slice(0, 10);
      weeklyBuckets.set(key, {
        day: formatDate(start, { month: "short", day: "numeric" }),
        cases: 0,
        contracts: 0
      });
    });

    const earliestWeekStart = weekStarts[0];
    const incrementBucket = (dateValue: string | null | undefined, type: "cases" | "contracts") => {
      if (!dateValue) return;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return;
      const weekStart = getWeekStart(date);
      if (weekStart < earliestWeekStart) return;
      const key = weekStart.toISOString().slice(0, 10);
      const bucket = weeklyBuckets.get(key);
      if (bucket) {
        bucket[type] += 1;
      }
    };

    casesData?.cases?.forEach((caseItem: Case) => {
      incrementBucket(caseItem.created_at, "cases");
    });

    const contractsList = Array.isArray(contractsData) ? contractsData : contractsData?.contracts || [];
    contractsList.forEach((contract: Contract) => {
      incrementBucket(contract.created_at, "contracts");
    });

    return weekStarts.map((start) => {
      const key = start.toISOString().slice(0, 10);
      const bucket = weeklyBuckets.get(key);
      return {
        day: bucket?.day ?? formatDate(start, { month: "short", day: "numeric" }),
        cases: bucket?.cases ?? 0,
        contracts: bucket?.contracts ?? 0
      };
    });
  }, [casesData, contractsData]);

  // Generate recent cases
  const recentCases = useMemo(() => {
    if (casesData?.cases) {
      return casesData.cases
        .slice().sort((a: Case, b: Case) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
        .slice(0, 5);
    }
    return [];
  }, [casesData]);



  // Get status badge styles
  function getStatusBadge(status: string) {
    switch (status?.toLowerCase()) {
      case 'active':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Active</Badge>;
      case 'pending':
      case 'in_progress':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">Pending</Badge>;
      case 'closed':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">Closed</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">Expired</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  }

  // Handle loading states
  if (dashboardLoading && casesLoading && contractsLoading) {
    return <PageSkeleton />;
  }

  // Handle error state
  if (dashboardError) {
    return (
      <div className="px-4 py-12">
        <ErrorState
          title="Failed to load dashboard data"
          message="There was an error loading your dashboard. Please try again or contact support if the problem persists."
          error={dashboardError}
          onRetry={() => refetchDashboard()}
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-8">
      {/* Header with welcome message */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back{welcomeName ? `, ${welcomeName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-1">
            Here's what's happening with your legal practice today
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="shadow-sm" onClick={() => navigate("/matters/create")}>
            <Briefcase className="h-4 w-4 mr-2" />
            New Matter
          </Button>
          <Button className="shadow-sm" onClick={() => navigate("/calendar")}>
            <Calendar className="h-4 w-4 mr-2" />
            Calendar
          </Button>
        </div>
      </div>

      {/* Stats Cards (Live Data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Matters"
          value={dashboardLoading ? "—" : dashboardData?.activeCases ?? "0"}
          icon={<Briefcase className="h-5 w-5" />}
          description="Currently in progress"
          trend={{ value: 12, label: "from last month" }}
          loading={dashboardLoading}
          iconColor="text-blue-500"
          iconBgColor="bg-blue-500/10"
        />

        <StatCard
          title="Total Clients"
          value={dashboardLoading ? "—" : dashboardData?.totalClients ?? "0"}
          icon={<Users className="h-5 w-5" />}
          trend={{ value: 8, label: "new this month" }}
          loading={dashboardLoading}
          iconColor="text-green-500"
          iconBgColor="bg-green-500/10"
        />

        <StatCard
          title="Documents"
          value={dashboardLoading ? "—" : dashboardData?.totalDocuments ?? "0"}
          icon={<FileText className="h-5 w-5" />}
          description="Across all matters"
          loading={dashboardLoading}
          iconColor="text-amber-500"
          iconBgColor="bg-amber-500/10"
        />

        {isAdmin && (
          <div className="relative">
            <StatCard
              title="Revenue"
              value="Coming Soon"
              icon={<DollarSign className="h-5 w-5" />}
              trend={{ value: 0, label: "increase" }}
              loading={dashboardLoading}
              iconColor="text-purple-500"
              iconBgColor="bg-purple-500/10"
            />
            <div className="absolute inset-0 bg-card/50 backdrop-blur-sm rounded-lg pointer-events-none flex items-center justify-center">
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                Coming Soon
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModuleErrorBoundary name="Activity Chart">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Activity Overview
                </CardTitle>
              </div>
              <CardDescription>
                Track new matters and contracts over time
              </CardDescription>
            </CardHeader>
            <CardContent className="px-1">
              <Tabs value={chartView} onValueChange={setChartView} className="w-full">
                <div className="flex justify-center mb-4">
                  <TabsList className="grid w-[200px] grid-cols-2">
                    <TabsTrigger value="monthly">Monthly</TabsTrigger>
                    <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="monthly" className="mt-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={recentActivity} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                      />
                      <Line
                        type="monotone"
                        dataKey="cases"
                        name="Matters"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="contracts"
                        name="Contracts"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
                <TabsContent value="weekly" className="mt-0">
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartBarChart data={weeklyActivity} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={30}
                      />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        iconType="circle"
                      />
                      <Bar dataKey="cases" name="Matters" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="contracts" name="Contracts" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </RechartBarChart>
                  </ResponsiveContainer>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Matters by Status Chart">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Matters by Status
              </CardTitle>
              <CardDescription>
                Distribution of matters by their current status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={casesByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent! * 100).toFixed(0)}%)`}
                    labelLine={true}
                  >
                    {casesByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>

      {/* Recent Activity and Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModuleErrorBoundary name="Recent Matters">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  Recent Matters
                </CardTitle>
                <CardDescription>
                  Latest matter activities
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/matters')}
              >
                View All
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentCases.length > 0 ? (
                <div className="space-y-4">
                  {recentCases.map((c: Case) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/matters/${c.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full bg-blue-500/10`}>
                          <Briefcase className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{c.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-muted-foreground">
                              {formatDate(c.created_at)}
                            </p>
                            <span className="text-muted-foreground">•</span>
                            {getStatusBadge(c.status || '')}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>View Matter</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {c.assigned_to && (c as Case & { assigned_user?: { id: string; first_name: string | null; last_name: string | null } }).assigned_user && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Avatar className="h-8 w-8 ml-2">
                                  <AvatarFallback>
                                    {(c as Case & { assigned_user?: { id: string; first_name: string | null; last_name: string | null } }).assigned_user?.first_name?.charAt(0) || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                              </TooltipTrigger>
                              <TooltipContent>
                                Assigned to {(c as Case & { assigned_user?: { id: string; first_name: string | null; last_name: string | null } }).assigned_user?.first_name} {(c as Case & { assigned_user?: { id: string; first_name: string | null; last_name: string | null } }).assigned_user?.last_name}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-muted/10 rounded-md">
                  <Briefcase className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No recent matters found.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/matters/create')}>
                    <Plus className="h-4 w-4 mr-1" /> Create a Matter
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Upcoming Events">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Upcoming Events
                </CardTitle>
                <CardDescription>Next {windowDays} days</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => navigate('/calendar')}
              >
                View Calendar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingCases.length > 0 || upcomingContracts.length > 0 ? (
                <div className="space-y-4">
                  {upcomingCases.map((c: Case) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/matters/${c.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-amber-500/10">
                          <Calendar className="h-5 w-5 text-amber-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Hearing: {c.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(c.next_hearing_date)}
                            {c.court && <span> • {c.court}</span>}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8">
                        View
                      </Button>
                    </div>
                  ))}

                  {upcomingContracts.map((contract: Contract) => (
                    <div
                      key={contract.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/contracts/${contract.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-red-500/10">
                          <FileCheck className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">Contract Expiring: {contract.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(contract.end_date)}
                            {contract.value && <span> • {formatCurrency(contract.value)}</span>}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="h-8">
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-muted/10 rounded-md">
                  <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No upcoming events in the next {windowDays} days.</p>
                  <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/calendar')}>
                    View Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </ModuleErrorBoundary>
      </div>
    </div>
  );
}
