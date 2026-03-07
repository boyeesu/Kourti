import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { CalendarEventWithOwner } from '@/types/calendar-sharing';
import { useUpdateCalendarEvent } from '@/hooks/useCalendar';
import { DraggableCalendarEvent } from './DraggableCalendarEvent';
import { format, parseISO, setHours, setMinutes, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

interface CalendarDragDropProviderProps {
  children: React.ReactNode;
  getEventTypeColor: (type: string) => string;
  onEventClick: (event: CalendarEventWithOwner) => void;
  currentDate: Date;
}

export function CalendarDragDropProvider({
  children,
  getEventTypeColor,
  onEventClick,
  currentDate,
}: CalendarDragDropProviderProps) {
  const [activeEvent, setActiveEvent] = useState<CalendarEventWithOwner | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const updateEvent = useUpdateCalendarEvent();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event) => {
        const { clientX, clientY } = event;
        return { x: clientX, y: clientY };
      },
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const eventData = active.data.current?.event as CalendarEventWithOwner;
    if (eventData) {
      setActiveEvent(eventData);
      setIsDragging(true);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setIsDragging(false);
      setActiveEvent(null);

      if (!over) return;

      const eventData = active.data.current?.event as CalendarEventWithOwner;
      const dropData = over.data.current;

      if (!eventData || !dropData) return;

      // Calculate new times based on drop target
      const originalStart = parseISO(eventData.start_date);
      const originalEnd = parseISO(eventData.end_date);
      const duration = differenceInMinutes(originalEnd, originalStart);

      let newStart: Date;

      if (dropData.type === 'day-slot') {
        // Dropped on a specific hour slot in day view
        const { hour, minute = 0 } = dropData;
        newStart = setMinutes(setHours(new Date(currentDate), hour), minute);
      } else if (dropData.type === 'workweek-slot') {
        // Dropped on a specific slot in work week view
        const { dayIndex, hour, minute = 0 } = dropData;
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
        newStart = new Date(weekStart);
        newStart.setDate(newStart.getDate() + dayIndex);
        newStart = setMinutes(setHours(newStart, hour), minute);
      } else if (dropData.type === 'month-day') {
        // Dropped on a day in month view - keep same time
        const { date: targetDate } = dropData;
        newStart = new Date(targetDate);
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes());
      } else {
        return;
      }

      const newEnd = new Date(newStart.getTime() + duration * 60000);

      // Update the event
      try {
        await updateEvent.mutateAsync({
          id: eventData.id,
          start_date: newStart.toISOString(),
          end_date: newEnd.toISOString(),
        });
      } catch (error) {
        console.error('Failed to reschedule event:', error);
      }
    },
    [currentDate, updateEvent]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {children}

      <DragOverlay>
        {activeEvent ? (
          <div
            className={cn(
              'p-3 rounded-lg border-2 border-primary bg-primary/10 shadow-lg',
              'pointer-events-none'
            )}
          >
            <div className="font-semibold">{activeEvent.title}</div>
            <div className="text-sm text-muted-foreground">
              {format(parseISO(activeEvent.start_date), 'h:mm a')} -{' '}
              {format(parseISO(activeEvent.end_date), 'h:mm a')}
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
