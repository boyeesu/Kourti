import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Area,
  AreaChart
} from "recharts";
import { 
  BarChart4, 
  PieChart as PieChartIcon, 
  LineChart as LineChartIcon, 
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  Clock,
  Users,
  FileText,
  Briefcase,
  CheckCircle2,
  TimerIcon,
  Target
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Types
type StatCardProps = {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  iconColor?: string;
  iconBgColor?: string;
};

// Dummy data for charts and stats
const caseStatusData = [
  { name: 'Active', value: 45, color: '#3b82f6' },
  { name: 'Pending', value: 23, color: '#f59e0b' },
  { name: 'Closed', value: 12, color: '#10b981' },
  { name: 'On Hold', value: 8, color: '#ef4444' },
];

const revenueData = [
  { month: 'Jan', billable: 5000, collected: 4800 },
  { month: 'Feb', billable: 6500, collected: 6200 },
  { month: 'Mar', billable: 5800, collected: 5500 },
  { month: 'Apr', billable: 7200, collected: 6800 },
  { month: 'May', billable: 6900, collected: 6300 },
  { month: 'Jun', billable: 8500, collected: 7900 },
  { month: 'Jul', billable: 8200, collected: 7500 },
  { month: 'Aug', billable: 9000, collected: 8200 },
  { month: 'Sep', billable: 8700, collected: 7800 },
  { month: 'Oct', billable: 9500, collected: 8700 },
  { month: 'Nov', billable: 9200, collected: 8200 },
  { month: 'Dec', billable: 8800, collected: 7700 },
];

const userActivityData = [
  { day: 'Mon', cases: 10, documents: 15, contracts: 5 },
  { day: 'Tue', cases: 12, documents: 18, contracts: 7 },
  { day: 'Wed', cases: 15, documents: 12, contracts: 9 },
  { day: 'Thu', cases: 8, documents: 15, contracts: 6 },
  { day: 'Fri', cases: 14, documents: 22, contracts: 10 },
  { day: 'Sat', cases: 5, documents: 8, contracts: 3 },
  { day: 'Sun', cases: 3, documents: 5, contracts: 2 },
];

const clientGrowthData = [
  { month: 'Jan', clients: 42 },
  { month: 'Feb', clients: 48 },
  { month: 'Mar', clients: 53 },
  { month: 'Apr', clients: 59 },
  { month: 'May', clients: 64 },
  { month: 'Jun', clients: 68 },
  { month: 'Jul', clients: 72 },
  { month: 'Aug', clients: 79 },
  { month: 'Sep', clients: 84 },
  { month: 'Oct', clients: 87 },
  { month: 'Nov', clients: 92 },
  { month: 'Dec', clients: 98 },
];

const caseTypeData = [
  { name: 'Corporate', value: 35, color: '#4f46e5' },
  { name: 'Litigation', value: 28, color: '#0ea5e9' },
  { name: 'Real Estate', value: 18, color: '#10b981' },
  { name: 'IP', value: 12, color: '#f59e0b' },
  { name: 'Family', value: 7, color: '#ec4899' },
];

const documentTypeData = [
  { name: 'Contracts', value: 45, color: '#3b82f6' },
  { name: 'Legal Opinions', value: 23, color: '#f59e0b' },
  { name: 'Filings', value: 18, color: '#10b981' },
  { name: 'Correspondence', value: 14, color: '#ec4899' },
];

// CustomTooltip for charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-background/95 backdrop-blur-sm border border-border p-3 rounded-lg shadow-lg">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center gap-2 text-sm">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color || entry.fill }}
            />
            <span className="font-medium">{entry.name}:</span>
            <span>{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
};

// Stat Card Component
const StatCard = ({ 
  title, 
  value, 
  change, 
  changeLabel, 
  icon, 
  iconColor = "text-primary",
  iconBgColor = "bg-primary/10"
}: StatCardProps) => {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
            <h3 className="text-2xl font-bold">{value}</h3>
            {change !== undefined && (
              <div className="flex items-center mt-2">
                <Badge 
                  variant={change > 0 ? "success" : change < 0 ? "destructive" : "secondary"} 
                  className="px-1.5 py-0 h-5"
                >
                  {change > 0 ? (
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                  ) : change < 0 ? (
                    <ArrowDownRight className="h-3 w-3 mr-1" />
                  ) : null}
                  {Math.abs(change)}%
                </Badge>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground ml-2">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className={`p-3 rounded-full ${iconBgColor}`}>
            <div className={`h-5 w-5 ${iconColor}`}>
              {icon}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default function Analytics() {
  const [dateRange, setDateRange] = useState("year");
  const [activeTab, setActiveTab] = useState("overview");
  
  return (
    <div className="px-4 py-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">
            Monitor performance metrics and track key indicators
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select defaultValue={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">Last 30 days</SelectItem>
              <SelectItem value="quarter">Last quarter</SelectItem>
              <SelectItem value="year">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>
      
      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart4 className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span>Performance</span>
          </TabsTrigger>
          <TabsTrigger value="cases" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            <span>Cases</span>
          </TabsTrigger>
          <TabsTrigger value="finance" className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4" />
            <span>Finance</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Total Cases" 
              value="88" 
              change={12} 
              changeLabel="vs last period" 
              icon={<Briefcase className="h-5 w-5" />}
              iconColor="text-blue-500"
              iconBgColor="bg-blue-500/10"
            />
            <StatCard 
              title="Active Clients" 
              value="98" 
              change={8} 
              changeLabel="vs last period" 
              icon={<Users className="h-5 w-5" />}
              iconColor="text-green-500"
              iconBgColor="bg-green-500/10"
            />
            <StatCard 
              title="Documents Created" 
              value="345" 
              change={15} 
              changeLabel="vs last period" 
              icon={<FileText className="h-5 w-5" />}
              iconColor="text-amber-500"
              iconBgColor="bg-amber-500/10"
            />
            <StatCard 
              title="Revenue" 
              value="$89,520" 
              change={7} 
              changeLabel="vs last period" 
              icon={<CircleDollarSign className="h-5 w-5" />}
              iconColor="text-purple-500"
              iconBgColor="bg-purple-500/10"
            />
          </div>
          
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Case Distribution */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Case Status Distribution
                </CardTitle>
                <CardDescription>
                  Breakdown of cases by current status
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={caseStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {caseStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        height={36}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Revenue Trends */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChartIcon className="h-5 w-5 text-primary" />
                  Revenue Trends
                </CardTitle>
                <CardDescription>
                  Billable hours vs collected revenue
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueData}
                      margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="billable"
                        name="Billable"
                        stackId="1"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                      <Area
                        type="monotone"
                        dataKey="collected"
                        name="Collected"
                        stackId="2"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.3}
                      />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        height={36}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Additional Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Activity */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart4 className="h-5 w-5 text-primary" />
                  Weekly Activity
                </CardTitle>
                <CardDescription>
                  User activity breakdown by day
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userActivityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="cases"
                        name="Cases"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="documents"
                        name="Documents"
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="contracts"
                        name="Contracts"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        height={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            {/* Client Growth */}
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Client Growth
                </CardTitle>
                <CardDescription>
                  New client acquisition over time
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={clientGrowthData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                      <XAxis dataKey="month" axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="clients"
                        name="Clients"
                        stroke="#3b82f6"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        height={36}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Case Resolution Rate" 
              value="85%" 
              change={5} 
              changeLabel="vs last period" 
              icon={<CheckCircle2 className="h-5 w-5" />}
              iconColor="text-green-500"
              iconBgColor="bg-green-500/10"
            />
            <StatCard 
              title="Avg. Resolution Time" 
              value="18 days" 
              change={-12} 
              changeLabel="vs last period" 
              icon={<Clock className="h-5 w-5" />}
              iconColor="text-blue-500"
              iconBgColor="bg-blue-500/10"
            />
            <StatCard 
              title="Document Turnover" 
              value="2.4 days" 
              change={-8} 
              changeLabel="vs last period" 
              icon={<FileText className="h-5 w-5" />}
              iconColor="text-amber-500"
              iconBgColor="bg-amber-500/10"
            />
            <StatCard 
              title="Client Satisfaction" 
              value="92%" 
              change={3} 
              changeLabel="vs last period" 
              icon={<Users className="h-5 w-5" />}
              iconColor="text-purple-500"
              iconBgColor="bg-purple-500/10"
            />
          </div>
          
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>
                Key performance indicators for your legal practice
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground py-12">
                Detailed performance metrics will be displayed here.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Cases Tab */}
        <TabsContent value="cases" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard 
              title="Total Cases" 
              value="88" 
              icon={<Briefcase className="h-5 w-5" />}
              iconColor="text-blue-500"
              iconBgColor="bg-blue-500/10"
            />
            <StatCard 
              title="New Cases (Month)" 
              value="14" 
              icon={<Briefcase className="h-5 w-5" />}
              iconColor="text-green-500"
              iconBgColor="bg-green-500/10"
            />
            <StatCard 
              title="Case Closure Rate" 
              value="85%" 
              icon={<CheckCircle2 className="h-5 w-5" />}
              iconColor="text-amber-500"
              iconBgColor="bg-amber-500/10"
            />
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Cases by Type
                </CardTitle>
                <CardDescription>
                  Distribution of cases by practice area
                </CardDescription>
              </CardHeader>
              <CardContent className="px-2">
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={caseTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {caseTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<CustomTooltip />} />
                      <Legend 
                        layout="horizontal" 
                        verticalAlign="bottom" 
                        align="center"
                        height={36}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TimerIcon className="h-5 w-5 text-primary" />
                  Average Case Lifecycle
                </CardTitle>
                <CardDescription>
                  Time from opening to closing by case type
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-center text-muted-foreground py-12">
                  Case lifecycle visualization will be displayed here.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Finance Tab */}
        <TabsContent value="finance" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Total Revenue" 
              value="$89,520" 
              change={7} 
              changeLabel="vs last period" 
              icon={<CircleDollarSign className="h-5 w-5" />}
              iconColor="text-green-500"
              iconBgColor="bg-green-500/10"
            />
            <StatCard 
              title="Outstanding Invoices" 
              value="$12,450" 
              change={-5} 
              changeLabel="vs last period" 
              icon={<CircleDollarSign className="h-5 w-5" />}
              iconColor="text-amber-500"
              iconBgColor="bg-amber-500/10"
            />
            <StatCard 
              title="Average Invoice" 
              value="$3,420" 
              change={2} 
              changeLabel="vs last period" 
              icon={<CircleDollarSign className="h-5 w-5" />}
              iconColor="text-blue-500"
              iconBgColor="bg-blue-500/10"
            />
            <StatCard 
              title="Collection Rate" 
              value="92%" 
              change={3} 
              changeLabel="vs last period" 
              icon={<CircleDollarSign className="h-5 w-5" />}
              iconColor="text-purple-500"
              iconBgColor="bg-purple-500/10"
            />
          </div>
          
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-5 w-5 text-primary" />
                Revenue Trends
              </CardTitle>
              <CardDescription>
                Monthly revenue analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={revenueData}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#888" opacity={0.1} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="billable"
                      name="Billable"
                      stackId="1"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      name="Collected"
                      stackId="2"
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.3}
                    />
                    <Legend 
                      layout="horizontal" 
                      verticalAlign="bottom" 
                      align="center"
                      height={36}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Export Options */}
      <Card className="shadow-sm bg-muted/30">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-1">Analytics Reports</h3>
              <p className="text-muted-foreground">
                Export detailed reports for your records or presentations
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                PDF Report
              </Button>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Excel Data
              </Button>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}