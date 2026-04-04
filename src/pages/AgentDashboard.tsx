import { useAgentDashboard, useAgentAuditLog } from '@/hooks/useAgentApprovals';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, AlertTriangle, Shield, Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

export default function AgentDashboard() {
  const { data: dashData, isLoading } = useAgentDashboard();
  const { data: auditData } = useAgentAuditLog();

  const dash = dashData?.data;
  const auditEntries = auditData?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of agent activity across your organization
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Cpu className="h-4 w-4" /> Jobs Today
            </div>
            <div className="text-3xl font-bold mt-1">{dash?.jobs.today ?? 0}</div>
            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
              {(dash?.jobs.running ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> {dash?.jobs.running} running
                </span>
              )}
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" /> {dash?.jobs.completed ?? 0}{' '}
                completed
              </span>
              {(dash?.jobs.failed ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-red-500" /> {dash?.jobs.failed} failed
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" /> Active Alerts
            </div>
            <div className="text-3xl font-bold mt-1">{dash?.alerts.active ?? 0}</div>
            {(dash?.alerts.critical ?? 0) > 0 && (
              <Badge variant="destructive" className="mt-1 text-xs">
                {dash?.alerts.critical} critical
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" /> Pending Approvals
            </div>
            <div className="text-3xl font-bold mt-1">{dash?.approvals.pending ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Zap className="h-4 w-4" /> Tokens Today
            </div>
            <div className="text-3xl font-bold mt-1">
              {(dash?.tokensUsedToday ?? 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {auditEntries.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 py-1.5 text-sm border-b last:border-0"
                >
                  <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[70px]">
                    {format(new Date(entry.created_at), 'HH:mm:ss')}
                  </span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {entry.action}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">
                    {entry.details
                      ? Object.entries(entry.details)
                          .filter(([k]) => !['prompt', 'content', 'rawAnalysis'].includes(k))
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`
                          )
                          .join(' | ')
                          .slice(0, 120)
                      : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
