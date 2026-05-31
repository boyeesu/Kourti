import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CalendarDays,
  Gavel,
  MapPin,
  CalendarPlus,
  AlertCircle,
  CalendarClock,
  ChevronRight,
  Search,
  X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import {
  portalGetCalendar,
  portalRsvpEvent,
  downloadIcs,
  type PortalCalendarEventWithMatter,
  type PortalRsvpResponse,
} from '../portalApi';

function isHearing(eventType: string | null): boolean {
  return !!eventType && /hearing|court/i.test(eventType);
}

const RSVP_OPTIONS: { value: PortalRsvpResponse; label: string }[] = [
  { value: 'accepted', label: 'Going' },
  { value: 'tentative', label: 'Maybe' },
  { value: 'declined', label: 'No' },
];

function CalendarEventCard({
  event,
  onRsvp,
  rsvpPending,
}: {
  event: PortalCalendarEventWithMatter;
  onRsvp: (event: PortalCalendarEventWithMatter, response: PortalRsvpResponse) => void;
  rsvpPending: boolean;
}) {
  const navigate = useNavigate();
  const hearing = isHearing(event.event_type);
  const Icon = hearing ? Gavel : CalendarDays;
  const start = new Date(event.start_date);

  return (
    <Card className={hearing ? 'border-primary/30' : undefined}>
      <CardContent className="flex gap-4 p-4">
        {/* Date chip */}
        <div
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${
            hearing ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide">
            {format(start, 'MMM')}
          </span>
          <span className="text-lg font-bold leading-none">{format(start, 'd')}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon
              className={`h-4 w-4 shrink-0 ${hearing ? 'text-primary' : 'text-muted-foreground'}`}
            />
            <p className="text-sm font-semibold text-foreground">{event.title || 'Event'}</p>
            {hearing && (
              <Badge variant="default" className="h-5 text-[10px]">
                Hearing
              </Badge>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(`/portal/matters/${event.caseId}`)}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {event.matterTitle}
            <ChevronRight className="h-3 w-3" />
          </button>

          <p className="mt-1 text-xs text-muted-foreground">
            {format(start, 'EEEE, PPP')}
            {event.end_date && event.end_date !== event.start_date
              ? ` – ${format(new Date(event.end_date), 'PPP')}`
              : ''}
          </p>

          {event.location && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {event.location}
            </p>
          )}

          {event.description && (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {event.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {RSVP_OPTIONS.map((opt) => {
                const active = event.rsvp === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={rsvpPending}
                    aria-pressed={active}
                    onClick={() => onRsvp(event, opt.value)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => downloadIcs(event)}
            >
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
              Add to calendar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalCalendar() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['portal', 'calendar'],
    queryFn: portalGetCalendar,
    staleTime: 60 * 1000,
  });

  const rsvp = useMutation({
    mutationFn: ({
      caseId,
      eventId,
      response,
    }: {
      caseId: string;
      eventId: string;
      response: PortalRsvpResponse;
    }) => portalRsvpEvent(caseId, eventId, response),
    onSuccess: (_d, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal', 'calendar'] });
      queryClient.invalidateQueries({
        queryKey: ['portal', 'matter', variables.caseId, 'calendar'],
      });
      const label = RSVP_OPTIONS.find((o) => o.value === variables.response)?.label ?? 'Updated';
      toast.success(`RSVP saved: ${label}`);
    },
    onError: (err) => {
      toast.error('Could not save RSVP', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    },
  });

  const handleRsvp = (event: PortalCalendarEventWithMatter, response: PortalRsvpResponse) => {
    rsvp.mutate({ caseId: event.caseId, eventId: event.id, response });
  };

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'hearing' | 'other'>('all');
  const [matterFilter, setMatterFilter] = useState<string>('all');

  // Distinct matters present across events (for the matter filter).
  const matters = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ev of data ?? []) {
      if (!seen.has(ev.caseId)) seen.set(ev.caseId, ev.matterTitle);
    }
    return Array.from(seen.entries()).map(([caseId, title]) => ({ caseId, title }));
  }, [data]);

  const multiMatter = matters.length > 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((ev) => {
      if (matterFilter !== 'all' && ev.caseId !== matterFilter) return false;
      if (typeFilter !== 'all') {
        const hearing = isHearing(ev.event_type);
        if (typeFilter === 'hearing' && !hearing) return false;
        if (typeFilter === 'other' && hearing) return false;
      }
      if (q) {
        const haystack = [ev.title, ev.matterTitle, ev.location, ev.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, typeFilter, matterFilter]);

  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'all' || matterFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setMatterFilter('all');
  };

  // Group chronologically by month label.
  const groups = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    const byMonth = new Map<string, PortalCalendarEventWithMatter[]>();
    for (const ev of sorted) {
      const key = format(new Date(ev.start_date), 'MMMM yyyy');
      const arr = byMonth.get(key);
      if (arr) arr.push(ev);
      else byMonth.set(key, [ev]);
    }
    return Array.from(byMonth.entries()).map(([month, events]) => ({ month, events }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hearings, deadlines and key dates across all your matters.
        </p>
      </div>

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search dates by title, matter or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              aria-label="Search calendar"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as 'all' | 'hearing' | 'other')}
            >
              <SelectTrigger className="w-36 sm:w-44">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="hearing">Hearings</SelectItem>
                <SelectItem value="other">Other dates</SelectItem>
              </SelectContent>
            </Select>
            {multiMatter && (
              <Select value={matterFilter} onValueChange={setMatterFilter}>
                <SelectTrigger className="w-44 sm:w-56">
                  <SelectValue placeholder="All matters" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All matters</SelectItem>
                  {matters.map((m) => (
                    <SelectItem key={m.caseId} value={m.caseId}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

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
              {error instanceof Error ? error.message : 'Unable to load your calendar.'}
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
            <CalendarClock className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No upcoming dates</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scheduled hearings and key dates will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && data && data.length > 0 && groups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">No dates match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a different search term or clear the filters.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.month} className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.month}
              </h2>
              <div className="space-y-3">
                {group.events.map((event) => (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    onRsvp={handleRsvp}
                    rsvpPending={rsvp.isPending}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
