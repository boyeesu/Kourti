import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Download, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  useAuditProActions,
  useAuditProActionTypes,
  useAuditProAction,
  downloadAuditCsv,
  type AuditProFilters,
} from '@/hooks/useAuditPro';

const PAGE_SIZE = 100;

/** Pretty-print a JSON snapshot for the diff panes. */
function jsonString(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Highlighted side-by-side JSON diff. We compare the JSON-serialised lines and
 * flag any line that differs between before/after so reviewers can eyeball what
 * changed without a heavyweight diff lib.
 */
function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const beforeLines = jsonString(before).split('\n');
  const afterLines = jsonString(after).split('\n');
  const max = Math.max(beforeLines.length, afterLines.length);

  const rows = useMemo(() => {
    const out: { b: string; a: string; changed: boolean }[] = [];
    for (let i = 0; i < max; i++) {
      const b = beforeLines[i] ?? '';
      const a = afterLines[i] ?? '';
      out.push({ b, a, changed: b !== a });
    }
    return out;
  }, [beforeLines, afterLines, max]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Before</div>
        <pre className="overflow-auto rounded bg-muted p-2 text-xs leading-relaxed">
          {rows.map((r, i) => (
            <div key={i} className={r.changed && r.b ? 'bg-red-500/15 -mx-2 px-2 rounded-sm' : ''}>
              {r.b || ' '}
            </div>
          ))}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">After</div>
        <pre className="overflow-auto rounded bg-muted p-2 text-xs leading-relaxed">
          {rows.map((r, i) => (
            <div
              key={i}
              className={r.changed && r.a ? 'bg-green-500/15 -mx-2 px-2 rounded-sm' : ''}
            >
              {r.a || ' '}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

/** Modal showing the full record + before/after diff for one action. */
function ActionDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useAuditProAction(id);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{data?.action_type ?? 'Audit action'}</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.target_type}${data.target_id ? ` • ${data.target_id}` : ''}`
              : 'Loading action detail…'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Admin</span>
                <div className="font-medium">{data.admin_email ?? data.admin_user_id}</div>
              </div>
              <div>
                <span className="text-muted-foreground">When</span>
                <div className="font-medium">
                  {format(new Date(data.created_at), 'yyyy-MM-dd HH:mm:ss')}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">IP address</span>
                <div className="font-medium">{data.ip_address ?? '—'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Reason</span>
                <div className="font-medium">{data.reason ?? '—'}</div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">Before / After</div>
              <JsonDiff before={data.before_state} after={data.after_state} />
            </div>

            {data.details && Object.keys(data.details).length > 0 && (
              <div>
                <div className="mb-1 text-sm font-semibold">Details</div>
                <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                  {jsonString(data.details)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AuditLogProTab() {
  // Draft filter inputs (committed to `filters` on Apply / Enter).
  const [draft, setDraft] = useState<AuditProFilters>({});
  const [filters, setFilters] = useState<AuditProFilters>({});
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { data: actionTypes = [] } = useAuditProActionTypes();
  const { data, isLoading, isError } = useAuditProActions(filters, {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = () => {
    setPage(0);
    setFilters(draft);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAuditCsv(filters);
    } catch (err) {
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'Could not download CSV',
      });
    } finally {
      setDownloading(false);
    }
  };

  const updateDraft = (patch: Partial<AuditProFilters>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Log (Advanced)</h2>
          <p className="text-muted-foreground">
            Filter, inspect before/after diffs, and export the platform admin trail
          </p>
        </div>
        <Button onClick={handleDownload} variant="outline" disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search action type, target type, or reason…"
                value={draft.q ?? ''}
                onChange={(e) => updateDraft({ q: e.target.value || undefined })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <select
                value={filters.action_type ?? draft.action_type ?? 'all'}
                onChange={(e) =>
                  updateDraft({
                    action_type: e.target.value === 'all' ? undefined : e.target.value,
                  })
                }
                className="rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="all">All action types</option>
                {actionTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <Input
                placeholder="Target type"
                value={draft.target_type ?? ''}
                onChange={(e) => updateDraft({ target_type: e.target.value || undefined })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />

              <Input
                placeholder="Target ID"
                value={draft.target_id ?? ''}
                onChange={(e) => updateDraft({ target_id: e.target.value || undefined })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />

              <Input
                placeholder="Admin user ID"
                value={draft.admin_user_id ?? ''}
                onChange={(e) => updateDraft({ admin_user_id: e.target.value || undefined })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />

              <Input
                type="date"
                aria-label="Start date"
                value={draft.start_date ?? ''}
                onChange={(e) => updateDraft({ start_date: e.target.value || undefined })}
              />

              <Input
                type="date"
                aria-label="End date"
                value={draft.end_date ?? ''}
                onChange={(e) => updateDraft({ end_date: e.target.value || undefined })}
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={applyFilters}>
                Apply filters
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft({});
                  setFilters({});
                  setPage(0);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-destructive">Failed to load audit log</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">No actions found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">Admin</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                      <th className="py-2 pr-3 font-medium">Target</th>
                      <th className="py-2 pr-3 font-medium">Reason</th>
                      <th className="py-2 pr-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer border-b hover:bg-muted/50"
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {format(new Date(row.created_at), 'MMM dd, yyyy HH:mm')}
                        </td>
                        <td className="py-2 pr-3">{row.admin_email ?? row.admin_user_id}</td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary">{row.action_type}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {row.target_type}
                          {row.target_id && (
                            <span className="ml-1 font-mono text-xs">
                              {row.target_id.substring(0, 8)}…
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.reason ?? '—'}</td>
                        <td className="py-2 pr-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(row.id);
                            }}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                <div>
                  {total.toLocaleString()} total • page {page + 1} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ActionDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
