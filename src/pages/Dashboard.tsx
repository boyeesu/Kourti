
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Calendar as CalIcon, FileText, Users, Plus, TrendingUp, Clock, FileCheck, Upload } from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboard';
import { useInsights } from '@/hooks/useInsights';
import { useUserOrganization } from '@/hooks/useUserOrganization';
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data: orgId } = useUserOrganization();
  const { data: dashboardData, isLoading } = useDashboardStats();
  const { upcomingCases, upcomingContracts } = useInsights(7);
  const { data: widgets = { show_upcoming_cases: true, show_upcoming_contracts: true } } = useDashboardPrefs(orgId || "");

  const stats = [
    {
      title: 'Total Cases',
      value: dashboardData?.totalCases?.toString() || '0',
      change: `${dashboardData?.activeCases || 0} active`,
      icon: Briefcase,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Upcoming Events',
      value: dashboardData?.upcomingEvents?.toString() || '0',
      change: 'Next 7 days',
      icon: CalIcon,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Documents',
      value: dashboardData?.totalDocuments?.toString() || '0',
      change: 'Total uploaded',
      icon: FileText,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Total Clients',
      value: dashboardData?.totalClients?.toString() || '0',
      change: 'In your organization',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  const recentCases = dashboardData?.recentCases || [];
  const upcomingEvents = dashboardData?.upcomingCalendarEvents || [];

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open': 
      case 'active': 
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': 
      case 'review': 
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'closed': 
      case 'completed': 
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'draft': 
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default: 
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="px-6 py-8 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <p className="text-lg text-muted-foreground">Welcome back! Here's what's happening with your legal practice.</p>
        </div>
        <Button onClick={() => navigate('/cases/create')} size="lg" className="shadow-md">
          <Plus className="h-5 w-5 mr-2" /> New Case
        </Button>
      </div>

      {/* Actionable Insights */}
      {widgets.show_upcoming_cases && upcomingCases.length > 0 && (
        <Card className="border-l-4 border-l-orange-500 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-orange-800 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Upcoming Hearings ({upcomingCases.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingCases.slice(0, 3).map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div>
                    <p className="font-medium text-gray-900">{c.title}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(c.next_hearing_date || Date.now()).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/cases/${c.id}`)}>
                    View Case
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {widgets.show_upcoming_contracts && upcomingContracts.length > 0 && (
        <Card className="border-l-4 border-l-red-500 bg-red-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Contracts Expiring Soon ({upcomingContracts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingContracts.slice(0, 3).map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div>
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <p className="text-sm text-gray-600">
                      Expires {new Date(c._insight_date || Date.now()).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate(`/contracts/${c.id}`)}>
                    View Contract
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-lg transition-all duration-200 border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> {stat.change}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Briefcase className="h-6 w-6 text-primary" /> 
              Recent Cases
            </CardTitle>
            <CardDescription>Your most recently updated cases</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentCases.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No cases yet</p>
                <Button onClick={() => navigate('/cases/create')}>Create Your First Case</Button>
              </div>
            ) : (
              <>
                {recentCases.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 space-y-2">
                      <h4 className="font-medium text-foreground hover:text-primary cursor-pointer" 
                          onClick={() => navigate(`/cases/${item.id}`)}>
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(item.status || 'pending')}>
                          {item.status || 'Pending'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground gap-1">
                      <Clock className="h-3 w-3" /> 
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="w-full" onClick={() => navigate('/cases')}>
                  View All Cases
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalIcon className="h-6 w-6 text-primary" /> 
              Upcoming Events
            </CardTitle>
            <CardDescription>Your schedule for the next few days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CalIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No upcoming events</p>
                <Button onClick={() => navigate('/calendar')}>Schedule an Event</Button>
              </div>
            ) : (
              <>
                {upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between p-4 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground">{ev.title}</h4>
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {new Date(ev.start_date || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • {new Date(ev.start_date || Date.now()).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary">{ev.event_type}</Badge>
                  </div>
                ))}
                <Button variant="outline" className="w-full" onClick={() => navigate('/calendar')}>
                  View Full Calendar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Quick Actions</CardTitle>
          <CardDescription>Frequently used actions for efficient workflow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Button 
              variant="outline" 
              className="flex flex-col h-24 justify-center items-center gap-3 hover:shadow-md transition-all" 
              onClick={() => navigate('/cases/create')}
            >
              <Briefcase className="h-6 w-6" />
              <span className="text-sm font-medium">New Case</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-24 justify-center items-center gap-3 hover:shadow-md transition-all"
              onClick={() => navigate('/calendar')}
            >
              <CalIcon className="h-6 w-6" />
              <span className="text-sm font-medium">Schedule Event</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-24 justify-center items-center gap-3 hover:shadow-md transition-all"
              onClick={() => navigate('/documents/upload')}
            >
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">Upload Document</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-24 justify-center items-center gap-3 hover:shadow-md transition-all"
              onClick={() => navigate('/contracts/create')}
            >
              <FileCheck className="h-6 w-6" />
              <span className="text-sm font-medium">New Contract</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-24 justify-center items-center gap-3 hover:shadow-md transition-all"
              onClick={() => navigate('/clients/create')}
            >
              <Users className="h-6 w-6" />
              <span className="text-sm font-medium">Add Client</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
