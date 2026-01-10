import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAllCases } from "@/hooks/useCases";
import { useAllContracts } from "@/hooks/useContracts";
import { useClients } from "@/hooks/useClients";
import { useFetchData } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import {
  Users,
  FileText,
  Scale,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Briefcase,
  FolderOpen,
  Activity,
} from "lucide-react";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  calculateCaseStatusData,
  calculateClientActivity,
  calculateMonthOverMonthMetrics,
  calculateContractStatusData,
  calculatePriorityDistribution,
  calculateDocumentTrends,
  calculateTaskMetrics,
} from "@/lib/analyticsUtils";

// Chart colors matching design system
const CHART_COLORS = {
  primary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  purple: "#8b5cf6",
  pink: "#ec4899",
  slate: "#64748b",
};

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState("6months");

  // Fetch real data from database
  const { data: cases = [], isLoading: casesLoading, refetch: refetchCases } = useAllCases();
  const { data: contracts = [], isLoading: contractsLoading, refetch: refetchContracts } = useAllContracts();
  const { data: clientsData, isLoading: clientsLoading, refetch: refetchClients } = useClients(1, 1000);
  const clients = clientsData?.items || [];

  const { data: documentsData, isLoading: documentsLoading, refetch: refetchDocuments } = useFetchData<Array<{ id: string; created_at?: string | null; name?: string; mime_type?: string }>>({
    table: "documents",
    queryKey: ["analytics-documents"],
    select: "id, created_at, name, mime_type",
  });
  const documents = (Array.isArray(documentsData?.data) ? documentsData.data : []) as Array<{ created_at?: string | null }>;

  const { data: tasksData, isLoading: tasksLoading, refetch: refetchTasks } = useFetchData({
    table: "tasks",
    queryKey: ["analytics-tasks"],
    select: "id, completed, priority, due_date, created_at",
  });
  const tasks = (tasksData?.data || []) as Array<{
    id: string;
    completed?: boolean;
    priority?: string;
    due_date?: string;
    created_at?: string;
  }>;

  const { data: eventsData, isLoading: eventsLoading, refetch: refetchEvents } = useFetchData({
    table: "calendar_events",
    queryKey: ["analytics-events"],
    select: "id, created_at, event_type, start_date",
  });
  const events = eventsData?.data || [];

  // Calculate period in months
  const monthsBack = useMemo(() => {
    switch (selectedPeriod) {
      case "1month": return 1;
      case "3months": return 3;
      case "1year": return 12;
      default: return 6;
    }
  }, [selectedPeriod]);

  // Calculate real metrics from data
  const caseStatusData = useMemo(() => calculateCaseStatusData(cases), [cases]);
  const contractStatusData = useMemo(() => calculateContractStatusData(contracts), [contracts]);
  const priorityData = useMemo(() => calculatePriorityDistribution(cases), [cases]);
  const clientActivityData = useMemo(() => calculateClientActivity(clients, monthsBack), [clients, monthsBack]);
  const documentTrends = useMemo(() => calculateDocumentTrends(documents, monthsBack), [documents, monthsBack]);
  const taskMetrics = useMemo(() => calculateTaskMetrics(tasks), [tasks]);

  // Month-over-month changes
  const casesChange = useMemo(() => calculateMonthOverMonthMetrics(cases as Array<{ created_at?: string | null }>), [cases]);
  const clientsChange = useMemo(() => calculateMonthOverMonthMetrics(clients as Array<{ created_at?: string | null }>), [clients]);
  const contractsChange = useMemo(() => calculateMonthOverMonthMetrics(contracts as Array<{ created_at?: string | null }>), [contracts]);
  const documentsChange = useMemo(() => calculateMonthOverMonthMetrics((Array.isArray(documents) ? documents : []) as Array<{ created_at?: string | null }>), [documents]);

  // Totals
  const totalCases = cases.length;
  const activeCases = cases.filter((c) => ["open", "active", "in_progress"].includes(c.status?.toLowerCase() || "")).length;
  const totalClients = clients.length;
  const activeClients = clients.filter((c) => c.status === "active").length;
  const totalContracts = contracts.length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const totalDocuments = Array.isArray(documents) ? documents.length : 0;
  const totalEvents = Array.isArray(events) ? events.length : 0;

  const isLoading = casesLoading || clientsLoading || contractsLoading || documentsLoading || tasksLoading || eventsLoading;

  // Refresh all data
  const handleRefresh = () => {
    refetchCases();
    refetchClients();
    refetchContracts();
    refetchDocuments();
    refetchTasks();
    refetchEvents();
  };

  // Render change indicator
  const renderChangeIndicator = (change: ReturnType<typeof calculateMonthOverMonthMetrics>) => {
    const Icon = change.direction === "up" ? TrendingUp : change.direction === "down" ? TrendingDown : Minus;
    const colorClass = change.direction === "up" ? "text-success" : change.direction === "down" ? "text-destructive" : "text-muted-foreground";

    return (
      <div className={`flex items-center gap-1 text-xs ${colorClass}`}>
        <Icon className="h-3 w-3" />
        <span>{change.formatted}</span>
      </div>
    );
  };

  return (
    <div className="px-2 py-4 sm:px-4 sm:py-6 space-y-4 sm:space-y-6 animate-fade-in">
      <Breadcrumbs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Comprehensive insights into your legal practice performance
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">Last Month</SelectItem>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="1year">Last Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards - Clean, Modern Design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Cases Card */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Matters</p>
                <p className="text-3xl font-bold text-foreground">
                  {isLoading ? <span className="animate-pulse">—</span> : totalCases}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {activeCases} active
                  </Badge>
                  {renderChangeIndicator(casesChange)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10">
                <Briefcase className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clients Card */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Total Clients</p>
                <p className="text-3xl font-bold text-foreground">
                  {isLoading ? <span className="animate-pulse">—</span> : totalClients}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {activeClients} active
                  </Badge>
                  {renderChangeIndicator(clientsChange)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10">
                <Users className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contracts Card */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-violet-50 to-violet-100/50 dark:from-violet-950/20 dark:to-violet-900/10">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Contracts</p>
                <p className="text-3xl font-bold text-foreground">
                  {isLoading ? <span className="animate-pulse">—</span> : totalContracts}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {activeContracts} active
                  </Badge>
                  {renderChangeIndicator(contractsChange)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-violet-500/10">
                <Scale className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documents Card */}
        <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Documents</p>
                <p className="text-3xl font-bold text-foreground">
                  {isLoading ? <span className="animate-pulse">—</span> : totalDocuments}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {totalEvents} events
                  </Badge>
                  {renderChangeIndicator(documentsChange)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/10">
                <FileText className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Progress Section */}
      <Card className="border-0 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Task Progress
              </CardTitle>
              <CardDescription>Overview of task completion status</CardDescription>
            </div>
            <Badge variant={taskMetrics.completionRate >= 70 ? "default" : taskMetrics.completionRate >= 40 ? "secondary" : "destructive"}>
              {taskMetrics.completionRate}% Complete
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={taskMetrics.completionRate} className="h-3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="p-2 rounded-full bg-blue-500/10">
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskMetrics.total}</p>
                  <p className="text-xs text-muted-foreground">Total Tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="p-2 rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskMetrics.completed}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="p-2 rounded-full bg-amber-500/10">
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskMetrics.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="p-2 rounded-full bg-red-500/10">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{taskMetrics.overdue}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Detailed Analytics */}
      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:w-auto lg:inline-flex h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matters">Matters</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Matter Status Distribution */}
            <ModuleErrorBoundary name="Matter Status Chart">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Matter Status Distribution</CardTitle>
                  <CardDescription>Breakdown of matters by current status</CardDescription>
                </CardHeader>
                <CardContent>
                  {caseStatusData.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={caseStatusData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            strokeWidth={2}
                            stroke="hsl(var(--background))"
                          >
                            {caseStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-muted-foreground">
                      No matter data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </ModuleErrorBoundary>

            {/* Contract Status Distribution */}
            <ModuleErrorBoundary name="Contract Status Chart">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Contract Status</CardTitle>
                  <CardDescription>Distribution of contracts by status</CardDescription>
                </CardHeader>
                <CardContent>
                  {contractStatusData.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={contractStatusData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            strokeWidth={2}
                            stroke="hsl(var(--background))"
                          >
                            {contractStatusData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-muted-foreground">
                      No contract data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </ModuleErrorBoundary>
          </div>

          {/* Client Growth Chart */}
          <ModuleErrorBoundary name="Client Growth Chart">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Client Growth Trend</CardTitle>
                <CardDescription>New and cumulative client count over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={clientActivityData}>
                      <defs>
                        <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                        </linearGradient>
                      </defs>
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
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                      />
                      <Area
                        type="monotone"
                        dataKey="active"
                        name="Total Clients"
                        stroke={CHART_COLORS.success}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorActive)"
                      />
                      <Area
                        type="monotone"
                        dataKey="new"
                        name="New Clients"
                        stroke={CHART_COLORS.primary}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorNew)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>

        {/* Matters Tab */}
        <TabsContent value="matters" className="space-y-6">
          {/* Matter Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <Briefcase className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalCases}</p>
                    <p className="text-sm text-muted-foreground">Total Matters</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {cases.filter((c) => c.status?.toLowerCase() === "open").length}
                    </p>
                    <p className="text-sm text-muted-foreground">Open Matters</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/10">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {cases.filter((c) => c.priority?.toLowerCase() === "high").length}
                    </p>
                    <p className="text-sm text-muted-foreground">High Priority</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Chart */}
            <ModuleErrorBoundary name="Matter Status">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={caseStatusData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} horizontal={false} />
                        <XAxis type="number" axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          width={80}
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: "8px",
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {caseStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </ModuleErrorBoundary>

            {/* Priority Distribution */}
            <ModuleErrorBoundary name="Priority Distribution">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Priority Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {priorityData.length > 0 ? (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={priorityData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            strokeWidth={2}
                            stroke="hsl(var(--background))"
                          >
                            {priorityData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                            }}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={36}
                            formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-muted-foreground">
                      No priority data available
                    </div>
                  )}
                </CardContent>
              </Card>
            </ModuleErrorBoundary>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10">
                    <Users className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalClients}</p>
                    <p className="text-sm text-muted-foreground">Total Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <CheckCircle2 className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{activeClients}</p>
                    <p className="text-sm text-muted-foreground">Active Clients</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-violet-500/10">
                    <TrendingUp className="h-6 w-6 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {clients.filter((c) => {
                        const created = new Date(c.created_at || "");
                        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                        return created >= thirtyDaysAgo;
                      }).length}
                    </p>
                    <p className="text-sm text-muted-foreground">New This Month</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <ModuleErrorBoundary name="Client Activity Chart">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Client Acquisition Trend</CardTitle>
                <CardDescription>Monthly client growth over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={clientActivityData}>
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
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
                      />
                      <Line
                        type="monotone"
                        dataKey="active"
                        name="Cumulative Clients"
                        stroke={CHART_COLORS.success}
                        strokeWidth={3}
                        dot={{ fill: CHART_COLORS.success, strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="new"
                        name="New Clients"
                        stroke={CHART_COLORS.primary}
                        strokeWidth={3}
                        dot={{ fill: CHART_COLORS.primary, strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/10">
                    <FileText className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalDocuments}</p>
                    <p className="text-sm text-muted-foreground">Total Documents</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <Calendar className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">{totalEvents}</p>
                    <p className="text-sm text-muted-foreground">Calendar Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10">
                    <TrendingUp className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold">
                      {Array.isArray(documents)
                        ? documents.filter((d: { created_at?: string | null }) => {
                            if (!d.created_at) return false;
                            const created = new Date(d.created_at);
                            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                            return created >= sevenDaysAgo;
                          }).length
                        : 0}
                    </p>
                    <p className="text-sm text-muted-foreground">This Week</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <ModuleErrorBoundary name="Document Upload Trends">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Document Upload Trends</CardTitle>
                <CardDescription>Monthly document uploads over time</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={documentTrends}>
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
                        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Documents Uploaded"
                        fill={CHART_COLORS.warning}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
