import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClipboardList, Download, FileText, Mail, Search } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  downloadLeadsCsv,
  useMarketingLeads,
  useMarketingLeadStats,
  useUpdateLeadStatus,
  type LeadStatus,
  type LeadType,
  type MarketingLeadFilters,
  type MarketingLeadRow,
} from '@/hooks/useMarketingLeads';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

const PAGE_SIZE = 50;

const TYPE_LABEL: Record<LeadType, string> = {
  assessment: 'Assessment',
  report: 'Q1 Report',
  contact: 'Contact',
};

const TYPE_VARIANT: Record<LeadType, 'default' | 'secondary' | 'outline'> = {
  assessment: 'default',
  report: 'secondary',
  contact: 'outline',
};

const STATUS_VARIANT: Record<LeadStatus, 'default' | 'secondary' | 'outline'> = {
  new: 'default',
  in_progress: 'secondary',
  resolved: 'outline',
};

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Detail dialog — full lead info plus assessment scores/answers when present. */
function LeadDetailDialog({
  lead,
  onClose,
}: {
  lead: MarketingLeadRow | null;
  onClose: () => void;
}) {
  if (!lead) return null;
  const meta = lead.metadata ?? {};
  const dimensionScores = meta.dimensionScores ?? {};
  const answers = meta.answers ?? {};

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lead.first_name} {lead.last_name}
          </DialogTitle>
          <DialogDescription>
            {TYPE_LABEL[lead.lead_type]} lead ·{' '}
            {format(new Date(lead.created_at), 'MMM dd, yyyy HH:mm')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Email</div>
            <div className="break-all">{lead.email}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Company</div>
            <div>{lead.company || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Phone</div>
            <div>{lead.phone || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Firm Size</div>
            <div>{lead.firm_size || '—'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Interest</div>
            <div>{lead.interest}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Marketing Consent</div>
            <div>{lead.marketing_consent ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <div className="text-sm">
          <div className="text-xs text-muted-foreground">Message</div>
          <div className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3">{lead.message}</div>
        </div>

        {lead.lead_type === 'assessment' && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <Badge>{meta.tier ?? 'Unknown tier'}</Badge>
              {meta.totalScore !== undefined && meta.maxScore !== undefined && (
                <span className="font-semibold">
                  Score: {meta.totalScore}/{meta.maxScore}
                </span>
              )}
            </div>

            {Object.keys(dimensionScores).length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dimension Scores
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(dimensionScores).map(([dim, score]) => (
                    <div key={dim} className="flex justify-between rounded-md border px-3 py-1.5">
                      <span className="capitalize">{dim.replace(/[-_]/g, ' ')}</span>
                      <span className="font-medium">{score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(answers).length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Answers
                </div>
                <div className="space-y-1">
                  {Object.entries(answers).map(([question, answer]) => (
                    <div
                      key={question}
                      className="flex justify-between gap-4 rounded-md border px-3 py-1.5"
                    >
                      <span className="text-muted-foreground">{question}</span>
                      <span className="font-medium">{String(answer)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MarketingLeadsTab() {
  const [filters, setFilters] = useState<MarketingLeadFilters>({ limit: PAGE_SIZE, offset: 0 });
  const [search, setSearch] = useState('');
  const [detailLead, setDetailLead] = useState<MarketingLeadRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useMarketingLeads(filters);
  const { data: stats } = useMarketingLeadStats();
  const updateStatus = useUpdateLeadStatus();
  const { has } = useAdminCapabilities();
  const canTriage = has('content.manage');

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const applySearch = () => {
    setFilters((f) => ({ ...f, q: search.trim() || undefined, offset: 0 }));
  };

  const setType = (type?: LeadType) => {
    setFilters((f) => ({ ...f, type, offset: 0 }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadLeadsCsv(filters);
    } catch (error) {
      toast.error('Export failed', {
        description: error instanceof Error ? error.message : 'Could not export leads',
      });
    } finally {
      setExporting(false);
    }
  };

  const typeTabs: {
    label: string;
    value?: LeadType;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { label: 'All', value: undefined, icon: Mail },
    { label: 'Assessments', value: 'assessment', icon: ClipboardList },
    { label: 'Q1 Report Downloads', value: 'report', icon: FileText },
    { label: 'Contact', value: 'contact', icon: Mail },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Marketing Leads</h2>
          <p className="text-muted-foreground">
            Maturity assessment submissions, Q1 report download emails, and contact enquiries from
            the marketing site
          </p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          <Download className="mr-2 h-4 w-4" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      {/* Stats header */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <StatCard label="Total Leads" value={stats?.overall.total ?? '—'} />
        <StatCard label="Last 30 Days" value={stats?.overall.last_30d ?? '—'} />
        <StatCard
          label="Assessments"
          value={stats?.by_type.assessment.total ?? '—'}
          hint={stats ? `${stats.by_type.assessment.new} new` : undefined}
        />
        <StatCard
          label="Report Downloads"
          value={stats?.by_type.report.total ?? '—'}
          hint={stats ? `${stats.by_type.report.new} new` : undefined}
        />
        <StatCard label="Marketing Opt-ins" value={stats?.overall.consented ?? '—'} />
      </div>

      <Card>
        <CardHeader className="space-y-4">
          {/* Type tabs */}
          <div className="flex flex-wrap gap-2">
            {typeTabs.map((tab) => {
              const Icon = tab.icon;
              const active = filters.type === tab.value;
              return (
                <Button
                  key={tab.label}
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => setType(tab.value)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {tab.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by email, name, or company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filters.status ?? 'all'}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    status: e.target.value === 'all' ? undefined : (e.target.value as LeadStatus),
                    offset: 0,
                  }))
                }
                className="rounded-md border bg-background px-3 py-2"
              >
                <option value="all">All Statuses</option>
                <option value="new">New</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
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
              <Button variant="outline" onClick={applySearch}>
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
            <div className="py-12 text-center text-muted-foreground">No leads found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                    <th className="px-3 py-2 font-medium">Consent</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const meta = row.metadata ?? {};
                    return (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b hover:bg-muted/50"
                        onClick={() => setDetailLead(row)}
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {format(new Date(row.created_at), 'MMM dd, HH:mm')}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={TYPE_VARIANT[row.lead_type]}>
                            {TYPE_LABEL[row.lead_type]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.first_name} {row.last_name}
                        </td>
                        <td className="px-3 py-2">{row.email}</td>
                        <td className="max-w-[12rem] truncate px-3 py-2">{row.company || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {row.lead_type === 'assessment' && meta.totalScore !== undefined ? (
                            <span>
                              {meta.tier ? `${meta.tier} · ` : ''}
                              {meta.totalScore}/{meta.maxScore}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.marketing_consent ? (
                            <Badge variant="outline">opted in</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {canTriage ? (
                            <select
                              value={row.status}
                              disabled={updateStatus.isPending}
                              onChange={(e) =>
                                updateStatus.mutate({
                                  id: row.id,
                                  status: e.target.value as LeadStatus,
                                })
                              }
                              className="rounded-md border bg-background px-2 py-1 text-xs"
                            >
                              <option value="new">new</option>
                              <option value="in_progress">in progress</option>
                              <option value="resolved">resolved</option>
                            </select>
                          ) : (
                            <Badge variant={STATUS_VARIANT[row.status]}>
                              {row.status.replace('_', ' ')}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && rows.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {(filters.offset ?? 0) + 1}–{(filters.offset ?? 0) + rows.length} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.offset ?? 0) === 0}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      offset: Math.max(0, (f.offset ?? 0) - (f.limit ?? PAGE_SIZE)),
                    }))
                  }
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.offset ?? 0) + rows.length >= total}
                  onClick={() =>
                    setFilters((f) => ({ ...f, offset: (f.offset ?? 0) + (f.limit ?? PAGE_SIZE) }))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LeadDetailDialog lead={detailLead} onClose={() => setDetailLead(null)} />
    </div>
  );
}
