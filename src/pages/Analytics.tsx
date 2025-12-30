import { useState, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useFetchData } from "@/lib/api";
import { useContracts } from '@/hooks/useContracts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import {
  Users,
  FileText,
  DollarSign,
  Scale,
  RefreshCw
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ModuleErrorBoundary } from "@/components/ErrorBoundary";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  calculateCaseStatusData,
  calculateClientActivity,
  calculateMonthlyRevenue,
  calculateMonthOverMonthMetrics
} from "@/lib/analyticsUtils";


export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState("6months");

  // Fetch real data
  const { data: cases, isLoading: casesLoading, refetch: refetchCases } = useFetchData({
    table: 'cases',
    queryKey: ['analytics-cases'],
    select: 'id, status, created_at, title, priority',
  });

  const { data: clients, isLoading: clientsLoading, refetch: refetchClients } = useFetchData({
    table: 'clients',
    queryKey: ['analytics-clients'],
    select: 'id, created_at, name, status',
  });

  const { data: contractsData, isLoading: contractsLoading, refetch: refetchContracts } = useContracts(1, 1000);
  const contracts = contractsData?.contracts || [];

  const { data: invoices, isLoading: invoicesLoading, refetch: refetchInvoices } = useFetchData({
    table: 'invoices',
    queryKey: ['analytics-invoices'],
    select: 'id, total_amount, status, created_at, due_date',
  });

  const { data: documents, isLoading: documentsLoading, refetch: refetchDocuments } = useFetchData({
    table: 'documents',
    queryKey: ['analytics-documents'],
    select: 'id, created_at, name',
  });

  const { data: events, isLoading: eventsLoading, refetch: refetchEvents } = useFetchData({
    table: 'calendar_events',
    queryKey: ['analytics-events'],
    select: 'id, created_at, event_type, start_date, end_date',
  });

  // Calculate real metrics from data
  const casesArray = cases?.data || [];
  const clientsArray = clients?.data || [];
  const invoicesArray = invoices?.data || [];
  const documentsArray = documents?.data || [];

  // Calculate case status distribution (real data)
  const caseStatusData = useMemo(() => {
    return calculateCaseStatusData(casesArray);
  }, [casesArray]);

  // Calculate client activity trends (real data)
  const clientActivityData = useMemo(() => {
    const months = selectedPeriod === "1month" ? 1 :
      selectedPeriod === "3months" ? 3 :
        selectedPeriod === "1year" ? 12 : 6;
    return calculateClientActivity(clientsArray, months);
  }, [clientsArray, selectedPeriod]);

  // Calculate revenue trends (real data)
  const revenueData = useMemo(() => {
    const months = selectedPeriod === "1month" ? 1 :
      selectedPeriod === "3months" ? 3 :
        selectedPeriod === "1year" ? 12 : 6;
    return calculateMonthlyRevenue(invoicesArray, contracts, months);
  }, [invoicesArray, contracts, selectedPeriod]);

  // Calculate month-over-month changes (real data)
  const casesChange = useMemo(() => calculateMonthOverMonthMetrics(casesArray), [casesArray]);
  const clientsChange = useMemo(() => calculateMonthOverMonthMetrics(clientsArray), [clientsArray]);
  const revenueChange = useMemo(() => {
    const paidInvoices = invoicesArray.filter(inv => inv.status === 'paid');
    return calculateMonthOverMonthMetrics(paidInvoices);
  }, [invoicesArray]);
  const contractsChange = useMemo(() => calculateMonthOverMonthMetrics(contracts), [contracts]);

  // Calculate totals
  const totalCases = casesArray.length;
  const totalClients = clientsArray.length;
  const totalContracts = contracts.length;
  const totalInvoices = invoicesArray.length;
  const totalDocuments = documentsArray.length;
  const totalEvents = events?.data?.length || 0;

  const totalRevenue = invoicesArray.reduce((sum, inv) =>
    inv.status === 'paid' ? sum + (inv.total_amount || 0) : sum, 0);

  const totalContractValue = contracts.reduce((sum, contract) =>
    sum + (contract.value || 0), 0);

  const isLoading = casesLoading || clientsLoading || contractsLoading ||
    invoicesLoading || documentsLoading || eventsLoading;

  // Refresh all data
  const handleRefresh = () => {
    refetchCases();
    refetchClients();
    refetchContracts();
    refetchInvoices();
    refetchDocuments();
    refetchEvents();
  };

  return (
    <div className="px-4 py-6 space-y-6 animate-fade-in">
      <Breadcrumbs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Comprehensive insights across your legal practice</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1month">1 Month</SelectItem>
              <SelectItem value="3months">3 Months</SelectItem>
              <SelectItem value="6months">6 Months</SelectItem>
              <SelectItem value="1year">1 Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Scale className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cases</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : totalCases}</p>
                <p className={`text-xs ${casesChange.direction === 'up' ? 'text-green-600' : casesChange.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {casesChange.formatted} vs last month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Clients</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : totalClients}</p>
                <p className={`text-xs ${clientsChange.direction === 'up' ? 'text-green-600' : clientsChange.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {clientsChange.formatted} vs last month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Revenue (Paid)</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : formatCurrency(totalRevenue)}</p>
                <p className={`text-xs ${revenueChange.direction === 'up' ? 'text-green-600' : revenueChange.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {revenueChange.formatted} vs last month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Contract Value</p>
                <p className="text-2xl font-bold">{isLoading ? "—" : formatCurrency(totalContractValue)}</p>
                <p className={`text-xs ${contractsChange.direction === 'up' ? 'text-green-600' : contractsChange.direction === 'down' ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {contractsChange.formatted} vs last month
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="invoicing">Invoicing</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ModuleErrorBoundary name="Case Status Chart">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Case Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={caseStatusData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                        >
                          {caseStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </ModuleErrorBoundary>

            <ModuleErrorBoundary name="Revenue Trends">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle>Revenue Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                        <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} />
                        <Line type="monotone" dataKey="contracts" stroke="#10b981" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </ModuleErrorBoundary>
          </div>
        </TabsContent>

        <TabsContent value="cases" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalCases}</p>
                  <p className="text-sm text-muted-foreground">Total Cases</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {((cases as any)?.data?.filter((c: any) => c.status === 'open') || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Open Cases</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {((cases as any)?.data?.filter((c: any) => c.priority === 'high') || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">High Priority</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <ModuleErrorBoundary name="Cases Chart">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Cases Created Over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="new" fill="#3b82f6" name="New Cases" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{totalClients}</p>
                  <p className="text-sm text-muted-foreground">Total Clients</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {((clients as any)?.data?.filter((c: any) => c.status === 'active') || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Clients</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {((clients as any)?.data?.filter((c: any) => {
                      const created = new Date(c.created_at);
                      const now = new Date();
                      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                      return created >= thirtyDaysAgo;
                    }) || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">New This Month</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <ModuleErrorBoundary name="Client Activity Chart">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Client Growth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={clientActivityData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="active" stroke="#10b981" strokeWidth={3} name="Active Clients" />
                      <Line type="monotone" dataKey="new" stroke="#3b82f6" strokeWidth={3} name="New Clients" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>

        <TabsContent value="contracts" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalContracts}</p>
                  <p className="text-sm text-muted-foreground">Total Contracts</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalContractValue)}</p>
                  <p className="text-sm text-muted-foreground">Total Value</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {contracts?.filter((c: any) => c.status === 'active').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Active Contracts</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="invoicing" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalInvoices}</p>
                  <p className="text-sm text-muted-foreground">Total Invoices</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</p>
                  <p className="text-sm text-muted-foreground">Revenue (Paid)</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {((invoices as any)?.data?.filter((i: any) => ['draft', 'sent'].includes(i.status)) || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {((invoices as any)?.data?.filter((i: any) => i.status === 'overdue') || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <ModuleErrorBoundary name="Revenue Chart">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Revenue & Invoicing Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" fill="#10b981" name="Invoice Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </ModuleErrorBoundary>
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{totalDocuments}</p>
                  <p className="text-sm text-muted-foreground">Total Documents</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{totalEvents}</p>
                  <p className="text-sm text-muted-foreground">Calendar Events</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {((documents as any)?.data?.filter((d: any) => {
                      const created = new Date(d.created_at);
                      const now = new Date();
                      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      return created >= sevenDaysAgo;
                    }) || []).length}
                  </p>
                  <p className="text-sm text-muted-foreground">This Week</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}