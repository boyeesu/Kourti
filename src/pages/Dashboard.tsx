
import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tooltip,
  Legend
} from "recharts";
import { 
  FileText, 
  Users, 
  Briefcase,
  TrendingUp,
  AlertTriangle,
  Clock,
  DollarSign,
  BarChart,
  RefreshCw,
  ArrowRight
} from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { useDashboard } from "@/hooks/useDashboard";
import { useUserRole } from "@/hooks/useUserManagement";
import { useCases } from "@/hooks/useCases";
import { useContracts } from "@/hooks/useContracts";
import { Case, Contract } from "@/types";
import { formatDate, formatCurrency } from "@/lib/utils";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const [windowDays] = useState(7);
  const navigate = useNavigate();

  // Get data for different dashboard sections
  const { upcomingCases, upcomingContracts } = useInsights(windowDays);
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError, refetch: refetchDashboard } = useDashboard();
  const { data: userRoleData } = useUserRole();
  const { data: casesData, isLoading: casesLoading } = useCases();
  const { data: contractsData, isLoading: contractsLoading } = useContracts();
  
  const role = userRoleData?.role;
  const isAdmin = role === "super_admin" || role === "admin";

  // Process case status data for pie chart
  const casesByStatus = useMemo(() => {
    // If we have real data, use it
    if (casesData?.cases) {
      const statusMap: Record<string, number> = {};
      casesData.cases.forEach((c: Case) => {
        const status = c.status || 'unknown';
        statusMap[status] = (statusMap[status] || 0) + 1;
      });

      // Transform to format needed for pie chart
      return Object.entries(statusMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace('_', ' '),
        value,
        color: getStatusColor(name)
      }));
    }

    // Fallback to sample data
    return [
      { name: 'Active', value: 45, color: '#3b82f6' },
      { name: 'Pending', value: 23, color: '#f59e0b' },
      { name: 'Closed', value: 12, color: '#10b981' }
    ];
  }, [casesData]);

  // Generate monthly activity data based on real data if available
  const recentActivity = useMemo(() => {
    // If we have real case and contract data, calculate monthly trends
    if (casesData?.cases && contractsData) {
      const monthlyData: Record<string, { cases: number; contracts: number }> = {};
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      // Initialize all months to zero
      months.forEach(month => {
        monthlyData[month] = { cases: 0, contracts: 0 };
      });
      
      // Count cases by month
      casesData.cases.forEach((c: Case) => {
        if (c.created_at) {
          const month = months[new Date(c.created_at).getMonth()];
          monthlyData[month].cases += 1;
        }
      });
      
      // Count contracts by month
      contractsData.forEach((contract: Contract) => {
        if (contract.created_at) {
          const month = months[new Date(contract.created_at).getMonth()];
          monthlyData[month].contracts += 1;
        }
      });
      
      // Transform to array format for the chart
      return months.map(month => ({
        month,
        cases: monthlyData[month].cases,
        contracts: monthlyData[month].contracts
      }));
    }

    // Fallback to sample data
    return [
      { month: 'Jan', cases: 12, contracts: 8 },
      { month: 'Feb', cases: 19, contracts: 12 },
      { month: 'Mar', cases: 15, contracts: 9 },
      { month: 'Apr', cases: 22, contracts: 15 },
      { month: 'May', cases: 18, contracts: 11 },
      { month: 'Jun', cases: 24, contracts: 16 },
      { month: 'Jul', cases: 20, contracts: 14 },
      { month: 'Aug', cases: 25, contracts: 18 },
      { month: 'Sep', cases: 17, contracts: 13 },
      { month: 'Oct', cases: 21, contracts: 16 },
      { month: 'Nov', cases: 16, contracts: 12 },
      { month: 'Dec', cases: 10, contracts: 8 }
    ];
  }, [casesData, contractsData]);

  // Helper function to get color based on status
  function getStatusColor(status: string): string {
    switch (status.toLowerCase()) {
      case 'active': return '#3b82f6';
      case 'pending': 
      case 'in_progress': return '#f59e0b';
      case 'closed': return '#10b981';
      case 'expired': return '#ef4444';
      default: return '#6b7280';
    }
  }

  // Handle loading states
  if (dashboardLoading && casesLoading && contractsLoading) {
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
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your legal practice</p>
      </div>

      {/* Stats Cards (Live Data) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Cases</p>
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

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Users className="h-5 w-5 text-success" />
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

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-warning/10 rounded-lg">
                <FileText className="h-5 w-5 text-warning" />
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

        {isAdmin && (
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <DollarSign className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                  <p className="text-2xl font-bold">
                    {dashboardLoading ? (
                      <span className="animate-pulse">—</span>
                    ) : (
                      formatCurrency(dashboardData?.totalRevenue || 0)
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModuleErrorBoundary name="Monthly Activity Chart">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Monthly Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={recentActivity}>
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
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      borderRadius: '6px',
                      border: '1px solid #eee',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                  />
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    iconType="circle"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cases" 
                    name="Cases" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    activeDot={{ r: 8 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="contracts" 
                    name="Contracts" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </ModuleErrorBoundary>

        <ModuleErrorBoundary name="Cases by Status Chart">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Cases by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={true}
                  >
                    {casesByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      borderRadius: '6px',
                      border: '1px solid #eee',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
                    }}
                  />
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

      {/* Upcoming Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ModuleErrorBoundary name="Upcoming Hearings">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-warning" />
                  Upcoming Hearings
                </CardTitle>
                <CardDescription>Next {windowDays} days</CardDescription>
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
                      <TableHead>Case</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Court</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingCases.map((c: Case) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/cases/${c.id}`)}>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell>{formatDate(c.next_hearing_date)}</TableCell>
                        <TableCell>{c.court || 'TBD'}</TableCell>
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
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Contract Renewals
                </CardTitle>
                <CardDescription>Expiring soon</CardDescription>
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
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcomingContracts.map((contract: Contract) => (
                      <TableRow 
                        key={contract.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/contracts/${contract.id}`)}
                      >
                        <TableCell className="font-medium">{contract.title}</TableCell>
                        <TableCell>{formatDate(contract.end_date)}</TableCell>
                        <TableCell>{formatCurrency(contract.value)}</TableCell>
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
