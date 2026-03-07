import { useState, useEffect, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, X, Repeat, Bell } from 'lucide-react';
import { useCreateCalendarEvent } from '@/hooks/useCalendar';
import { useCases } from '@/hooks/useCases';
import { useClients } from '@/hooks/useClients';
import { Case, Client } from '@/types';
import { CreateCalendarEventData } from '@/hooks/useCalendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

const eventSchema = z
  .object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    location: z.string().optional(),
    event_type: z.enum(['meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation']),
    case_id: z.string().optional(),
    client_id: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    is_recurring: z.boolean().optional(),
    recurrence_frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
    recurrence_interval: z.number().min(1).optional(),
    recurrence_end_date: z.string().optional(),
    reminders: z
      .array(
        z.object({
          minutes: z.number().min(0),
          method: z.enum(['in_app', 'email', 'both']),
        })
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.start_date || !data.end_date) {
      return;
    }

    const start = new Date(data.start_date);
    const end = new Date(data.end_date);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return;
    }

    if (end <= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be after the start date',
        path: ['end_date'],
      });
    }

    if (data.is_recurring && !data.recurrence_frequency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Recurrence frequency is required for recurring events',
        path: ['recurrence_frequency'],
      });
    }

    if (data.is_recurring && data.recurrence_end_date) {
      const recurrenceEnd = new Date(data.recurrence_end_date);
      if (recurrenceEnd <= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Recurrence end date must be after start date',
          path: ['recurrence_end_date'],
        });
      }
    }
  });

type EventFormValues = z.infer<typeof eventSchema>;

