import { useState } from 'react';
import { format } from 'date-fns';
import {
  Activity,
  Bot,
  Building2,
  Calendar,
  FileText,
  Folder,
  HardDrive,
  Handshake,
  Receipt,
  ScrollText,
  Search,
  Table2,
  Users,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

import { useOrgUsage, useUsageLeaderboards, type OrgUsageCounts } from '@/hooks/useAdminUsage';

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

function fmtNumber(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString();
}

function fmtBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  try {
    return format(new Date(value), 'MMM dd, yyyy HH:mm');
  } catch {
    return value;
  }
}

const COUNT_CARDS: Array<{
  key: keyof OrgUsageCounts;
  label: string;
  icon: typeof FileText;
}> = [
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'cases', label: 'Cases', icon: Folder },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'contracts', label: 'Contracts', icon: ScrollText },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'calendar_events', label: 'Calendar Events', icon: Calendar },
  { key: 'agent_jobs', label: 'Agent Jobs', icon: Bot },
  { key: 'negotiations', label: 'Negotiations', icon: Handshake },
  { key: 'tabular_reviews', label: 'Tabular Reviews', icon: Table2 },
];

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-muted p-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgCockpit({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useOrgUsage(orgId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Building2 className="mx-auto mb-4 h-12 w-12" />
        <p>Could not load usage for that organization.</p>
      </div>
    );
  }

  const { organization, members, subscription, counts, features, storage } = data;

  return (
    <div className="space-y-6">
      {/* Header / members / subscription */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              {organization.name ?? 'Organization'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={organization.is_active === false ? 'destructive' : 'secondary'}>
                {organization.status ?? (organization.is_active === false ? 'inactive' : 'active')}
              </Badge>
            </div>
            <div className="font-mono text-xs text-muted-foreground">{organization.id}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Members
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="text-2xl font-bold">{fmtNumber(members.total)}</div>
            <div className="text-muted-foreground">
              {fmtNumber(members.active)} active · {fmtNumber(members.disabled)} disabled
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              Last active: {fmtDate(members.last_active)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {subscription ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                    {subscription.status ?? 'unknown'}
                  </Badge>
                </div>
                <div className="font-medium">
                  {subscription.plan_display_name ?? subscription.plan_name ?? '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {subscription.billing_interval ?? '—'}
                  {subscription.current_period_end
                    ? ` · renews ${fmtDate(subscription.current_period_end)}`
                    : ''}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground">No subscription</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature usage flags */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={features.has_agents ? 'default' : 'outline'}>
          <Bot className="mr-1 h-3 w-3" /> Agents {features.has_agents ? 'in use' : 'unused'}
        </Badge>
        <Badge variant={features.has_negotiations ? 'default' : 'outline'}>
          <Handshake className="mr-1 h-3 w-3" /> Negotiations{' '}
          {features.has_negotiations ? 'in use' : 'unused'}
        </Badge>
        <Badge variant={features.has_tabular_reviews ? 'default' : 'outline'}>
          <Table2 className="mr-1 h-3 w-3" /> Tabular Review{' '}
          {features.has_tabular_reviews ? 'in use' : 'unused'}
        </Badge>
      </div>

      {/* Counts grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {COUNT_CARDS.map((c) => (
          <MetricCard key={c.key} icon={c.icon} label={c.label} value={fmtNumber(counts[c.key])} />
        ))}
        <MetricCard
          icon={HardDrive}
          label="Document Storage"
          value={fmtBytes(storage.documents_bytes)}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        “—” means the metric could not be reliably scoped for this org and was intentionally omitted
        rather than shown as a wrong number.
      </p>
    </div>
  );
}

function Leaderboards() {
  const { data, isLoading } = useUsageLeaderboards();

  const renderList = (
    title: string,
    rows: {
      organization_id: string;
      name: string | null;
      members: number;
      documents: number;
      subscription_status: string | null;
    }[],
    metric: 'members' | 'documents'
  ) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div
                key={r.organization_id}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                  <span className="truncate font-medium">{r.name ?? r.organization_id}</span>
                  {r.subscription_status && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {r.subscription_status}
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 font-mono">
                  {fmtNumber(metric === 'members' ? r.members : r.documents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {renderList('Top orgs by members', data?.top_by_members ?? [], 'members')}
      {renderList('Top orgs by documents', data?.top_by_documents ?? [], 'documents')}
    </div>
  );
}

export function OrgUsageTab() {
  const [input, setInput] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);

  const trimmed = input.trim();
  const isValid = UUID_RE.test(trimmed);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Usage & Health</h2>
        <p className="text-muted-foreground">
          Per-organization usage cockpit and platform-wide leaderboards.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Enter an organization ID (UUID)…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isValid) setOrgId(trimmed);
                }}
                className="pl-10 font-mono"
              />
            </div>
            <Button disabled={!isValid} onClick={() => setOrgId(trimmed)}>
              Load cockpit
            </Button>
          </div>
          {trimmed.length > 0 && !isValid && (
            <p className="mt-2 text-xs text-destructive">That doesn’t look like a valid UUID.</p>
          )}
        </CardHeader>
        <CardContent>
          {orgId ? (
            <OrgCockpit orgId={orgId} />
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Building2 className="mx-auto mb-4 h-12 w-12" />
              <p>Enter an organization ID above to drill into its usage and health.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Leaderboards />
    </div>
  );
}
