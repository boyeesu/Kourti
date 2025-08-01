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

export default function Dashboard() {
  const navigate = useNavigate();
  const stats = [
    {
      title: "Active Cases",
      value: "24",
      change: "+3 this week",
      icon: Briefcase,
      color: "text-primary"
    },
    {
      title: "Upcoming Events",
      value: "8",
      change: "Next 7 days",
      icon: Calendar,
      color: "text-warning"
    },
    {
      title: "Documents",
      value: "156",
      change: "+12 this week",
      icon: FileText,
      color: "text-success"
    },
    {
      title: "Active Contracts",
      value: "31",
      change: "4 expire soon",
      icon: FileCheck,
      color: "text-destructive"
    }
  ];

  const recentCases = [
    {
      id: 1,
      name: "Smith vs. Johnson Contract Dispute",
      status: "Active",
      priority: "High",
      dueDate: "2024-02-15",
      client: "Acme Corp"
    },
    {
      id: 2,
      name: "Corporate Merger Review",
      status: "Review",
      priority: "Medium",
      dueDate: "2024-02-20",
      client: "Tech Solutions Inc"
    },
    {
      id: 3,
      name: "Employment Agreement Analysis",
      status: "Draft",
      priority: "Low",
      dueDate: "2024-02-28",
      client: "StartupXYZ"
    }
  ];

  const upcomingEvents = [
    {
      id: 1,
      title: "Client Meeting - Smith Case",
      time: "10:00 AM",
      date: "Today",
      type: "Meeting"
    },
    {
      id: 2,
      title: "Contract Review Deadline",
      time: "5:00 PM",
      date: "Tomorrow",
      type: "Deadline"
    },
    {
      id: 3,
      title: "Court Hearing - Johnson Case",
      time: "2:00 PM",
      date: "Feb 15",
      type: "Hearing"
    }
  ];

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
                  <h4 className="font-medium text-foreground">{case_item.name}</h4>
                  <p className="text-sm text-muted-foreground">{case_item.client}</p>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(case_item.status)} variant="secondary">
                      {case_item.status}
                    </Badge>
                    <Badge className={getPriorityColor(case_item.priority)} variant="outline">
                      {case_item.priority}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    Due {case_item.dueDate}
                  </p>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full">View All Cases</Button>
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
                    {event.time} • {event.date}
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {event.type}
                </Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full">View Full Calendar</Button>
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