interface EventCreateDialogProps {
  children?: React.ReactNode;
  defaultDate?: Date;
  defaultEventType?: string;
  initialDate?: Date;
  initialDuration?: number;
  initialAttendees?: string[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EventCreateDialog({
  children,
  defaultDate,
  defaultEventType = 'meeting',
  initialDate,
  initialDuration = 60,
  initialAttendees = [],
  open: controlledOpen,
  onOpenChange,
}: EventCreateDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;
  const [newAttendee, setNewAttendee] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [reminders, setReminders] = useState<
    Array<{ minutes: number; method: 'in_app' | 'email' | 'both' }>
  >([]);
  const createEvent = useCreateCalendarEvent();
  const { data: casesData } = useCases();
  const { data: clientsData } = useClients();

  const getDefaultStartDate = () => {
    const dateToUse = initialDate || defaultDate;
    if (dateToUse) {
      return format(dateToUse, "yyyy-MM-dd'T'HH:mm");
    }
    const now = new Date();
    now.setMinutes(0);
    now.setSeconds(0);
    return format(now, "yyyy-MM-dd'T'HH:mm");
  };

  const getDefaultEndDate = () => {
    const dateToUse = initialDate || defaultDate;
    if (dateToUse) {
      const end = new Date(dateToUse);
      if (initialDuration) {
        end.setMinutes(end.getMinutes() + initialDuration);
      } else {
        end.setHours(end.getHours() + 1);
      }
      return format(end, "yyyy-MM-dd'T'HH:mm");
    }
    const now = new Date();
    if (initialDuration) {
      now.setMinutes(now.getMinutes() + initialDuration);
    } else {
      now.setHours(now.getHours() + 1);
    }
    now.setSeconds(0);
    return format(now, "yyyy-MM-dd'T'HH:mm");
  };

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      description: '',
      start_date: getDefaultStartDate(),
      end_date: getDefaultEndDate(),
      location: '',
      event_type: defaultEventType as
        | 'meeting'
        | 'hearing'
        | 'deadline'
        | 'deposition'
        | 'review'
        | 'consultation',
      case_id: '',
      client_id: '',
      attendees: initialAttendees || [],
      is_recurring: false,
      recurrence_frequency: 'weekly',
      recurrence_interval: 1,
      reminders: [],
    },
  });

  const cases = useMemo(
    () => (Array.isArray(casesData) ? casesData : casesData?.cases || []),
    [casesData]
  );
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items || [];

  // Reset form when dialog opens with new initial values
  useEffect(() => {
    if (open) {
      form.reset({
        title: '',
        description: '',
        start_date: getDefaultStartDate(),
        end_date: getDefaultEndDate(),
        location: '',
        event_type: defaultEventType as
          | 'meeting'
          | 'hearing'
          | 'deadline'
          | 'deposition'
          | 'review'
          | 'consultation',
        case_id: '',
        client_id: '',
        attendees: initialAttendees || [],
        is_recurring: false,
        recurrence_frequency: 'weekly',
        recurrence_interval: 1,
        reminders: [],
      });
      setReminders([]);
      setIsRecurring(false);
      setNewAttendee('');
    }
  }, [open, initialDate, initialDuration, initialAttendees]);

  const startDateValue = form.watch('start_date');
  const previousStartDateRef = useRef(startDateValue);

  useEffect(() => {
    if (previousStartDateRef.current === startDateValue) {
      return;
    }

    previousStartDateRef.current = startDateValue;

    const startFieldState = form.getFieldState('start_date');
    const endFieldState = form.getFieldState('end_date');

    if (!startFieldState.isDirty) {
      return;
    }

    if (!startDateValue) {
      if (!endFieldState.isDirty) {
        form.setValue('end_date', '', { shouldDirty: false, shouldValidate: true });
      }
      return;
    }

    if (endFieldState.isDirty) {
      return;
    }

    const start = new Date(startDateValue);
    if (Number.isNaN(start.getTime())) {
      return;
    }

    const autoEnd = new Date(start.getTime() + 60 * 60 * 1000);
    const formattedEnd = format(autoEnd, "yyyy-MM-dd'T'HH:mm");
    form.setValue('end_date', formattedEnd, { shouldDirty: false, shouldValidate: true });
  }, [startDateValue, form]);

  // Watch for case selection changes to auto-populate client
  const selectedCaseId = form.watch('case_id');

  // Auto-populate client when case is selected
  useEffect(() => {
    if (selectedCaseId && selectedCaseId !== 'none') {
      const selectedCase = cases.find((c: Case) => c.id === selectedCaseId);
      if (selectedCase?.client_id) {
        form.setValue('client_id', selectedCase.client_id);
      }
    }
  }, [selectedCaseId, cases, form]);

  const onSubmit = async (data: EventFormValues) => {
    // Build payload with ONLY fields that exist in calendar_events table
    // Database fields: title, description, start_date, end_date, location, attendees,
    // event_type, case_id, client_id, is_recurring, recurrence_pattern, recurrence_end_date
    const payload: CreateCalendarEventData = {
      title: data.title,
      description: data.description || undefined,
      start_date: data.start_date,
      end_date: data.end_date,
      location: data.location || undefined,
      attendees: data.attendees && data.attendees.length > 0 ? data.attendees : undefined,
      event_type: data.event_type,
      case_id: data.case_id === 'none' ? undefined : data.case_id,
      client_id: data.client_id === 'none' ? undefined : data.client_id,
    };

    // Add recurring event fields ONLY if recurring is enabled
    // These map to: is_recurring (boolean), recurrence_pattern (jsonb), recurrence_end_date (timestamptz)
    if (data.is_recurring && data.recurrence_frequency) {
      payload.is_recurring = true;
      payload.recurrence_pattern = {
        frequency: data.recurrence_frequency,
        interval: data.recurrence_interval || 1,
      };
      if (data.recurrence_end_date) {
        payload.recurrence_end_date = data.recurrence_end_date;
      }
    }

    // Reminders are stored in separate event_reminders table (not in calendar_events)
    // Store reminders separately to create after event creation
    const remindersToCreate = data.reminders || [];

    try {
      const event = await createEvent.mutateAsync(payload);

      // Create reminders if any
      if (remindersToCreate.length > 0 && event?.id) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (profile?.organization_id) {
          for (const reminder of remindersToCreate) {
            // @ts-expect-error - Table not in generated types yet
            await supabase.from('event_reminders').insert({
              event_id: event.id,
              user_id: user.id,
              organization_id: profile.organization_id,
              reminder_type: reminder.minutes > 0 ? 'before' : 'at',
              reminder_minutes: reminder.minutes,
              notification_method: reminder.method,
            });
          }
        }
      }

      form.reset();
      setIsRecurring(false);
      setReminders([]);
      setOpen(false);
    } catch (error) {
      console.error('Failed to create event:', error);
      // The useCreateCalendarEvent hook should already show a toast with error details
      // Log additional details for debugging
      console.error('Event creation error details:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        payload,
      });
    }
  };

  const addAttendee = () => {
    if (newAttendee.trim()) {
      const currentAttendees = form.getValues('attendees') || [];
      form.setValue('attendees', [...currentAttendees, newAttendee.trim()]);
      setNewAttendee('');
    }
  };

  const removeAttendee = (index: number) => {
    const currentAttendees = form.getValues('attendees') || [];
    form.setValue(
      'attendees',
      currentAttendees.filter((_, i) => i !== index)
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button className="shadow-md">
            <Plus className="h-4 w-4 mr-2" />
            New Event
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
          <DialogDescription>
            Schedule a new calendar event and optionally link it to a case or client.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter event title" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="event_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select event type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="hearing">Hearing</SelectItem>
                      <SelectItem value="deadline">Deadline</SelectItem>
                      <SelectItem value="deposition">Deposition</SelectItem>
                      <SelectItem value="review">Review</SelectItem>
                      <SelectItem value="consultation">Consultation</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Enter event description" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date & Time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter event location" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="case_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Case</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a case" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No case</SelectItem>
                        {cases.map((case_: Case) => (
                          <SelectItem key={case_.id} value={case_.id}>
                            {case_.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Client</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {clients.map((client: Client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Recurring Events Section */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_recurring"
                  checked={isRecurring}
                  onCheckedChange={(checked) => {
                    setIsRecurring(checked as boolean);
                    form.setValue('is_recurring', checked as boolean);
                  }}
                />
                <Label htmlFor="is_recurring" className="flex items-center gap-2 cursor-pointer">
                  <Repeat className="h-4 w-4" />
                  Recurring Event
                </Label>
              </div>
              {isRecurring && (
                <div className="pl-6 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="recurrence_frequency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Frequency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="recurrence_interval"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repeat Every</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="recurrence_end_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date (Optional)</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>

            {/* Reminders Section - Stored in separate event_reminders table */}
            <div className="space-y-3 border-t pt-4">
              <Label className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Reminders
              </Label>
              <div className="space-y-2">
                {[15, 30, 60, 1440].map((minutes) => {
                  const reminder = reminders.find((r) => r.minutes === minutes);
                  const label =
                    minutes < 60
                      ? `${minutes} minutes before`
                      : minutes === 60
                        ? '1 hour before'
                        : '1 day before';

                  return (
                    <div key={minutes} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`reminder-${minutes}`}
                          checked={!!reminder}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setReminders([...reminders, { minutes, method: 'both' }]);
                              form.setValue('reminders', [
                                ...reminders,
                                { minutes, method: 'both' },
                              ]);
                            } else {
                              const updated = reminders.filter((r) => r.minutes !== minutes);
                              setReminders(updated);
                              form.setValue('reminders', updated);
                            }
                          }}
                        />
                        <Label htmlFor={`reminder-${minutes}`} className="cursor-pointer">
                          {label}
                        </Label>
                      </div>
                      {reminder && (
                        <Select
                          value={reminder.method}
                          onValueChange={(value: 'in_app' | 'email' | 'both') => {
                            const updated = reminders.map((r) =>
                              r.minutes === minutes ? { ...r, method: value } : r
                            );
                            setReminders(updated);
                            form.setValue('reminders', updated);
                          }}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="in_app">In-App</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="both">Both</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Attendees Section */}
            <div className="space-y-3 border-t pt-4">
              <FormLabel>Attendees</FormLabel>
              <div className="flex gap-2">
                <Input
                  placeholder="Add team member email"
                  value={newAttendee}
                  onChange={(e) => setNewAttendee(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addAttendee())}
                />
                <Button type="button" onClick={addAttendee} variant="outline">
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(form.watch('attendees') || []).map((attendee, index) => (
                  <Badge key={index} variant="secondary" className="gap-1">
                    {attendee}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => removeAttendee(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? 'Creating...' : 'Create Event'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
