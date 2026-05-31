import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, AlertTriangle, Clock, Cpu, Database, Eye, Mail, Server } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import {
  useSystemHealth,
  useSystemJobs,
  type SystemHealth,
  type SystemJob,
} from '@/hooks/useSystemHealth';

// ── small formatters ─────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '--';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '--';
  const s = Math.max(0, Math.round(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatPercent(rate: number | null | undefined): string {
  if (rate == null) return '--';
  return `${(rate * 100).toFixed(2)}%`;
}

// ── status-card primitive (mirrors OverviewTab card shape) ───────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone = 'default',
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const valueClass =
    tone === 'bad'
      ? 'text-destructive'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-500'
        : tone === 'good'
          ? 'text-emerald-600 dark:text-emerald-500'
          : '';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
        {subtitle != null && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function jobStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'failed':
      return 'destructive';
    case 'completed':
      return 'secondary';
    case 'running':
      return 'default';
    default:
      return 'outline';
  }
}

// ── derived tones ────────────────────────────────────────────────────────────

function dbTone(health: SystemHealth | undefined): 'good' | 'warn' | 'bad' | 'default' {
  if (!health) return 'default';
  if (!health.db.ok) return 'bad';
  const ms = health.db.latency_ms ?? 0;
  if (ms > 500) return 'warn';
  return 'good';
}

function bounceTone(rate: number | null | undefined): 'good' | 'warn' | 'bad' | 'default' {
  if (rate == null) return 'default';
  if (rate >= 0.05) return 'bad';
  if (rate >= 0.02) return 'warn';
  return 'good';
}

export function SystemHealthTab() {
  // react-query's refetchInterval (set in the hooks) drives the ~15s
  // auto-refresh and tears the timer down on unmount — no manual setInterval
  // to leak.
  const { data: health, isLoading, isError } = useSystemHealth();
  const { data: jobs = [] } = useSystemJobs();

  if (isLoading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !health) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Unable to load system health.
        </CardContent>
      </Card>
    );
  }

  const bg = health.background_jobs;
  const email = health.email;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Health</h2>
          <p className="text-muted-foreground">Live platform status — auto-refreshes every 15s.</p>
        </div>
        <span className="text-xs text-muted-foreground">
          Updated {formatDistanceToNow(new Date(health.generated_at), { addSuffix: true })}
        </span>
      </div>

      {/* ── top status cards ── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Database"
          icon={<Database className="h-4 w-4" />}
          tone={dbTone(health)}
          value={health.db.ok ? `${health.db.latency_ms ?? '--'} ms` : 'Down'}
          subtitle={health.db.ok ? 'select 1 latency' : 'No connection'}
        />

        <StatCard
          title="Background Jobs"
          icon={<Activity className="h-4 w-4" />}
          tone={bg ? (bg.failed > 0 ? 'warn' : 'good') : 'default'}
          value={bg ? bg.queued + bg.running : '--'}
          subtitle={
            bg
              ? `${bg.running} running · ${bg.queued} queued · ${bg.failed} failed (24h)`
              : 'agent_jobs unavailable'
          }
        />

        <StatCard
          title="Email Bounce Rate"
          icon={<Mail className="h-4 w-4" />}
          tone={bounceTone(email?.bounce_rate)}
          value={email ? formatPercent(email.bounce_rate) : '--'}
          subtitle={
            email
              ? `${email.bounced} bounced of ${email.total_24h} (24h)`
              : 'email_delivery_log unavailable'
          }
        />

        <StatCard
          title="Active Impersonations"
          icon={<Eye className="h-4 w-4" />}
          tone={
            health.impersonation ? (health.impersonation.active > 0 ? 'warn' : 'good') : 'default'
          }
          value={health.impersonation ? health.impersonation.active : '--'}
          subtitle={health.impersonation ? 'open sessions' : 'impersonation_sessions unavailable'}
        />
      </div>

      {/* ── second row ── */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Uptime"
          icon={<Clock className="h-4 w-4" />}
          value={formatDuration(health.process.uptime_seconds)}
          subtitle={`NODE_ENV: ${health.process.node_env}`}
        />

        <StatCard
          title="Memory (RSS)"
          icon={<Cpu className="h-4 w-4" />}
          value={formatBytes(health.process.memory_rss_bytes)}
          subtitle={`heap used ${formatBytes(health.process.memory_heap_used_bytes)}`}
        />

        <StatCard
          title="Payments (24h)"
          icon={<Server className="h-4 w-4" />}
          value={health.payments ? health.payments.total_24h : '--'}
          subtitle={
            health.payments
              ? Object.entries(health.payments.by_status)
                  .map(([s, c]) => `${s}: ${c}`)
                  .join(' · ') || 'no transactions'
              : 'payment_transactions unavailable'
          }
        />

        <StatCard
          title="Last Webhook"
          icon={<Server className="h-4 w-4" />}
          value={
            health.webhooks?.last_received_at
              ? formatDistanceToNow(new Date(health.webhooks.last_received_at), {
                  addSuffix: true,
                })
              : health.webhooks
                ? 'none'
                : '--'
          }
          subtitle={
            health.webhooks
              ? `${health.webhooks.received_24h} in 24h (${health.webhooks.provider})`
              : 'no webhook source'
          }
        />
      </div>

      {/* ── leads / oldest queued (secondary detail) ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Job Queue Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bg ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed (24h)</span>
                  <span className="font-medium">{bg.completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed (24h)</span>
                  <span className="font-medium">{bg.failed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Oldest queued</span>
                  <span className="font-medium">
                    {bg.oldest_queued_age_seconds == null
                      ? '--'
                      : formatDuration(bg.oldest_queued_age_seconds)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">agent_jobs unavailable</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Leads &amp; Email (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Leads (total)</span>
                <span className="font-medium">{health.leads ? health.leads.total : '--'}</span>
              </div>
              {health.leads &&
                Object.entries(health.leads.by_status).map(([s, c]) => (
                  <div key={s} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{s}</span>
                    <span className="font-medium">{c}</span>
                  </div>
                ))}
              <div className="flex justify-between pt-1 border-t mt-1">
                <span className="text-muted-foreground">Emails sent/delivered</span>
                <span className="font-medium">
                  {email ? `${email.sent}/${email.delivered}` : '--'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── recent jobs table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Background Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">No recent jobs.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">Created</th>
                    <th className="py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job: SystemJob) => (
                    <tr key={job.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 pr-4">
                        <Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge>
                      </td>
                      <td className="py-2 pr-4">{job.type ?? '--'}</td>
                      <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                      </td>
                      <td className="py-2 max-w-[24rem] truncate text-destructive">
                        {job.error ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
