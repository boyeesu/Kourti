import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useCreateCalendarEvent } from "@/hooks/useCalendar";
import { useCases } from "@/hooks/useCases";
import { useClients } from "@/hooks/useClients";

const eventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
  location: z.string().optional(),
  event_type: z.enum(["meeting", "hearing", "deadline", "deposition", "review", "consultation"]),
  case_id: z.string().optional(),
  client_id: z.string().optional(),
  attendees: z.array(z.string()).optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

interface EventCreateDialogProps {
  children?: React.ReactNode;
}

export function EventCreateDialog({ children }: EventCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [newAttendee, setNewAttendee] = useState("");
  const createEvent = useCreateCalendarEvent();
  const { data: casesData } = useCases();
  const { data: clientsData } = useClients();

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      description: "",
      start_date: "",
      end_date: "",
      location: "",
      event_type: "meeting",
      case_id: "",
      client_id: "",
      attendees: [],
    },
  });

  const cases = Array.isArray(casesData) ? casesData : casesData?.cases || [];
  const clients = Array.isArray(clientsData) ? clientsData : clientsData?.items || [];

  // Watch for case selection changes to auto-populate client
  const selectedCaseId = form.watch("case_id");
  
  // Auto-populate client when case is selected
  useEffect(() => {
    if (selectedCaseId && selectedCaseId !== 'none') {
      const selectedCase = cases.find((c: any) => c.id === selectedCaseId);
      if (selectedCase?.client_id) {
        form.setValue("client_id", selectedCase.client_id);
      }
    }
  }, [selectedCaseId, cases, form]);

  const onSubmit = async (data: EventFormValues) => {
    // Convert 'none' to undefined/null for case_id and client_id
    const payload = {
      ...data,
      case_id: data.case_id === 'none' ? undefined : data.case_id,
      client_id: data.client_id === 'none' ? undefined : data.client_id,
    };
    try {
      await createEvent.mutateAsync(payload);
      form.reset();
      setOpen(false);
    } catch (error) {
      console.error("Failed to create event:", error);
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
                        {cases.map((case_: any) => (
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
                        {clients.map((client: any) => (
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}