import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Building2,
  MessageSquare,
  ChevronRight,
  FolderOpen,
  AlertCircle,
  CalendarClock,
  Gavel,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  portalGetMatters,
  portalGetCalendar,
  type PortalMatterSummary,
  type PortalCalendarEventWithMatter,
} from '../portalApi';

function isHearing(eventType: string | null): boolean {
  return !!eventType && /hearing|court/i.test(eventType);
}

function UpcomingStrip() {
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ['portal', 'calendar'],
    queryFn: portalGetCalendar,
    staleTime: 60 * 1000,
  });

  if (!data || data.length === 0) return null;

  const events = data.slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Upcoming
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {events.map((event: PortalCalendarEventWithMatter) => {
            const hearing = isHearing(event.event_type);
            const Icon = hearing ? Gavel : CalendarDays;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/portal/matters/${event.caseId}`)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                    hearing ? 'border-primary/30 bg-primary/5' : 'border-border'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      hearing ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {event.title || 'Event'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{event.matterTitle}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {format(new Date(event.start_date), 'PP')}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function prettyStatus(status: string | null): string {
  if (!status) return 'In progress';
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function MatterCard({ matter }: { matter: PortalMatterSummary }) {
  const navigate = useNavigate();
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-card"
      onClick={() => navigate(`/portal/matters/${matter.caseId}`)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{matter.firm.name}</span>
            </div>

            <h3 className="truncate text-base font-semibold text-foreground">{matter.title}</h3>

            {matter.clientSummary && (
              <p className="line-clamp-2 text-sm text-muted-foreground">{matter.clientSummary}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="secondary">{prettyStatus(matter.status)}</Badge>
              {matter.unreadMessages > 0 && (
                <Badge variant="default" className="gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {matter.unreadMessages} new
                </Badge>
              )}
              {matter.lastEventAt && (
                <span className="text-xs text-muted-foreground">
                  Updated {formatDistanceToNow(new Date(matter.lastEventAt), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>

          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalMatters() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portal', 'matters'],
    queryFn: portalGetMatters,
    staleTime: 60 * 1000,
  });

  const [firmFilter, setFirmFilter] = useState<string>('all');

  // Distinct firms across the returned matters (preserve first-seen order).
  const firms = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of data ?? []) {
      if (!seen.has(m.firm.organizationId)) {
        seen.set(m.firm.organizationId, {
          id: m.firm.organizationId,
          name: m.firm.name,
        });
      }
    }
    return Array.from(seen.values());
  }, [data]);

  const multiFirm = firms.length > 1;

  const visibleMatters = useMemo(() => {
    if (!data) return [];
    if (!multiFirm || firmFilter === 'all') return data;
    return data.filter((m) => m.firm.organizationId === firmFilter);
  }, [data, multiFirm, firmFilter]);

  // Group visible matters by firm (only used when multiFirm).
  const groups = useMemo(() => {
    const byFirm = new Map<string, { name: string; matters: PortalMatterSummary[] }>();
    for (const m of visibleMatters) {
      const existing = byFirm.get(m.firm.organizationId);
      if (existing) {
        existing.matters.push(m);
      } else {
        byFirm.set(m.firm.organizationId, { name: m.firm.name, matters: [m] });
      }
    }
    return Array.from(byFirm.entries()).map(([id, g]) => ({ id, ...g }));
  }, [visibleMatters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Your matters</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Follow your matters and stay updated on what's happening.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'Unable to load your matters.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No matters yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                When a firm shares a matter with you, it will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <>
          <UpcomingStrip />

          {multiFirm && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Select value={firmFilter} onValueChange={setFirmFilter}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="All firms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All firms</SelectItem>
                  {firms.map((firm) => (
                    <SelectItem key={firm.id} value={firm.id}>
                      {firm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {multiFirm ? (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.id} className="space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Building2 className="h-4 w-4 shrink-0" />
                    {group.name}
                  </h2>
                  <div className="space-y-3">
                    {group.matters.map((matter) => (
                      <MatterCard key={matter.caseId} matter={matter} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((matter) => (
                <MatterCard key={matter.caseId} matter={matter} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
