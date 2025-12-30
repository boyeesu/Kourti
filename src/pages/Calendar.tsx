import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Download
} from "lucide-react";
import { useCalendarEvents } from "@/hooks/useCalendar";
import { EventCreateDialog } from "@/components/calendar/EventCreateDialog";
import { EventViewDialog } from "@/components/calendar/EventViewDialog";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { CalendarEvent } from "@/types";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [calendarView, setCalendarView] = useState<'month' | 'list'>('month');
  const { data: events = [], isLoading } = useCalendarEvents();
  const [externalEvents, setExternalEvents] = useState<CalendarEvent[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasSsoConfig, setHasSsoConfig] = useState(false);
  const { toast } = useToast();
  const calendarFeedUrl = `${env.APP_URL}/api/calendar/ics`;
  const calendarSubscribeUrl = calendarFeedUrl.replace(/^https?:\/\//, "webcal://");

  // Combine internal and external events
  const allEvents = [...events, ...externalEvents];

  // Check if SSO is configured for the user's organization
  useEffect(() => {
    const checkSsoConfig = async () => {
      try {
        // Get user's organization first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.organization_id) return;

        const { data, error } = await supabase
          .from('organization_sso_configs_view')
          .select('id, provider, is_enabled')
          .eq('organization_id', profile.organization_id)
          .eq('is_enabled', true)
          .in('provider', ['google', 'microsoft'])
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          setHasSsoConfig(true);
        }
      } catch (err) {
        console.log('No SSO configured:', err);
        setHasSsoConfig(false);
      }
    };

    checkSsoConfig();
  }, []);

  // Sync external calendars (Google and Microsoft Teams)
  const syncExternalCalendars = async () => {
    if (!hasSsoConfig) return;

    setIsSyncing(true);
    let syncedCount = 0;

    try {
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const timeMin = firstDay.toISOString();
      const timeMax = lastDay.toISOString();

      // Try Google Calendar
      try {
        const { data: googleData, error: googleError } = await supabase.functions.invoke('google-calendar-sync', {
          body: { action: 'list-events', timeMin, timeMax }
        });

        if (!googleError && googleData?.events) {
          setExternalEvents(prev => [...prev.filter(e => e.source !== 'google_calendar'), ...googleData.events]);
          syncedCount++;
        }
      } catch (err) {
        // Silently ignore - Google Calendar not configured or function not available
        console.debug('Google Calendar sync not available');
      }

      // Try Microsoft Teams Calendar
      try {
        const { data: teamsData, error: teamsError } = await supabase.functions.invoke('teams-calendar-sync', {
          body: { action: 'list-events', timeMin, timeMax }
        });

        if (!teamsError && teamsData?.events) {
          setExternalEvents(prev => [...prev.filter(e => e.source !== 'microsoft_teams'), ...teamsData.events]);
          syncedCount++;
        }
      } catch (err) {
        // Silently ignore - Microsoft Teams Calendar not configured or function not available
        console.debug('Teams Calendar sync not available');
      }

      // Only show success toast if at least one calendar was synced
      if (syncedCount > 0) {
        toast({
          title: "Calendar Synced",
          description: "External calendars have been synchronized."
        });
      }
    } catch (error) {
      // Silently handle sync errors - calendars may not be configured
      console.debug('Calendar sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Auto-sync on mount and when month changes (only if SSO configured)
  useEffect(() => {
    if (hasSsoConfig) {
      syncExternalCalendars();
    }
  }, [currentDate, hasSsoConfig]);

  if (isLoading) {
    return (
      <div className="px-4 py-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "meeting": return "bg-primary text-primary-foreground";
      case "hearing": return "bg-destructive text-destructive-foreground";
      case "deadline": return "bg-warning text-warning-foreground";
      case "deposition": return "bg-success text-success-foreground";
      case "review": return "bg-muted text-muted-foreground";
      case "consultation": return "bg-secondary text-secondary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDialog(true);
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);

    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return allEvents.filter(event => {
      const startDate = new Date(event.start_date).toISOString().split('T')[0];
      const endDate = new Date(event.end_date).toISOString().split('T')[0];

      // Check if the date falls within the event's date range
      return dateStr >= startDate && dateStr <= endDate;
    });
  };

  // Get events for list view - sorted by date
  const getEventsForMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    return allEvents.filter(event => {
      const eventStart = new Date(event.start_date);
      const eventEnd = new Date(event.end_date);

      // Include events that start, end, or span within the month
      return (eventStart <= lastDay && eventEnd >= firstDay);
    }).sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  };

  const todayEvents = allEvents.filter(event => {
    const today = new Date().toISOString().split('T')[0];
    const eventStart = new Date(event.start_date).toISOString().split('T')[0];
    const eventEnd = new Date(event.end_date).toISOString().split('T')[0];

    // Include events that are happening today (start, end, or span today)
    return today >= eventStart && today <= eventEnd;
  });

  const upcomingEvents = allEvents.filter(event => {
    const today = new Date();
    const eventDate = new Date(event.start_date);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  });

  return (
    <div className="px-4 py-6 space-y-6">
      <Breadcrumbs />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground">Schedule and manage your legal events</p>
        </div>
        <EventCreateDialog />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar View */}
        <div className="lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-primary" />
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Download className="h-4 w-4" />
                        Add to Calendar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72">
                      <DropdownMenuLabel>Calendar Feed</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <a href={calendarFeedUrl} target="_blank" rel="noreferrer">
                          Download ICS (one-time import)
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={calendarSubscribeUrl}>
                          Subscribe (auto-updates)
                        </a>
                      </DropdownMenuItem>
                      <div className="px-3 pb-2 text-xs text-muted-foreground">
                        Subscription keeps your device calendar updated automatically.
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {hasSsoConfig && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={syncExternalCalendars}
                      disabled={isSyncing}
                      className="gap-1"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      Sync
                    </Button>
                  )}
                  <div className="flex items-center gap-1 mr-2">
                    <Button
                      variant={calendarView === 'month' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCalendarView('month')}
                      className="gap-1"
                    >
                      <Grid3X3 className="h-4 w-4" />
                      Month
                    </Button>
                    <Button
                      variant={calendarView === 'list' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCalendarView('list')}
                      className="gap-1"
                    >
                      <List className="h-4 w-4" />
                      List
                    </Button>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {calendarView === 'month' ? (
                <>
                  <div className="grid grid-cols-7 gap-1 mb-4">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                      <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                        {day}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(currentDate).map((day, index) => {
                      const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                      const isToday = day.toDateString() === new Date().toDateString();
                      const dayEvents = getEventsForDate(day);

                      return (
                        <div
                          key={index}
                          className={`
                            min-h-[80px] p-1 border rounded-lg transition-colors
                            ${isCurrentMonth ? 'bg-card border-border' : 'bg-muted/30 border-transparent'}
                            ${isToday ? 'ring-2 ring-primary' : ''}
                            hover:bg-accent cursor-pointer
                          `}
                        >
                          <div className={`text-sm font-medium mb-1 ${isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                            }`}>
                            {day.getDate()}
                          </div>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 2).map(event => (
                              <div
                                key={event.id}
                                className={`text-xs p-1 rounded truncate cursor-pointer transition-opacity hover:opacity-80 ${getEventTypeColor(event.event_type)}`}
                                onClick={() => handleEventClick(event)}
                              >
                                {event.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-xs text-muted-foreground">
                                +{dayEvents.length - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {getEventsForMonth().length > 0 ? (
                    getEventsForMonth().map(event => (
                      <div
                        key={event.id}
                        className="p-4 rounded-lg border bg-card cursor-pointer transition-colors hover:bg-accent/50"
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-start gap-3">
                            <div className="flex flex-col items-center gap-1 text-center min-w-[60px]">
                              <div className="text-2xl font-bold text-primary">
                                {format(new Date(event.start_date), 'd')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {format(new Date(event.start_date), 'MMM')}
                              </div>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg mb-1">{event.title}</h4>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    {format(new Date(event.start_date), 'h:mm a')} - {format(new Date(event.end_date), 'h:mm a')}
                                    {format(new Date(event.start_date), 'yyyy-MM-dd') !== format(new Date(event.end_date), 'yyyy-MM-dd') &&
                                      ` (${format(new Date(event.end_date), 'MMM d')})`
                                    }
                                  </span>
                                </div>
                                {event.location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4" />
                                    <span>{event.location}</span>
                                  </div>
                                )}
                                {event.attendees && event.attendees.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    <span>{event.attendees.slice(0, 2).join(", ")}</span>
                                    {event.attendees.length > 2 && <span>+{event.attendees.length - 2} more</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <Badge className={getEventTypeColor(event.event_type)}>
                            {event.event_type}
                          </Badge>
                        </div>
                        {event.description && (
                          <p className="text-sm text-muted-foreground ml-16 mt-2">{event.description}</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No events scheduled for {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Today's Events */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Today's Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayEvents.length > 0 ? (
                <div className="space-y-3">
                  {todayEvents.map(event => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-muted/30 cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm">{event.title}</h4>
                        <Badge className={getEventTypeColor(event.event_type)} variant="secondary">
                          {event.event_type}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(event.start_date).toLocaleTimeString()}
                        </div>
                        {event.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </div>
                        )}
                        {event.attendees && event.attendees.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {event.attendees.slice(0, 2).join(", ")}
                            {event.attendees.length > 2 && ` +${event.attendees.length - 2} more`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No events scheduled for today</p>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>Upcoming Events</CardTitle>
              <CardDescription>Next 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingEvents.length > 0 ? (
                <div className="space-y-3">
                  {upcomingEvents.slice(0, 5).map(event => (
                    <div
                      key={event.id}
                      className="p-3 rounded-lg border bg-muted/30 cursor-pointer transition-colors hover:bg-muted/50"
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm">{event.title}</h4>
                        <Badge className={getEventTypeColor(event.event_type)} variant="secondary">
                          {event.event_type}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>{new Date(event.start_date).toLocaleDateString()}</div>
                        <div>{new Date(event.start_date).toLocaleTimeString()}</div>
                      </div>
                    </div>
                  ))}
                  {upcomingEvents.length > 5 && (
                    <Button variant="outline" size="sm" className="w-full">
                      View {upcomingEvents.length - 5} more
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No upcoming events</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EventViewDialog
        event={selectedEvent}
        open={showEventDialog}
        onOpenChange={setShowEventDialog}
      />
    </div>
  );
}
