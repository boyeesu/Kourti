import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';

interface DroppableTimeSlotProps {
  hour: number;
  minute?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function DroppableTimeSlot({
  hour,
  minute = 0,
  children,
  className,
  onClick,
}: DroppableTimeSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${hour}-${minute}`,
    data: { type: 'day-slot', hour, minute },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'relative transition-colors',
        isOver && 'bg-primary/20 ring-2 ring-primary ring-inset',
        className
      )}
    >
      {children}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
            Drop here
          </span>
        </div>
      )}
    </div>
  );
}

interface DroppableWorkWeekSlotProps {
  dayIndex: number;
  hour: number;
  minute?: number;
  children?: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export function DroppableWorkWeekSlot({
  dayIndex,
  hour,
  minute = 0,
  children,
  className,
  onClick,
}: DroppableWorkWeekSlotProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `workweek-slot-${dayIndex}-${hour}-${minute}`,
    data: { type: 'workweek-slot', dayIndex, hour, minute },
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'relative transition-colors',
        isOver && 'bg-primary/20 ring-2 ring-primary ring-inset',
        className
      )}
    >
      {children}
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded">
            Drop
          </span>
        </div>
      )}
    </div>
  );
}

interface DroppableMonthDayProps {
  date: Date;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
  isCurrentMonth?: boolean;
}

export function DroppableMonthDay({
  date,
  children,
  className,
  onClick,
  isCurrentMonth = true,
}: DroppableMonthDayProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `month-day-${date.toISOString()}`,
    data: { type: 'month-day', date },
    disabled: !isCurrentMonth,
  });

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'relative transition-all',
        isOver && isCurrentMonth && 'bg-primary/20 ring-2 ring-primary z-10',
        !isCurrentMonth && 'opacity-50',
        className
      )}
    >
      {children}
      {isOver && isCurrentMonth && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center pointer-events-none pb-1">
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
            Move here
          </span>
        </div>
      )}
    </div>
  );
}
