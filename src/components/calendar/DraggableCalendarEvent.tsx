import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { CalendarEventWithOwner } from '@/types/calendar-sharing';
import { format, parseISO } from 'date-fns';
import { Clock, GripVertical } from 'lucide-react';

interface DraggableCalendarEventProps {
  event: CalendarEventWithOwner;
  getEventTypeColor: (type: string) => string;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export function DraggableCalendarEvent({
  event,
  getEventTypeColor,
  onClick,
  style: externalStyle,
  className,
}: DraggableCalendarEventProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
  });

  const style = {
    ...externalStyle,
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  const colorClasses = getEventTypeColor(event.event_type || 'meeting').split(' ');
  const bgColor = colorClasses.find((c) => c.startsWith('bg-')) || 'bg-blue-500';
  const textColor = colorClasses.find((c) => c.startsWith('text-')) || 'text-white';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'group relative rounded-md border shadow-sm cursor-grab',
        'transition-all hover:shadow-md',
        'flex flex-col p-2 overflow-hidden',
        isDragging && 'ring-2 ring-primary z-50',
        className
      )}
      onClick={onClick}
    >
      {/* Drag handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-1 rounded-l-md opacity-50 group-hover:opacity-100',
          bgColor
        )}
      />

      {/* Grip indicator */}
      <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-3 w-3 text-muted-foreground" />
      </div>

      {/* Event content */}
      <div className="flex-1 min-w-0 pl-2 pr-4">
        <div className="flex items-start justify-between gap-1">
          <h4 className={cn('font-semibold text-sm truncate', textColor)}>{event.title}</h4>
          {event.owner_name && (
            <span className="text-xs opacity-75 truncate">{event.owner_name}</span>
          )}
        </div>

        <div className={cn('text-xs opacity-90 flex items-center gap-1 mt-0.5', textColor)}>
          <Clock className="h-3 w-3" />
          {format(parseISO(event.start_date), 'h:mm a')} -{' '}
          {format(parseISO(event.end_date), 'h:mm a')}
        </div>

        {event.location && (
          <div className={cn('text-xs opacity-75 truncate mt-0.5', textColor)}>
            {event.location}
          </div>
        )}
      </div>
    </div>
  );
}
