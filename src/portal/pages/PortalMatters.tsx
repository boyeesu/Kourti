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
  Gavel,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import { usePortalAuth } from '../PortalAuthContext';
import {
  portalGetMatters,
  portalGetCalendar,
  type PortalMatterSummary,
  type PortalCalendarEventWithMatter,
} from '../portalApi';

function isHearing(eventType: string | null): boolean {
  return !!eventType && /hearing|court/i.test(eventType);
}

function prettyStatus(status: string | null): string {
  if (!status) return 'In progress';
  return status.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Map a raw status to a calm status-dot colour. */
function statusTone(status: string | null): string {
  const s = (status ?? '').toLowerCase();
  if (/closed|complete|won|resolved/.test(s)) return 'bg-success';
  if (/hold|pending|wait|review/.test(s)) return 'bg-warning';
  if (/urgent|hearing|overdue/.test(s)) return 'bg-destructive';
  return 'bg-primary';
}

/** Highlight banner for the single soonest upcoming event across all matters. */
function NextUp({ event }: { event: PortalCalendarEventWithMatter }) {
  const navigate = useNavigate();
  const hearing = isHearing(event.event_type);
  const Icon = hearing ? Gavel : CalendarDays;
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Next up</p>
          <p className="truncate text-sm font-medium text-foreground">
            {event.title || 'Event'} · {format(new Date(event.start_date), 'PPP')}
          </p>
          <p className="truncate text-xs text-muted-foreground">{event.matterTitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-primary hover:text-primary"
          onClick={() => navigate('/portal/calendar')}
        >
          Calendar
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function MatterCard({
  matter,
  nextEvent,
}: {
  matter: PortalMatterSummary;
  nextEvent?: PortalCalendarEventWithMatter;
}) {
  const navigate = useNavigate();
  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-card"
      onClick={() => navigate(`/portal/matters/${matter.caseId}`)}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{matter.firm.name}</span>
          </div>
          {matter.unreadMessages > 0 && (
            <Badge variant="default" className="shrink-0 gap-1">
              <MessageSquare className="h-3 w-3" />
              {matter.unreadMessages}
            </Badge>
          )}
        </div>

        <h3 className="mt-2 line-clamp-1 text-base font-semibold text-foreground">
          {matter.title}
        </h3>

        {matter.clientSummary && (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{matter.clientSummary}</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', statusTone(matter.status))} />
          <span className="text-xs font-medium text-foreground">{prettyStatus(matter.status)}</span>
          {matter.lastEventAt && (
            <span className="text-xs text-muted-foreground">
              · Updated {formatDistanceToNow(new Date(matter.lastEventAt), { addSuffix: true })}
            </span>
          )}
        </div>

        {nextEvent && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2">
            {isHearing(nextEvent.event_type) ? (
              <Gavel className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate text-xs text-foreground">
              {nextEvent.title || 'Next date'}
            </span>
            <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground">
              {format(new Date(nextEvent.start_date), 'MMM d')}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-end text-xs font-medium text-muted-foreground">
          View matter
          <ChevronRight className="ml-0.5 h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalMatters() {
  const { client } = usePortalAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portal', 'matters'],
    queryFn: portalGetMatters,
    staleTime: 60 * 1000,
  });

  const { data: calendar } = useQuery({
    queryKey: ['portal', 'calendar'],
    queryFn: portalGetCalendar,
    staleTime: 60 * 1000,
  });

  const [firmFilter, setFirmFilter] = useState<string>('all');

  // Soonest upcoming event per case (calendar is grouped by date by the server).
  const nextByCase = useMemo(() => {
    const map = new Map<string, PortalCalendarEventWithMatter>();
    const sorted = [...(calendar ?? [])].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    for (const ev of sorted) {
      if (!map.has(ev.caseId)) map.set(ev.caseId, ev);
    }
    return map;
  }, [calendar]);

  const soonest = useMemo(() => {
    const sorted = [...(calendar ?? [])].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    return sorted[0];
  }, [calendar]);

  // Distinct firms across the returned matters (preserve first-seen order).
  const firms = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const m of data ?? []) {
      if (!seen.has(m.firm.organizationId)) {
        seen.set(m.firm.organizationId, { id: m.firm.organizationId, name: m.firm.name });
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

  const groups = useMemo(() => {
    const byFirm = new Map<string, { name: string; matters: PortalMatterSummary[] }>();
    for (const m of visibleMatters) {
      const existing = byFirm.get(m.firm.organizationId);
      if (existing) existing.matters.push(m);
      else byFirm.set(m.firm.organizationId, { name: m.firm.name, matters: [m] });
    }
    return Array.from(byFirm.entries()).map(([id, g]) => ({ id, ...g }));
  }, [visibleMatters]);

  const firstName = client?.fullName?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {firstName ? `Welcome back, ${firstName}` : 'Your matters'}
        </h1>
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
          {soonest && <NextUp event={soonest} />}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              {visibleMatters.length} {visibleMatters.length === 1 ? 'matter' : 'matters'}
            </h2>
            {multiFirm && (
              <Select value={firmFilter} onValueChange={setFirmFilter}>
                <SelectTrigger className="w-48 sm:w-64">
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
            )}
          </div>

          {multiFirm ? (
            <div className="space-y-6">
              {groups.map((group) => (
                <div key={group.id} className="space-y-3">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    {group.name}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.matters.map((matter) => (
                      <MatterCard
                        key={matter.caseId}
                        matter={matter}
                        nextEvent={nextByCase.get(matter.caseId)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleMatters.map((matter) => (
                <MatterCard
                  key={matter.caseId}
                  matter={matter}
                  nextEvent={nextByCase.get(matter.caseId)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
