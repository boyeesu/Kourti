import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Briefcase, 
  Calendar, 
  FileText, 
  FileCheck, 
  Users, 
  Plus,
  TrendingUp,
  Clock,
  AlertCircle
} from "lucide-react";
import { useDashboardStats } from "@/hooks/useDashboard";
import { useMemo } from "react";

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: dashboardData, isLoading, error } = useDashboardStats();

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 flex flex-col items-center justify-center space-y-4">
        <p className="text-destructive text-lg">Failed to load dashboard data.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  const stats = [
    {
      title: "Active Cases",
      value: dashboardData?.totalCases?.toString() || "0",
      change: `${dashboardData?.activeCases || 0} active`,
      icon: Briefcase,
      color: "text-primary"
    },
    {
      title: "Upcoming Events",
      value: dashboardData?.upcomingEvents?.toString() || "0",
      change: "Next 7 days",
      icon: Calendar,
      color: "text-warning"
    },
    {
      title: "Documents",
      value: dashboardData?.totalDocuments?.toString() || "0",
      change: "Total uploaded",
      icon: FileText,
      color: "text-success"
    },
    {
      title: "Total Clients",
      value: dashboardData?.totalClients?.toString() || "0",
      change: "In your organization",
      icon: Users,
      color: "text-info"
    }
  ];

  const recentCases = dashboardData?.recentCases || [];
  const upcomingEvents = dashboardData?.upcomingCalendarEvents || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Active": return "bg-success text-success-foreground";
      case "Review": return "bg-warning text-warning-foreground";
      case "Draft": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High": return "bg-destructive text-destructive-foreground";
      case "Medium": return "bg-warning text-warning-foreground";
      case "Low": return "bg-success text-success-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening with your legal practice.</p>
        </div>
        <Button className="shadow-md" onClick={() => navigate("/cases/create")}>
          <Plus className="h-4 w-4 mr-2" />
          New Case
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-card hover:shadow-elegant transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center mt-1">
                <TrendingUp className="h-3 w-3 mr-1" />
                {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Cases */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Recent Cases
            </CardTitle>
            <CardDescription>Your most recently updated cases</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentCases.map((case_item) => (
              <div key={case_item.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-1 flex-1">
                  <h4 className="font-medium text-foreground">{case_item.title}</h4>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(case_item.status)} variant="secondary">
                      {case_item.status}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {new Date(case_item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => navigate("/cases")}>View All Cases</Button>
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Upcoming Events
            </CardTitle>
            <CardDescription>Your schedule for the next few days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <h4 className="font-medium text-foreground">{event.title}</h4>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {new Date(event.start_date).toLocaleTimeString()} • {new Date(event.start_date).toLocaleDateString()}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {event.event_type}
                </Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => navigate("/calendar")}>View Full Calendar</Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Frequently used actions for efficient workflow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => navigate("/cases/create")}>
              <Briefcase className="h-6 w-6" />
              <span className="text-sm">New Case</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <Calendar className="h-6 w-6" />
              <span className="text-sm">Schedule Event</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <FileText className="h-6 w-6" />
              <span className="text-sm">Upload Document</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <FileCheck className="h-6 w-6" />
              <span className="text-sm">New Contract</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <Users className="h-6 w-6" />
              <span className="text-sm">Invite User</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}