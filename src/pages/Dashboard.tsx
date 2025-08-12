import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Calendar as CalIcon, FileText, FileCheck, Users, Plus, TrendingUp, Clock } from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboard';
import { useInsights } from '@/hooks/useInsights';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: dashboardData } = useDashboardStats();
  const { upcomingCases, upcomingContracts } = useInsights(7);

  // Widget preferences
  const widgets = useMemo(
    () =>
      (JSON.parse(localStorage.getItem('dashboardWidgets') || '{}') as {
        showUpcomingCases?: boolean;
        showUpcomingContracts?: boolean;
      }),
    []
  );

  // Stats cards
  const stats = [
    {
      title: 'Active Cases',
      value: dashboardData?.totalCases?.toString() || '0',
      change: `${dashboardData?.activeCases || 0} active`,
      icon: Briefcase,
      color: 'text-primary',
    },
    {
      title: 'Upcoming Events',
      value: dashboardData?.upcomingEvents?.toString() || '0',
      change: 'Next 7 days',
      icon: CalIcon,
      color: 'text-warning',
    },
    {
      title: 'Documents',
      value: dashboardData?.totalDocuments?.toString() || '0',
      change: 'Total uploaded',
      icon: FileText,
      color: 'text-success',
    },
    {
      title: 'Total Clients',
      value: dashboardData?.totalClients?.toString() || '0',
      change: 'In your organization',
      icon: Users,
      color: 'text-info',
    },
  ];

  const recentCases = dashboardData?.recentCases || [];
  const upcomingEvents = dashboardData?.upcomingCalendarEvents || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-success text-success-foreground';
      case 'Review': return 'bg-warning text-warning-foreground';
      case 'Draft': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Actionable Insights */}
      {widgets.showUpcomingCases !== false && upcomingCases.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Upcoming Hearings</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingCases.map(c => (
                <li key={c.id}>{c.title} on {new Date(c.next_hearing_date!).toLocaleDateString()}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {widgets.showUpcomingContracts !== false && upcomingContracts.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle>Contracts Expiring Soon</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingContracts.map((c: any) => (
                <li key={c.id}>{c.name} expires {new Date(c._insight_date).toLocaleDateString()}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's what's happening with your legal practice.</p>
        </div>
        <Button onClick={() => navigate('/cases/create')}>
          <Plus className="h-4 w-4 mr-2" /> New Case
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map(stat => (
          <Card key={stat.title} className="shadow-card hover:shadow-elegant transition-shadow">
            <CardHeader className="flex items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Cases & Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" /> Recent Cases</CardTitle>
            <CardDescription>Your most recently updated cases</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentCases.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex-1 space-y-1">
                  <h4 className="font-medium text-foreground">{item.title}</h4>
                  <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                </div>
                <div className="flex items-center text-sm text-muted-foreground gap-1">
                  <Clock className="h-3 w-3" /> {new Date(item.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={() => navigate('/cases')}>View All Cases</Button>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalIcon className="h-5 w-5 text-primary" /> Upcoming Events</CardTitle>
            <CardDescription>Your schedule for the next few days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingEvents.map(ev => (
              <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <h4 className="font-medium text-foreground">{ev.title}</h4>
                  <p className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(ev.start_date).toLocaleTimeString()} • {new Date(ev.start_date).toLocaleDateString()}</p>
                </div>
                <Badge>{ev.event_type}</Badge>
              </div>
            ))}
            <Button variant="outline" onClick={() => navigate('/calendar')}>View Full Calendar</Button>
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
            <Button variant="outline" className="flex flex-col h-20 justify-center items-center gap-2" onClick={() => navigate('/cases/create')}><Briefcase className="h-6 w-6" /><span className="text-sm">New Case</span></Button>
            <Button variant="outline" className="flex flex-col h-20 justify-center items-center gap-2"><CalIcon className="h-6 w-6" /><span className="text-sm">Schedule Event</span></Button>
            <Button variant="outline" className="flex flex-col h-20 justify-center items-center gap-2"><FileText className="h-6 w-6" /><span className="text-sm">Upload Document</span></Button>
            <Button variant="outline" className="flex flex-col h-20 justify-center items-center gap-2"><FileCheck className="h-6 w-6" /><span className="text-sm">New Contract</span></Button>
            <Button variant="outline" className="flex flex-col h-20 justify-center items-center gap-2"><Users className="h-6 w-6" /><span className="text-sm">Invite User</span></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}