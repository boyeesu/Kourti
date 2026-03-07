import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { CalendarEventWithOwner } from '@/types/calendar-sharing';
import {
  format,
  isToday,
  startOfWeek,
  addDays,
  parseISO,
  isSameDay,
  differenceInMinutes,
} from 'date-fns';
import { Clock } from 'lucide-react';
import { DroppableWorkWeekSlot } from './DroppableSlots';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { QuickEventCreate } from './QuickEventCreate';

interface CalendarWorkWeekViewProps {
  date: Date;
  events: CalendarEventWithOwner[];
  onEventClick: (event: CalendarEventWithOwner) => void;
  getEventTypeColor: (type: string) => string;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8 AM to 8 PM
const SLOT_HEIGHT = 50; // pixels per hour
const HEADER_HEIGHT = 60;

export function CalendarWorkWeekView({
  date,
  events,
  onEventClick,
  getEventTypeColor,
}: CalendarWorkWeekViewProps) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const [quickCreateSlot, setQuickCreateSlot] = useState<{ dayIndex: number; time: Date } | null>(
    null
  );

  const currentTime = useMemo(() => {
    const now = new Date();
    const todayIndex = weekDays.findIndex((day) => isSameDay(day, now));
    if (todayIndex !== -1) {
      return {
        dayIndex: todayIndex,
        minutes: now.getHours() * 60 + now.getMinutes(),
      };
    }
    return null;
  }, [weekDays]);

  const getDayEvents = (day: Date) => {
    return events
      .filter((event) => {
        const eventStart = parseISO(event.start_date);
        const eventEnd = parseISO(event.end_date);
        const checkDate = new Date(day);
        checkDate.setHours(0, 0, 0, 0);

        return (
          isSameDay(eventStart, checkDate) ||
          isSameDay(eventEnd, checkDate) ||
          (eventStart < checkDate && eventEnd > checkDate)
        );
      })
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  };

  const getEventPosition = (event: CalendarEventWithOwner, day: Date) => {
    const start = parseISO(event.start_date);
    const end = parseISO(event.end_date);
    const workDayStart = new Date(day);
    workDayStart.setHours(8, 0, 0, 0);

    // Calculate position relative to work day start (8 AM)
    const startMinutesFromWorkDay = differenceInMinutes(start, workDayStart);
    const endMinutesFromWorkDay = differenceInMinutes(end, workDayStart);

    // If event starts before 8 AM, show it at the top
    const displayStart = Math.max(0, startMinutesFromWorkDay);
    const displayEnd = Math.min(13 * 60, endMinutesFromWorkDay); // Cap at 8 PM

    return {
      top: displayStart * (SLOT_HEIGHT / 60),
      height: Math.max(20, (displayEnd - displayStart) * (SLOT_HEIGHT / 60)),
    };
  };

  const handleSlotClick = (dayIndex: number, hour: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const minute = Math.round((clickY / SLOT_HEIGHT) * 60);
    const slotTime = new Date(weekDays[dayIndex]);
    slotTime.setHours(hour, minute, 0, 0);
    setQuickCreateSlot({ dayIndex, time: slotTime });
  };

  return (
    <div className="h-[800px] border rounded-lg overflow-hidden bg-card flex flex-col">
      {/* Header with day labels */}
      <div className="flex border-b bg-muted/50" style={{ height: `${HEADER_HEIGHT}px` }}>
        {/* Time column header */}
        <div className="w-16 flex-shrink-0 border-r border-border/50" />

        {/* Day headers */}
        {weekDays.map((day, index) => (
          <div
            key={index}
            className={cn(
              'flex-1 border-r border-border/50 flex flex-col items-center justify-center p-2',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <div
              className={cn(
                'text-sm font-medium',
                isToday(day) ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {format(day, 'EEE')}
            </div>
            <div className={cn('text-lg font-bold', isToday(day) && 'text-primary')}>
              {format(day, 'd')}
            </div>
            {isToday(day) && <div className="w-6 h-1 bg-primary rounded-full mt-1" />}
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto relative">
        <div className="flex relative">
          {/* Time labels column */}
          <div className="w-16 flex-shrink-0 border-r border-border/50 bg-muted/30 sticky left-0 z-10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="flex items-start justify-end pr-2 border-b border-border/30"
                style={{ height: `${SLOT_HEIGHT}px` }}
              >
                <span className="text-xs text-muted-foreground -mt-2">
                  {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex flex-1">
            {weekDays.map((day, dayIndex) => {
              const dayEvents = getDayEvents(day);

              return (
                <div
                  key={dayIndex}
                  className={cn(
                    'flex-1 border-r border-border/50 relative',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  {/* Hour slots */}
                  {HOURS.map((hour) => (
                    <DroppableWorkWeekSlot
                      key={hour}
                      dayIndex={dayIndex}
                      hour={hour}
                      className="border-b border-border/30 hover:bg-accent/20 transition-colors cursor-pointer"
                      style={{ height: `${SLOT_HEIGHT}px` }}
                      onClick={(e) => handleSlotClick(dayIndex, hour, e)}
                    >
                      {/* Half-hour marker */}
                      <div className="h-1/2 border-b border-dashed border-border/20" />

                      {/* Quick create form */}
                      {quickCreateSlot &&
                        quickCreateSlot.dayIndex === dayIndex &&
                        quickCreateSlot.time.getHours() === hour && (
                          <div
                            className="absolute left-1 right-1 z-30"
                            style={{ top: `${(quickCreateSlot.time.getMinutes() / 60) * 100}%` }}
                          >
                            <QuickEventCreate
                              slotTime={quickCreateSlot.time}
                              getEventTypeColor={getEventTypeColor}
                              onCancel={() => setQuickCreateSlot(null)}
                              onSuccess={() => setQuickCreateSlot(null)}
                            />
                          </div>
                        )}
                    </DroppableWorkWeekSlot>
                  ))}

                  {/* Current time indicator */}
                  {currentTime?.dayIndex === dayIndex && (
                    <div
                      className="absolute left-0 right-0 z-20 pointer-events-none"
                      style={{
                        top: `${(currentTime.minutes - 8 * 60) * (SLOT_HEIGHT / 60)}px`,
                      }}
                    >
                      <div className="flex items-center">
                        <div className="w-2 h-2 bg-primary rounded-full" />
                        <div className="flex-1 h-0.5 bg-primary" />
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {dayEvents.map((event) => {
                    const position = getEventPosition(event, day);

                    return (
                      <div
                        key={event.id}
                        className="absolute left-1 right-1 z-10"
                        style={{
                          top: `${position.top}px`,
                          height: `${position.height}px`,
                        }}
                      >
                        <DraggableCalendarEvent
                          event={event}
                          getEventTypeColor={getEventTypeColor}
                          onClick={() => onEventClick(event)}
                          className="h-full text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
