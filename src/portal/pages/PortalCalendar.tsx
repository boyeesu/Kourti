import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
} from 'date-fns';
import {
  CalendarDays,
  Gavel,
  MapPin,
  CalendarPlus,
  AlertCircle,
  CalendarClock,
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  LayoutGrid,
  List as ListIcon,
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
import { cn } from '@/lib/utils';
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

/** Parse a date-ish value, returning null for missing/invalid input so callers
 *  never hand an "Invalid Date" to date-fns (which throws RangeError). */
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
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
  const start = toDate(event.start_date);
  const end = toDate(event.end_date);

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
            {start ? format(start, 'MMM') : '—'}
          </span>
          <span className="text-lg font-bold leading-none">{start ? format(start, 'd') : '?'}</span>
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
            {start ? format(start, 'EEEE, PPP') : 'Date to be confirmed'}
            {end && event.end_date !== event.start_date ? ` – ${format(end, 'PPP')}` : ''}
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

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Month-grid view of the calendar. Reads from the already-filtered events. */
function MonthGrid({
  events,
  viewMonth,
  setViewMonth,
  selectedDay,
  setSelectedDay,
  renderDayEvents,
}: {
  events: PortalCalendarEventWithMatter[];
  viewMonth: Date;
  setViewMonth: (d: Date) => void;
  selectedDay: Date;
  setSelectedDay: (d: Date) => void;
  renderDayEvents: (events: PortalCalendarEventWithMatter[]) => JSX.Element;
}) {
  // Map yyyy-MM-dd -> events starting that day (skip events without a valid start).
  const eventsByDay = useMemo(() => {
    const map = new Map<string, PortalCalendarEventWithMatter[]>();
    for (const ev of events) {
      const start = toDate(ev.start_date);
      if (!start) continue;
      const key = format(start, 'yyyy-MM-dd');
      const arr = map.get(key);
      if (arr) arr.push(ev);
      else map.set(key, [ev]);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(viewMonth));
    const gridEnd = endOfWeek(endOfMonth(viewMonth));
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

  const selectedKey = format(selectedDay, 'yyyy-MM-dd');
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        {/* Month header */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground sm:text-base">
            {format(viewMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setViewMonth(startOfMonth(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous month"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Next month"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs"
            >
              <span className="sm:hidden">{label.charAt(0)}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(key) ?? [];
            const outside = !isSameMonth(day, viewMonth);
            const today = isToday(day);
            const selected = isSameDay(day, selectedDay);
            const visibleChips = dayEvents.slice(0, 2);
            const extra = dayEvents.length - visibleChips.length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-pressed={selected}
                aria-label={`${format(day, 'PPPP')}${
                  dayEvents.length
                    ? `, ${dayEvents.length} date${dayEvents.length === 1 ? '' : 's'}`
                    : ''
                }`}
                className={cn(
                  'flex min-h-[3.5rem] flex-col rounded-md border p-1 text-left transition-colors sm:min-h-[5.5rem] sm:p-1.5',
                  selected
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-transparent hover:bg-muted/60',
                  today && !selected && 'bg-primary/10'
                )}
              >
                <span
                  className={cn(
                    'mb-1 text-xs font-medium sm:text-sm',
                    outside && 'text-muted-foreground/40',
                    today && 'font-bold text-primary'
                  )}
                >
                  {format(day, 'd')}
                </span>

                {/* Chips on larger screens */}
                <div className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex">
                  {visibleChips.map((ev) => {
                    const hearing = isHearing(ev.event_type);
                    return (
                      <span
                        key={ev.id}
                        className={cn(
                          'truncate rounded px-1 py-0.5 text-[10px] leading-tight',
                          hearing ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground'
                        )}
                        title={ev.title || 'Event'}
                      >
                        {ev.title || 'Event'}
                      </span>
                    );
                  })}
                  {extra > 0 && (
                    <span className="px-1 text-[10px] leading-tight text-muted-foreground">
                      +{extra} more
                    </span>
                  )}
                </div>

                {/* Dot indicator on small screens */}
                {dayEvents.length > 0 && (
                  <span className="mt-auto flex gap-0.5 sm:hidden" aria-hidden>
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isHearing(ev.event_type) ? 'bg-primary' : 'bg-muted-foreground/50'
                        )}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day events live outside the grid for full detail. */}
        <div className="mt-4 border-t border-border pt-4">
          {selectedEvents.length > 0 ? (
            renderDayEvents(selectedEvents)
          ) : (
            <p className="text-sm text-muted-foreground">
              No dates on {format(selectedDay, 'PPP')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type CalendarView = 'month' | 'list';
const VIEW_STORAGE_KEY = 'kourti_portal_calendar_view';

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
  const [view, setView] = useState<CalendarView>(() => {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(VIEW_STORAGE_KEY) : null;
    return stored === 'list' ? 'list' : 'month';
  });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* ignore persistence errors (private mode, etc.) */
    }
  }, [view]);

  // Soonest upcoming (or earliest) event start — anchors the initial visible month/day.
  const soonestStart = useMemo(() => {
    let earliest: Date | null = null;
    for (const ev of data ?? []) {
      const start = toDate(ev.start_date);
      if (!start) continue;
      if (!earliest || start.getTime() < earliest.getTime()) earliest = start;
    }
    return earliest;
  }, [data]);

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());
  // Once data loads, jump the grid to the soonest event's month (only if user
  // hasn't navigated away yet — i.e. still on the current month).
  const [anchored, setAnchored] = useState(false);
  useEffect(() => {
    if (anchored || !soonestStart) return;
    setViewMonth(startOfMonth(soonestStart));
    setSelectedDay(soonestStart);
    setAnchored(true);
  }, [anchored, soonestStart]);

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
      (a, b) => (toDate(a.start_date)?.getTime() ?? 0) - (toDate(b.start_date)?.getTime() ?? 0)
    );
    const byMonth = new Map<string, PortalCalendarEventWithMatter[]>();
    for (const ev of sorted) {
      const startsAt = toDate(ev.start_date);
      const key = startsAt ? format(startsAt, 'MMMM yyyy') : 'Date to be confirmed';
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
            <div className="ml-auto inline-flex rounded-md border border-border p-0.5">
              <button
                type="button"
                aria-label="Month view"
                aria-pressed={view === 'month'}
                onClick={() => setView('month')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  view === 'month'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  view === 'list'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
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

      {!isLoading && !isError && data && data.length > 0 && filtered.length === 0 && (
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

      {!isLoading && !isError && filtered.length > 0 && view === 'month' && (
        <MonthGrid
          events={filtered}
          viewMonth={viewMonth}
          setViewMonth={setViewMonth}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          renderDayEvents={(dayEvents) => (
            <div className="space-y-3">
              {dayEvents.map((event) => (
                <CalendarEventCard
                  key={event.id}
                  event={event}
                  onRsvp={handleRsvp}
                  rsvpPending={rsvp.isPending}
                />
              ))}
            </div>
          )}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && view === 'list' && groups.length > 0 && (
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
