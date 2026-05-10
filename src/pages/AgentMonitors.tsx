import { useAgentMonitors, useUpdateMonitor, useTriggerMonitor } from '@/hooks/useAgentMonitors';
import { AlertsFeed } from '@/components/agents/AlertsFeed';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileCheck, Gavel, FileText, Play, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { AgentNav } from '@/components/agents/AgentNav';

const monitorMeta: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  contract_expiration: {
    label: 'Contract Expiration',
    description: 'Alerts when contracts are approaching their end date',
    icon: <FileCheck className="h-5 w-5" />,
  },
  case_deadline: {
    label: 'Case Deadlines',
    description: 'Watches for upcoming hearings and overdue case activities',
    icon: <Gavel className="h-5 w-5" />,
  },
  document_change: {
    label: 'Document Changes',
    description: 'Detects new document uploads and suggests review',
    icon: <FileText className="h-5 w-5" />,
  },
};

export default function AgentMonitors() {
  const { data, isLoading } = useAgentMonitors();
  const updateMonitor = useUpdateMonitor();
  const triggerMonitor = useTriggerMonitor();

  const monitors = data?.data ?? [];

  return (
    <div className="space-y-4">
      <AgentNav />

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="monitors">Configure Monitors</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="mt-4">
          <AlertsFeed />
        </TabsContent>

        <TabsContent value="monitors" className="mt-4 space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading monitors...</p>
          ) : (
            monitors.map((monitor) => {
              const meta = monitorMeta[monitor.monitor_type];
              if (!meta) return null;

              return (
                <Card key={monitor.monitor_type}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-muted-foreground">{meta.icon}</div>
                        <div>
                          <CardTitle className="text-base">{meta.label}</CardTitle>
                          <CardDescription>{meta.description}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {monitor.enabled && monitor.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => triggerMonitor.mutate(monitor.monitor_type)}
                            disabled={triggerMonitor.isPending}
                          >
                            {triggerMonitor.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3" />
                            )}
                            <span className="ml-1">Run Now</span>
                          </Button>
                        )}
                        <Switch
                          checked={monitor.enabled}
                          onCheckedChange={(enabled) =>
                            updateMonitor.mutate({ type: monitor.monitor_type, enabled })
                          }
                        />
                      </div>
                    </div>
                  </CardHeader>
                  {monitor.enabled && (
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          Runs every{' '}
                          {monitor.run_interval_minutes < 60
                            ? `${monitor.run_interval_minutes} min`
                            : `${Math.round(monitor.run_interval_minutes / 60)}h`}
                        </span>
                        {monitor.last_run_at && (
                          <span>
                            Last run:{' '}
                            {formatDistanceToNow(new Date(monitor.last_run_at), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                        {monitor.next_run_at && (
                          <Badge variant="outline" className="text-xs">
                            Next:{' '}
                            {formatDistanceToNow(new Date(monitor.next_run_at), {
                              addSuffix: true,
                            })}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
