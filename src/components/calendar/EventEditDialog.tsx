import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarEvent } from "@/types";
import { useUpdateCalendarEvent } from "@/hooks/useCalendar";
import { useCases } from "@/hooks/useCases";
import { useClients } from "@/hooks/useClients";
import { format } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

const eventSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    start_date: z.string().min(1, "Start date is required"),
    end_date: z.string().min(1, "End date is required"),
    location: z.string().optional(),
    event_type: z.enum(["meeting", "hearing", "deadline", "deposition", "review", "consultation"]),
    case_id: z.string().optional(),
    client_id: z.string().optional(),
    attendees: z.array(z.string()).optional(),
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
        message: "End date must be after the start date",
        path: ["end_date"],
      });
    }
  });

type EventFormValues = z.infer<typeof eventSchema>;

interface EventEditDialogProps {
  event: CalendarEvent;
  open: boolean;
  onOpenChange: (open: boolean, wasUpdated?: boolean) => void;
}

export function EventEditDialog({ event, open, onOpenChange }: EventEditDialogProps) {
  const updateEvent = useUpdateCalendarEvent();
  const { data: casesData } = useCases();
  const { data: clientsData } = useClients();
  const [newAttendee, setNewAttendee] = useState("");

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event.title,
      description: event.description || "",
      start_date: format(new Date(event.start_date), "yyyy-MM-dd'T'HH:mm"),
      end_date: format(new Date(event.end_date), "yyyy-MM-dd'T'HH:mm"),
      location: event.location || "",
      event_type: event.event_type,
      case_id: event.case_id || "none",
      client_id: event.client_id || "none",
      attendees: event.attendees || [],
    },
  });

  const startDateValue = form.watch("start_date");
  const previousStartDateRef = useRef(startDateValue);

  useEffect(() => {
    if (previousStartDateRef.current === startDateValue) {
      return;
    }

    previousStartDateRef.current = startDateValue;

    const startFieldState = form.getFieldState("start_date");
    const endFieldState = form.getFieldState("end_date");

    if (!startFieldState.isDirty) {
      return;
    }

    if (!startDateValue) {
      if (!endFieldState.isDirty) {
        form.setValue("end_date", "", { shouldDirty: false, shouldValidate: true });
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
    form.setValue("end_date", formattedEnd, { shouldDirty: false, shouldValidate: true });
  }, [startDateValue, form]);

  const onSubmit = async (data: EventFormValues) => {
    try {
      // Clean up the data - convert 'none' back to undefined/null
      const cleanedData = {
        ...data,
        case_id: data.case_id === 'none' ? undefined : data.case_id,
        client_id: data.client_id === 'none' ? undefined : data.client_id,
      };
      
      await updateEvent.mutateAsync({
        id: event.id,
        ...cleanedData,
      });
      onOpenChange(false, true); // Pass true to indicate successful update
    } catch (error) {
      // Error is handled by the mutation's onError callback
    }
  };

  const addAttendee = () => {
    if (newAttendee.trim()) {
      const currentAttendees = form.getValues("attendees") || [];
      form.setValue("attendees", [...currentAttendees, newAttendee.trim()]);
      setNewAttendee("");
    }
  };

  const removeAttendee = (index: number) => {
    const currentAttendees = form.getValues("attendees") || [];
    form.setValue("attendees", currentAttendees.filter((_, i) => i !== index));
  };

  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>
            Update the event details below.
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a case" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No case</SelectItem>
                        {cases.map((case_) => (
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No client</SelectItem>
                        {clients.map((client) => (
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

            {/* Attendees Section */}
            <div className="space-y-3">
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
                {(form.watch("attendees") || []).map((attendee, index) => (
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
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateEvent.isPending}>
                {updateEvent.isPending ? "Updating..." : "Update Event"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}