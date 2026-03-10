import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreateCalendarEvent } from '@/hooks/useCalendar';
import { toast } from 'sonner';

interface QuickEventCreateProps {
  slotTime: Date;
  getEventTypeColor: (type: string) => string;
  onCancel: () => void;
  onSuccess: () => void;
}

export function QuickEventCreate({
  slotTime,
  getEventTypeColor,
  onCancel,
  onSuccess,
}: QuickEventCreateProps) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState('meeting');
  const inputRef = useRef<HTMLInputElement>(null);
  const createEvent = useCreateCalendarEvent();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!title.trim()) {
      onCancel();
      return;
    }

    const endTime = new Date(slotTime);
    endTime.setHours(endTime.getHours() + 1);

    try {
      await createEvent.mutateAsync({
        title: title.trim(),
        start_date: slotTime.toISOString(),
        end_date: endTime.toISOString(),
        event_type: eventType,
      });

      onSuccess();
    } catch {
      toast.error('Error', {
        description: 'Failed to create event',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Auto-detect event type from keywords
  const handleTitleChange = (value: string) => {
    setTitle(value);

    const lowerValue = value.toLowerCase();
    if (lowerValue.includes('hearing')) setEventType('hearing');
    else if (lowerValue.includes('deadline')) setEventType('deadline');
    else if (lowerValue.includes('deposition')) setEventType('deposition');
    else if (lowerValue.includes('review')) setEventType('review');
    else if (lowerValue.includes('consultation')) setEventType('consultation');
    else if (lowerValue.includes('meeting')) setEventType('meeting');
  };

  const colorClass = getEventTypeColor(eventType).split(' ')[0];

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'p-2 rounded-lg border-2 shadow-md bg-card',
        'animate-in fade-in zoom-in duration-200'
      )}
      style={{ borderColor: colorClass.replace('bg-', 'var(--').replace('500', '500)') }}
    >
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Event title..."
        className="mb-2 text-sm"
        autoComplete="off"
      />

      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          {['meeting', 'hearing', 'deadline'].map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEventType(type)}
              className={cn(
                'w-4 h-4 rounded-full transition-transform hover:scale-110',
                getEventTypeColor(type).split(' ')[0],
                eventType === type && 'ring-2 ring-offset-1 ring-foreground'
              )}
              title={type}
            />
          ))}
        </div>

        <div className="flex-1" />

        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>

        <Button
          type="submit"
          size="icon"
          className="h-7 w-7"
          disabled={!title.trim() || createEvent.isPending}
        >
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
