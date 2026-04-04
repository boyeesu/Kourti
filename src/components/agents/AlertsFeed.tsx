import { useAgentAlerts, useUpdateAlert, type AgentAlert } from '@/hooks/useAgentAlerts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const severityConfig = {
  critical: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

const entityLinks: Record<string, string> = {
  case: '/cases',
  contract: '/contracts',
  document: '/documents',
};

function AlertCard({ alert }: { alert: AgentAlert }) {
  const updateAlert = useUpdateAlert();
  const config = severityConfig[alert.severity] ?? severityConfig.info;
  const Icon = config.icon;

  return (
    <Card className={`${config.border} border`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 rounded-full p-1.5 ${config.bg}`}>
            <Icon className={`h-4 w-4 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{alert.title}</p>
                {alert.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{alert.description}</p>
                )}
              </div>
              <Badge variant="outline" className="shrink-0 text-xs">
                {alert.severity}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
              </span>
              {alert.entity_type && alert.entity_id && entityLinks[alert.entity_type] && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" asChild>
                  <Link to={`${entityLinks[alert.entity_type]}/${alert.entity_id}`}>
                    <Eye className="h-3 w-3 mr-1" /> View
                  </Link>
                </Button>
              )}
              {alert.status === 'active' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() =>
                      updateAlert.mutate({ alertId: alert.id, status: 'acknowledged' })
                    }
                  >
                    <Check className="h-3 w-3 mr-1" /> Acknowledge
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => updateAlert.mutate({ alertId: alert.id, status: 'dismissed' })}
                  >
                    <X className="h-3 w-3 mr-1" /> Dismiss
                  </Button>
                </>
              )}
              {alert.status === 'acknowledged' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => updateAlert.mutate({ alertId: alert.id, status: 'resolved' })}
                >
                  <Check className="h-3 w-3 mr-1" /> Resolve
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AlertsFeed() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>('active');
  const [severityFilter, setSeverityFilter] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAgentAlerts({
    status: statusFilter,
    severity: severityFilter,
    page,
  });

  const alerts = data?.data ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex gap-3">
          <Badge variant="destructive" className="gap-1">
            {summary.critical} critical
          </Badge>
          <Badge variant="secondary" className="gap-1">
            {summary.warning} warning
          </Badge>
          <Badge variant="outline" className="gap-1">
            {summary.info} info
          </Badge>
        </div>
      )}

      <div className="flex gap-2">
        <Select
          value={statusFilter ?? 'all'}
          onValueChange={(v) => {
            setStatusFilter(v === 'all' ? undefined : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={severityFilter ?? 'all'}
          onValueChange={(v) => {
            setSeverityFilter(v === 'all' ? undefined : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading alerts...</p>
      ) : alerts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No alerts found. Enable monitors to start receiving alerts.
        </p>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pagination.totalPages}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
