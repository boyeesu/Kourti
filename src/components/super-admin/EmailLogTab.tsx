import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Search, Send } from 'lucide-react';
import { format } from 'date-fns';
import {
  useEmailLog,
  useEmailStats,
  useResendEmail,
  type EmailDeliveryStatus,
  type EmailLogFilters,
  type EmailLogRow,
  type EmailProvider,
} from '@/hooks/useEmailLog';

const STATUS_VARIANT: Record<
  EmailDeliveryStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  queued: 'secondary',
  sent: 'default',
  delivered: 'default',
  bounced: 'destructive',
  complained: 'destructive',
  failed: 'destructive',
};

function StatusBadge({ status }: { status: EmailDeliveryStatus }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{status}</Badge>;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

export function EmailLogTab() {
  const [filters, setFilters] = useState<EmailLogFilters>({ limit: 100, offset: 0 });
  const [emailSearch, setEmailSearch] = useState('');

  const { data: logData, isLoading } = useEmailLog(filters);
  const { data: stats } = useEmailStats();
  const resend = useResendEmail();

  const rows = logData?.rows ?? [];

  const applyEmailSearch = () => {
    setFilters((f) => ({ ...f, to_email: emailSearch.trim() || undefined, offset: 0 }));
  };

  const handleResend = (row: EmailLogRow) => {
    const reason = window.prompt(`Reason for resending to ${row.to_email}?`);
    if (!reason || !reason.trim()) return;
    resend.mutate({ id: row.id, reason: reason.trim() });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Email Deliverability</h2>
        <p className="text-muted-foreground">
          Transactional (Resend) sends and Brevo contact-sync, with delivery status and errors
        </p>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <StatCard label="Total (30d)" value={stats?.total ?? '—'} />
        <StatCard label="Sent" value={stats?.by_status?.sent ?? '—'} />
        <StatCard label="Delivered" value={stats?.by_status?.delivered ?? '—'} />
        <StatCard label="Bounced" value={stats?.by_status?.bounced ?? '—'} />
        <StatCard label="Failed" value={stats?.by_status?.failed ?? '—'} />
        <StatCard label="Bounce Rate" value={stats ? `${stats.bounce_rate}%` : '—'} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by recipient email..."
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applyEmailSearch()}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.provider ?? 'all'}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    provider:
                      e.target.value === 'all' ? undefined : (e.target.value as EmailProvider),
                    offset: 0,
                  }))
                }
                className="rounded-md border bg-background px-3 py-2"
              >
                <option value="all">All Providers</option>
                <option value="resend">Resend</option>
                <option value="brevo">Brevo</option>
              </select>
              <select
                value={filters.status ?? 'all'}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    status:
                      e.target.value === 'all'
                        ? undefined
                        : (e.target.value as EmailDeliveryStatus),
                    offset: 0,
                  }))
                }
                className="rounded-md border bg-background px-3 py-2"
              >
                <option value="all">All Statuses</option>
                <option value="queued">Queued</option>
                <option value="sent">Sent</option>
                <option value="delivered">Delivered</option>
                <option value="bounced">Bounced</option>
                <option value="complained">Complained</option>
                <option value="failed">Failed</option>
              </select>
              <Input
                type="date"
                value={filters.start_date ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, start_date: e.target.value || undefined, offset: 0 }))
                }
                className="w-auto"
              />
              <Input
                type="date"
                value={filters.end_date ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, end_date: e.target.value || undefined, offset: 0 }))
                }
                className="w-auto"
              />
              <Button variant="outline" onClick={applyEmailSearch}>
                <Search className="mr-2 h-4 w-4" />
                Apply
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No emails found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">To</th>
                    <th className="px-3 py-2 font-medium">Subject</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Error</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-muted/50">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {format(new Date(row.created_at), 'MMM dd, HH:mm')}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{row.provider}</Badge>
                      </td>
                      <td className="px-3 py-2">{row.to_email}</td>
                      <td className="max-w-[18rem] truncate px-3 py-2">
                        {row.subject || (
                          <span className="text-muted-foreground">{row.template || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="max-w-[16rem] truncate px-3 py-2 text-destructive">
                        {row.error || ''}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={resend.isPending || row.provider !== 'resend'}
                          title={
                            row.provider !== 'resend'
                              ? 'Resend only supported for Resend emails'
                              : 'Resend this email'
                          }
                          onClick={() => handleResend(row)}
                        >
                          {resend.isPending ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {filters.offset! + 1}–{filters.offset! + rows.length}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.offset ?? 0) === 0}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      offset: Math.max(0, (f.offset ?? 0) - (f.limit ?? 100)),
                    }))
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rows.length < (filters.limit ?? 100)}
                  onClick={() =>
                    setFilters((f) => ({ ...f, offset: (f.offset ?? 0) + (f.limit ?? 100) }))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
