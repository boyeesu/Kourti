import { useMemo, useRef, useState } from 'react';
import { CalendarEventWithOwner } from '@/types/calendar-sharing';
import { format, isToday, startOfDay, parseISO, isSameDay, differenceInMinutes } from 'date-fns';
import { DroppableTimeSlot } from './DroppableSlots';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { QuickEventCreate } from './QuickEventCreate';

interface CalendarDayViewProps {
  date: Date;
  events: CalendarEventWithOwner[];
  onEventClick: (event: CalendarEventWithOwner) => void;
  getEventTypeColor: (type: string) => string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const SLOT_HEIGHT = 60; // pixels per hour

export function CalendarDayView({
  date,
  events,
  onEventClick,
  getEventTypeColor,
}: CalendarDayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [quickCreateSlot, setQuickCreateSlot] = useState<Date | null>(null);

  const dayEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = parseISO(event.start_date);
        const eventEnd = parseISO(event.end_date);
        const checkDate = startOfDay(date);

        return (
          isSameDay(eventStart, checkDate) ||
          isSameDay(eventEnd, checkDate) ||
          (eventStart < checkDate && eventEnd > checkDate)
        );
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  }, [events, date]);

  const currentTime = useMemo(() => {
    const now = new Date();
    if (isSameDay(date, now)) {
      return now.getHours() * 60 + now.getMinutes();
    }
    return null;
  }, [date]);

  const getEventPosition = (event: CalendarEventWithOwner) => {
    const start = parseISO(event.start_date);
    const end = parseISO(event.end_date);
    const dayStart = startOfDay(date);

    // Calculate minutes from start of day
    const startMinutes = Math.max(0, differenceInMinutes(start, dayStart));
    const endMinutes = differenceInMinutes(end, dayStart);
    const duration = Math.min(24 * 60, endMinutes) - startMinutes;

    return {
      top: startMinutes * (SLOT_HEIGHT / 60),
      height: Math.max(30, duration * (SLOT_HEIGHT / 60)), // Minimum 30px height
    };
  };

  const handleSlotClick = (hour: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const minute = Math.round((clickY / SLOT_HEIGHT) * 60);
    const slotTime = new Date(date);
    slotTime.setHours(hour, minute, 0, 0);
    setQuickCreateSlot(slotTime);
  };

  const handleQuickCreateSuccess = () => {
    setQuickCreateSlot(null);
  };

  return (
    <div className="h-[800px] border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{format(date, 'EEEE, MMMM d, yyyy')}</h3>
          {isToday(date) && (
            <span className="px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full">
              Today
            </span>
          )}
        </div>
        <div className="text-sm text-muted-foreground">{dayEvents.length} events</div>
      </div>

      {/* Time grid */}
      <div
        ref={scrollRef}
        className="relative overflow-y-auto"
        style={{ height: 'calc(100% - 65px)' }}
      >
        <div className="relative" style={{ height: `${24 * SLOT_HEIGHT}px` }}>
          {/* Current time indicator */}
          {currentTime !== null && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: `${currentTime * (SLOT_HEIGHT / 60)}px` }}
            >
              <div className="flex items-center">
                <div className="w-16 text-right pr-2">
                  <span className="text-xs font-semibold text-primary">
                    {format(new Date(), 'h:mm a')}
                  </span>
                </div>
                <div className="flex-1 h-0.5 bg-primary" />
              </div>
            </div>
          )}

          {/* Hour slots */}
          {HOURS.map((hour) => (
            <DroppableTimeSlot
              key={hour}
              hour={hour}
              className="flex border-b border-border/50 hover:bg-accent/20 transition-colors"
              style={{ height: `${SLOT_HEIGHT}px` }}
              onClick={(e) => handleSlotClick(hour, e)}
            >
              {/* Time label */}
              <div className="w-16 flex-shrink-0 border-r border-border/50 bg-muted/30">
                <div className="h-full flex items-start justify-end pr-2 pt-1">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                  </span>
                </div>
              </div>

              {/* Event area */}
              <div className="flex-1 relative">
                {/* Half-hour marker */}
                <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-border/30" />

                {/* Quick create form */}
                {quickCreateSlot && quickCreateSlot.getHours() === hour && (
                  <div
                    className="absolute left-2 right-2 z-30"
                    style={{ top: `${(quickCreateSlot.getMinutes() / 60) * 100}%` }}
                  >
                    <QuickEventCreate
                      slotTime={quickCreateSlot}
                      getEventTypeColor={getEventTypeColor}
                      onCancel={() => setQuickCreateSlot(null)}
                      onSuccess={handleQuickCreateSuccess}
                    />
                  </div>
                )}
              </div>
            </DroppableTimeSlot>
          ))}

          {/* Events */}
          {dayEvents.map((event) => {
            const position = getEventPosition(event);

            return (
              <div
                key={event.id}
                className="absolute left-20 right-4 z-10"
                style={{
                  top: `${position.top}px`,
                  height: `${position.height}px`,
                }}
              >
                <DraggableCalendarEvent
                  event={event}
                  getEventTypeColor={getEventTypeColor}
                  onClick={() => onEventClick(event)}
                  className="h-full"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
