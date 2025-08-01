import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users
} from "lucide-react";

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Sample events data
  const events = [
    {
      id: 1,
      title: "Client Meeting - Smith Case",
      time: "10:00 AM - 11:30 AM",
      date: "2024-01-29",
      type: "Meeting",
      location: "Conference Room A",
      attendees: ["Sarah Wilson", "John Smith"],
      case: "CASE-001"
    },
    {
      id: 2,
      title: "Contract Review Deadline",
      time: "5:00 PM",
      date: "2024-01-30",
      type: "Deadline",
      location: "N/A",
      attendees: [],
      case: "CASE-002"
    },
    {
      id: 3,
      title: "Court Hearing - Johnson Case",
      time: "2:00 PM - 4:00 PM",
      date: "2024-02-15",
      type: "Hearing",
      location: "Superior Court, Room 205",
      attendees: ["Michael Chen", "David Rodriguez"],
      case: "CASE-001"
    },
    {
      id: 4,
      title: "Deposition - Williams Case",
      time: "9:00 AM - 12:00 PM",
      date: "2024-02-01",
      type: "Deposition",
      location: "Law Office - Conference Room B",
      attendees: ["Jessica Thompson", "Robert Williams"],
      case: "CASE-003"
    },
    {
      id: 5,
      title: "Document Review Session",
      time: "1:00 PM - 3:00 PM",
      date: "2024-01-31",
      type: "Review",
      location: "Office",
      attendees: ["Sarah Wilson"],
      case: "CASE-005"
    }
  ];

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case "Meeting": return "bg-primary text-primary-foreground";
      case "Hearing": return "bg-destructive text-destructive-foreground";
      case "Deadline": return "bg-warning text-warning-foreground";
      case "Deposition": return "bg-success text-success-foreground";
      case "Review": return "bg-muted text-muted-foreground";
      default: return "bg-muted text-muted-foreground";
    }
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
    const lastDay = new Date(year, month + 1, 0);
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
    return events.filter(event => event.date === dateStr);
  };

  const todayEvents = events.filter(event => {
    const today = new Date().toISOString().split('T')[0];
    return event.date === today;
  });

  const upcomingEvents = events.filter(event => {
    const today = new Date();
    const eventDate = new Date(event.date);
    const diffTime = eventDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 7;
  });

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
          <p className="text-muted-foreground">Schedule and manage your legal events</p>
        </div>
        <Button className="shadow-md">
          <Plus className="h-4 w-4 mr-2" />
          New Event
        </Button>
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
                      <div className={`text-sm font-medium mb-1 ${
                        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 2).map(event => (
                          <div
                            key={event.id}
                            className={`text-xs p-1 rounded truncate ${getEventTypeColor(event.type)}`}
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
                    <div key={event.id} className="p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm">{event.title}</h4>
                        <Badge className={getEventTypeColor(event.type)} variant="secondary">
                          {event.type}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.time}
                        </div>
                        {event.location !== "N/A" && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </div>
                        )}
                        {event.attendees.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {event.attendees.join(", ")}
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
                    <div key={event.id} className="p-3 rounded-lg border bg-muted/30">
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-sm">{event.title}</h4>
                        <Badge className={getEventTypeColor(event.type)} variant="secondary">
                          {event.type}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <div>{new Date(event.date).toLocaleDateString()}</div>
                        <div>{event.time}</div>
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
    </div>
  );
}