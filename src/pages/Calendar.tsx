import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  List,
  Grid3X3,
  RefreshCw,
  Download,
  Plus,
  Filter,
  Search,
  X,
  CalendarDays,
} from 'lucide-react';
import { useCalendarEvents } from '@/hooks/useCalendar';
import { EventCreateDialog } from '@/components/calendar/EventCreateDialog';
import { EventViewDialog } from '@/components/calendar/EventViewDialog';
import { CalendarSyncSettings } from '@/components/calendar/CalendarSyncSettings';
import { TeamCalendars } from '@/components/calendar/TeamCalendars';
import { CalendarDayView } from '@/components/calendar/CalendarDayView';
import { CalendarWorkWeekView } from '@/components/calendar/CalendarWorkWeekView';
import { FindAvailableTimeDialog } from '@/components/calendar/FindAvailableTimeDialog';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import { Settings as SettingsIcon } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CalendarEvent, CalendarEventWithOwner } from '@/types';
import { useSharedCalendars } from '@/hooks/useCalendarSharing';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  startOfDay,
  isSameDay,
} from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { invokeFunctionWithCsrf } from '@/lib/csrfClient';
import { toast } from 'sonner';
import { env } from '@/lib/env';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TableSkeleton } from '@/components/ui/loading-states';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CalendarView = 'month' | 'week' | 'day' | 'workWeek' | 'list';
type EventTypeFilter =
  | 'all'
  | 'meeting'
  | 'hearing'
  | 'deadline'
  | 'deposition'
  | 'review'
  | 'consultation';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | CalendarEventWithOwner | null>(
    null
  );
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>('month');
  const [eventTypeFilter, setEventTypeFilter] = useState<EventTypeFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { data: events = [], isLoading } = useCalendarEvents();
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSsoConfig, setHasSsoConfig] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showFindTimeDialog, setShowFindTimeDialog] = useState(false);
  const calendarFeedUrl = `${env.APP_URL}/api/calendar/ics`;
  const calendarSubscribeUrl = calendarFeedUrl.replace(/^https?:\/\//, 'webcal://');

  // Team calendar sharing state
  const [selectedTeamCalendars, setSelectedTeamCalendars] = useState<string[]>([]);
  const [sharedCalendarEvents, setSharedCalendarEvents] = useState<CalendarEventWithOwner[]>([]);
  const { data: sharedCalendars } = useSharedCalendars();

  // Handle calendar toggle
  const handleCalendarToggle = async (ownerId: string, checked: boolean) => {
    if (checked) {
      setSelectedTeamCalendars((prev) => [...prev, ownerId]);

      // Fetch events for this shared calendar
      try {
        const firstDay = startOfMonth(currentDate);
        const lastDay = endOfMonth(currentDate);

        const { data, error } = await supabase
          .from('calendar_events')
          .select('*')
          .eq('created_by', ownerId)
          .gte('start_date', firstDay.toISOString())
          .lte('end_date', lastDay.toISOString())
          .order('start_date', { ascending: true });

        if (error) throw error;

        // Add owner info to events
        const ownerCalendar = sharedCalendars?.find((sc) => sc.calendar_owner_id === ownerId);
        const eventsWithOwner: CalendarEventWithOwner[] = (data || []).map(
          (event) =>
            ({
              ...event,
              owner_name: ownerCalendar?.owner_name,
              owner_email: ownerCalendar?.owner_email,
              owner_color: ownerCalendar?.calendar_color,
            }) as CalendarEventWithOwner
        );

        setSharedCalendarEvents((prev) => [...prev, ...eventsWithOwner]);
      } catch (err) {
        console.error('Error fetching shared calendar events:', err);
      }
    } else {
      setSelectedTeamCalendars((prev) => prev.filter((id) => id !== ownerId));
      setSharedCalendarEvents((prev) => prev.filter((event) => event.created_by !== ownerId));
    }
  };

  // Combine and filter events
  const allEvents = useMemo(() => {
    const combined = [...events, ...externalEvents, ...sharedCalendarEvents];
    return combined.filter((event) => {
      const matchesType = eventTypeFilter === 'all' || event.event_type === eventTypeFilter;
      const matchesSearch =
        !searchTerm ||
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [events, externalEvents, sharedCalendarEvents, eventTypeFilter, searchTerm]);

  // Check if SSO is configured
  useEffect(() => {
    const checkSsoConfig = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.organization_id) return;

        const { data } = await supabase
          .from('organization_sso_configs_view')
          .select('id, provider, is_enabled')
          .eq('organization_id', profile.organization_id)
          .eq('is_enabled', true)
          .in('provider', ['google', 'microsoft'])
          .limit(1)
          .maybeSingle();

        if (data) {
          setHasSsoConfig(true);
        }
      } catch {
        setHasSsoConfig(false);
      }
    };

    checkSsoConfig();
  }, []);

  // Sync external calendars
  const syncExternalCalendars = async () => {
    if (!hasSsoConfig) return;

    setIsSyncing(true);
    let syncedCount = 0;

    try {
      const firstDay = startOfMonth(currentDate);
      const lastDay = endOfMonth(currentDate);

      const timeMin = firstDay.toISOString();
      const timeMax = lastDay.toISOString();

      try {
        const { data: googleData } = await invokeFunctionWithCsrf<{ events?: CalendarEvent[] }>(
          'google-calendar-sync',
          {
            body: { action: 'list-events', timeMin, timeMax },
          }
        );

        if (googleData?.events) {
          const events = googleData.events;
          setExternalEvents((prev) => [
            ...prev.filter((e) => e.source !== 'google_calendar'),
            ...events,
          ]);
          syncedCount++;
        }
      } catch {
        // Silently ignore
      }

      try {
        const { data: teamsData } = await invokeFunctionWithCsrf<{ events?: CalendarEvent[] }>(
          'teams-calendar-sync',
          {
            body: { action: 'list-events', timeMin, timeMax },
          }
        );

        if (teamsData?.events) {
          setExternalEvents((prev) => [
            ...prev.filter((e) => e.source !== 'microsoft_teams'),
            ...(teamsData.events || []),
          ]);
          syncedCount++;
        }
      } catch {
        // Silently ignore
      }

      if (syncedCount > 0) {
        toast.success('Calendar Synced', {
          description: 'External calendars have been synchronized.',
        });
      }
    } catch {
      toast.error('Sync Failed', {
        description: 'Unable to sync external calendars. Please try again.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (hasSsoConfig) {
      syncExternalCalendars();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, hasSsoConfig]);

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'bg-blue-500 text-white border-blue-600';
      case 'hearing':
        return 'bg-red-500 text-white border-red-600';
      case 'deadline':
        return 'bg-amber-500 text-white border-amber-600';
      case 'deposition':
        return 'bg-green-500 text-white border-green-600';
      case 'review':
        return 'bg-purple-500 text-white border-purple-600';
      case 'consultation':
        return 'bg-indigo-500 text-white border-indigo-600';
      default:
        return 'bg-gray-500 text-white border-gray-600';
    }
  };

  const handleEventClick = (event: CalendarEvent | CalendarEventWithOwner) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  const navigateDate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }

    const newDate = new Date(currentDate);
    if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  // Get days for month view
  const getDaysInMonth = (date: Date) => {
    const start = startOfWeek(startOfMonth(date));
    const end = endOfWeek(endOfMonth(date));
    return eachDayOfInterval({ start, end });
  };

  // Get days for week view
  const getDaysInWeek = (date: Date) => {
    const start = startOfWeek(date);
    const end = endOfWeek(date);
    return eachDayOfInterval({ start, end });
  };

  const getEventsForDate = (date: Date) => {
    return allEvents.filter((event) => {
      const startDate = startOfDay(new Date(event.start_date));
      const endDate = startOfDay(new Date(event.end_date));
      const checkDate = startOfDay(date);

      return checkDate >= startDate && checkDate <= endDate;
    });
  };

  const getEventsForMonth = () => {
    const firstDay = startOfMonth(currentDate);
    const lastDay = endOfMonth(currentDate);

    return allEvents
      .filter((event) => {
        const eventStart = new Date(event.start_date);
        const eventEnd = new Date(event.end_date);
        return eventStart <= lastDay && eventEnd >= firstDay;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  };

  const todayEvents = useMemo(() => {
    const today = new Date();
    return allEvents.filter((event) => {
      const eventStart = startOfDay(new Date(event.start_date));
      const eventEnd = startOfDay(new Date(event.end_date));
      const todayDate = startOfDay(today);
      return todayDate >= eventStart && todayDate <= eventEnd;
    });
  }, [allEvents]);

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    return allEvents
      .filter((event) => {
        const eventDate = new Date(event.start_date);
        const diffTime = eventDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 && diffDays <= 7;
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [allEvents]);

  const weekDays = getDaysInWeek(currentDate);
  const monthDays = getDaysInMonth(currentDate);

  if (isLoading) {
    return (
      <div className="px-4 py-6 space-y-6">
        <Breadcrumbs />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
            <p className="text-muted-foreground">Schedule and manage your legal events</p>
          </div>
        </div>
        <TableSkeleton rows={6} columns={7} />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground">Schedule and manage your legal events</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="shadow-sm"
            onClick={() => setShowFindTimeDialog(true)}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Schedule Meeting
          </Button>
          <EventCreateDialog>
            <Button className="shadow-sm">
              <Plus className="h-4 w-4 mr-2" />
              New Event
            </Button>
          </EventCreateDialog>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <Select
          value={eventTypeFilter}
          onValueChange={(v) => setEventTypeFilter(v as EventTypeFilter)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="meeting">Meetings</SelectItem>
            <SelectItem value="hearing">Hearings</SelectItem>
            <SelectItem value="deadline">Deadlines</SelectItem>
            <SelectItem value="deposition">Depositions</SelectItem>
            <SelectItem value="review">Reviews</SelectItem>
            <SelectItem value="consultation">Consultations</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  <CardTitle>
                    {calendarView === 'month'
                      ? format(currentDate, 'MMMM yyyy')
                      : calendarView === 'week'
                        ? `Week of ${format(weekDays[0], 'MMM d')} - ${format(weekDays[6], 'MMM d, yyyy')}`
                        : format(currentDate, 'MMMM yyyy')}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Tabs
                    value={calendarView}
                    onValueChange={(v) => setCalendarView(v as CalendarView)}
                  >
                    <TabsList className="flex-wrap">
                      <TabsTrigger value="month" className="gap-2">
                        <Grid3X3 className="h-4 w-4" />
                        Month
                      </TabsTrigger>
                      <TabsTrigger value="week" className="gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Week
                      </TabsTrigger>
                      <TabsTrigger value="workWeek" className="gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Work Week
                      </TabsTrigger>
                      <TabsTrigger value="day" className="gap-2">
                        <Clock className="h-4 w-4" />
                        Day
                      </TabsTrigger>
                      <TabsTrigger value="list" className="gap-2">
                        <List className="h-4 w-4" />
                        List
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="flex items-center gap-1 border rounded-md">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => navigateDate('prev')}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-2"
                      onClick={() => navigateDate('today')}
                    >
                      <CalendarDays className="h-4 w-4" />
                      Today
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => navigateDate('next')}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  {hasSsoConfig && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={syncExternalCalendars}
                        disabled={isSyncing}
                        className="gap-2"
                      >
                        <RefreshCw className={cn('h-4 w-4', isSyncing && 'animate-spin')} />
                        Sync
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSyncSettings(true)}
                        className="gap-2"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        Sync Settings
                      </Button>
                    </>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="h-4 w-4" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Export Calendar</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <a
                          href={calendarFeedUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="cursor-pointer"
                        >
                          Download ICS (one-time)
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={calendarSubscribeUrl} className="cursor-pointer">
                          Subscribe (auto-updates)
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {calendarView === 'month' && (
                <div className="space-y-2">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div
                        key={day}
                        className="p-2 text-center text-sm font-semibold text-muted-foreground"
                      >
                        {day}
                      </div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {monthDays.map((day, index) => {
                      const isCurrentMonth = isSameMonth(day, currentDate);
                      const isTodayDate = isToday(day);
                      const dayEvents = getEventsForDate(day);

                      return (
                        <div
                          key={index}
                          className={cn(
                            'min-h-[100px] p-2 border rounded-lg transition-all cursor-pointer',
                            isCurrentMonth
                              ? 'bg-card border-border hover:bg-accent/50 hover:border-primary/50'
                              : 'bg-muted/30 border-transparent opacity-50',
                            isTodayDate && 'ring-2 ring-primary border-primary'
                          )}
                          onClick={() => {
                            if (isCurrentMonth) {
                              setCurrentDate(day);
                              setCalendarView('week');
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'text-sm font-medium mb-1',
                              isTodayDate && 'text-primary font-bold',
                              !isCurrentMonth && 'text-muted-foreground'
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 3).map((event) => (
                              <div
                                key={event.id}
                                className={cn(
                                  'text-xs p-1 rounded truncate cursor-pointer transition-all hover:opacity-80 hover:scale-[1.02]',
                                  getEventTypeColor(event.event_type || 'meeting')
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEventClick(event);
                                }}
                                title={event.title}
                              >
                                {format(new Date(event.start_date), 'h:mm a')} {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="text-xs text-muted-foreground px-1">
                                +{dayEvents.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {calendarView === 'week' && (
                <div className="space-y-2">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 gap-2">
                    {weekDays.map((day, index) => {
                      const isTodayDate = isToday(day);
                      const dayEvents = getEventsForDate(day);

                      return (
                        <div key={index} className="text-center">
                          <div
                            className={cn(
                              'text-sm font-semibold mb-2',
                              isTodayDate && 'text-primary'
                            )}
                          >
                            {format(day, 'EEE')}
                          </div>
                          <div
                            className={cn(
                              'text-lg font-bold mb-2 rounded-full w-8 h-8 flex items-center justify-center mx-auto',
                              isTodayDate && 'bg-primary text-primary-foreground'
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                          <div className="space-y-1 min-h-[200px]">
                            {dayEvents.map((event) => (
                              <div
                                key={event.id}
                                className={cn(
                                  'text-xs p-2 rounded cursor-pointer transition-all hover:opacity-80 hover:shadow-md',
                                  getEventTypeColor(event.event_type || 'meeting')
                                )}
                                onClick={() => handleEventClick(event)}
                                title={event.title}
                              >
                                <div className="font-medium truncate">{event.title}</div>
                                <div className="text-xs opacity-90">
                                  {format(new Date(event.start_date), 'h:mm a')}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {calendarView === 'day' && (
                <CalendarDayView
                  date={currentDate}
                  events={allEvents}
                  onEventClick={handleEventClick}
                  getEventTypeColor={getEventTypeColor}
                />
              )}

              {calendarView === 'workWeek' && (
                <CalendarWorkWeekView
                  date={currentDate}
                  events={allEvents}
                  onEventClick={handleEventClick}
                  getEventTypeColor={getEventTypeColor}
                />
              )}

              {calendarView === 'list' && (
                <div className="space-y-3">
                  {getEventsForMonth().length > 0 ? (
                    getEventsForMonth().map((event) => (
                      <div
                        key={event.id}
                        className="p-4 rounded-lg border bg-card cursor-pointer transition-all hover:bg-accent/50 hover:shadow-md"
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            <div className="flex flex-col items-center gap-1 text-center min-w-[70px]">
                              <div className="text-2xl font-bold text-primary">
                                {format(new Date(event.start_date), 'd')}
                              </div>
                              <div className="text-xs text-muted-foreground uppercase">
                                {format(new Date(event.start_date), 'MMM')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(event.start_date), 'EEE')}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-lg mb-2">{event.title}</h4>
                              <div className="space-y-1.5 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 flex-shrink-0" />
                                  <span>
                                    {format(new Date(event.start_date), 'h:mm a')} -{' '}
                                    {format(new Date(event.end_date), 'h:mm a')}
                                    {!isSameDay(
                                      new Date(event.start_date),
                                      new Date(event.end_date)
                                    ) && ` (${format(new Date(event.end_date), 'MMM d')})`}
                                  </span>
                                </div>
                                {event.location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate">{event.location}</span>
                                  </div>
                                )}
                                {event.attendees && event.attendees.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate">
                                      {event.attendees.slice(0, 2).join(', ')}
                                      {event.attendees.length > 2 &&
                                        ` +${event.attendees.length - 2} more`}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {event.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <Badge
                            className={cn(
                              'shrink-0',
                              getEventTypeColor(event.event_type || 'meeting')
                            )}
                          >
                            {event.event_type || 'event'}
                          </Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      icon={CalendarIcon}
                      title="No events found"
                      description={
                        searchTerm || eventTypeFilter !== 'all'
                          ? 'Try adjusting your search or filters to find events.'
                          : `No events scheduled for ${format(currentDate, 'MMMM yyyy')}.`
                      }
                      action={
                        searchTerm || eventTypeFilter !== 'all'
                          ? {
                              label: 'Clear Filters',
                              onClick: () => {
                                setSearchTerm('');
                                setEventTypeFilter('all');
                              },
                            }
                          : undefined
                      }
                      secondaryAction={
                        !searchTerm && eventTypeFilter === 'all'
                          ? {
                              label: 'Create Event',
                              onClick: () => {
                                // The EventCreateDialog is already in the header, user can click it
                              },
                            }
                          : undefined
                      }
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Team Calendars */}
          <TeamCalendars
            selectedCalendars={selectedTeamCalendars}
            onCalendarToggle={handleCalendarToggle}
          />

          {/* Today's Events */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayEvents.length > 0 ? (
                <div className="space-y-3">
                  {todayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-muted/30 cursor-pointer transition-all hover:bg-muted/50 hover:shadow-sm"
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm flex-1">{event.title}</h4>
                        <Badge
                          className={cn(
                            'shrink-0 text-xs',
                            getEventTypeColor(event.event_type || 'meeting')
                          )}
                        >
                          {event.event_type || 'event'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(event.start_date), 'h:mm a')}
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No events today</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Upcoming</CardTitle>
              <CardDescription>Next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {upcomingEvents.slice(0, 5).map((event) => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-muted/30 cursor-pointer transition-all hover:bg-muted/50 hover:shadow-sm"
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="font-medium text-sm flex-1">{event.title}</h4>
                        <Badge
                          className={cn(
                            'shrink-0 text-xs',
                            getEventTypeColor(event.event_type || 'meeting')
                          )}
                        >
                          {event.event_type || 'event'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>{format(new Date(event.start_date), 'MMM d, h:mm a')}</div>
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="truncate">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {upcomingEvents.length > 5 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => {
                        setCalendarView('list');
                        setCurrentDate(new Date());
                      }}
                    >
                      View {upcomingEvents.length - 5} more
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm text-center py-4">No upcoming events</p>
              )}
            </CardContent>
          </Card>

          {/* Event Type Legend */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Event Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {['meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation'].map(
                  (type) => (
                    <div key={type} className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-3 h-3 rounded-full',
                          getEventTypeColor(type).split(' ')[0]
                        )}
                      />
                      <span className="text-sm capitalize">{type}</span>
                    </div>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <EventViewDialog
        event={selectedEvent}
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
      />

      <FindAvailableTimeDialog open={showFindTimeDialog} onOpenChange={setShowFindTimeDialog} />

      {showSyncSettings && (
        <Dialog open={showSyncSettings} onOpenChange={setShowSyncSettings}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <CalendarSyncSettings />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
