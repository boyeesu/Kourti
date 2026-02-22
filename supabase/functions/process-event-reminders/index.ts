// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EventReminder {
  id: string;
  event_id: string;
  user_id: string;
  organization_id: string;
  reminder_type: 'before' | 'at';
  reminder_minutes: number;
  notification_method: 'in_app' | 'email' | 'both';
  sent: boolean;
  event: {
    id: string;
    title: string;
    description: string | null;
    start_date: string;
    end_date: string;
    location: string | null;
    event_type: string | null;
  };
}

const handler = async (req: Request): Promise<Response> => {
  console.log("process-event-reminders function invoked");

  // Handle CORS for testing
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // Query all unsent reminders with their associated events
    const { data: reminders, error: queryError } = await supabase
      .from('event_reminders')
      .select(`
        id,
        event_id,
        user_id,
        organization_id,
        reminder_type,
        reminder_minutes,
        notification_method,
        sent,
        calendar_events!inner (
          id,
          title,
          description,
          start_date,
          end_date,
          location,
          event_type
        )
      `)
      .eq('sent', false);

    if (queryError) {
      console.error("Error querying reminders:", queryError);
      const errorResponse = {
        success: false,
        error: "Failed to query reminders",
        message: queryError.message,
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (!reminders || reminders.length === 0) {
      console.log("No unsent reminders found");
      const response = {
        success: true,
        processed: 0,
        message: "No reminders to process",
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log(`Found ${reminders.length} unsent reminders`);

    const dueReminders: EventReminder[] = [];
    const processedIds: string[] = [];
    const errors: string[] = [];

    // Calculate which reminders are due
    for (const reminder of reminders) {
      const event = reminder.calendar_events as any;
      if (!event || !event.start_date) {
        console.warn(`Reminder ${reminder.id} has invalid or missing event data - marking as sent`);
        // Mark as sent to avoid repeated processing
        await supabase
          .from('event_reminders')
          .update({ sent: true, sent_at: nowISO })
          .eq('id', reminder.id);
        continue;
      }

      const eventStart = new Date(event.start_date);
      let reminderTime: Date;

      if (reminder.reminder_type === 'before') {
        // Calculate reminder time: event start - reminder_minutes
        reminderTime = new Date(eventStart.getTime() - reminder.reminder_minutes * 60 * 1000);
      } else {
        // 'at' type: reminder time is the event start time
        reminderTime = eventStart;
      }

      // Skip if event has already passed (more than 5 minutes ago)
      const eventEnd = new Date(event.end_date);
      if (eventEnd.getTime() < now.getTime() - 5 * 60 * 1000) {
        console.log(`Skipping reminder ${reminder.id} - event has already ended`);
        // Mark as sent to avoid processing again
        await supabase
          .from('event_reminders')
          .update({ sent: true, sent_at: nowISO })
          .eq('id', reminder.id);
        continue;
      }

      // Check if reminder time has arrived (with 1 minute buffer to account for cron timing)
      const timeDiff = reminderTime.getTime() - now.getTime();
      const oneMinuteInMs = 60 * 1000;

      if (timeDiff <= oneMinuteInMs && timeDiff >= -oneMinuteInMs) {
        // Reminder is due (within 1 minute window)
        dueReminders.push({
          id: reminder.id,
          event_id: reminder.event_id,
          user_id: reminder.user_id,
          organization_id: reminder.organization_id,
          reminder_type: reminder.reminder_type,
          reminder_minutes: reminder.reminder_minutes,
          notification_method: reminder.notification_method,
          sent: reminder.sent,
          event: {
            id: event.id,
            title: event.title,
            description: event.description,
            start_date: event.start_date,
            end_date: event.end_date,
            location: event.location,
            event_type: event.event_type,
          },
        });
      }
    }

    console.log(`Found ${dueReminders.length} due reminders`);

    // Process each due reminder
    for (const reminder of dueReminders) {
      try {
        const eventStart = new Date(reminder.event.start_date);
        const eventEnd = new Date(reminder.event.end_date);
        const formatTime = (date: Date) => date.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        const timeString = reminder.reminder_type === 'before'
          ? `${reminder.reminder_minutes} minute${reminder.reminder_minutes !== 1 ? 's' : ''} before`
          : 'at';

        const title = `Calendar Reminder: ${reminder.event.title}`;
        const message = `Event "${reminder.event.title}" ${timeString}.\n\n` +
          `Start: ${formatTime(eventStart)}\n` +
          `End: ${formatTime(eventEnd)}\n` +
          (reminder.event.location ? `Location: ${reminder.event.location}\n` : '') +
          (reminder.event.description ? `\n${reminder.event.description}` : '');

        // Create in-app notification
        if (reminder.notification_method === 'in_app' || reminder.notification_method === 'both') {
          const { error: notifError } = await supabase
            .from('notifications')
            .insert({
              user_id: reminder.user_id,
              organization_id: reminder.organization_id,
              title,
              description: message,
              type: 'calendar',
              status: 'unread',
            });

          if (notifError) {
            console.error(`Failed to create in-app notification for reminder ${reminder.id}:`, notifError);
            errors.push(`In-app notification failed for reminder ${reminder.id}`);
          } else {
            console.log(`Created in-app notification for reminder ${reminder.id}`);
          }
        }

        // Send email notification
        if (reminder.notification_method === 'email' || reminder.notification_method === 'both') {
          const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
            body: {
              type: 'calendar_reminder',
              recipientUserId: reminder.user_id,
              title,
              message,
              actionUrl: `/calendar?event=${reminder.event_id}`,
              actionText: 'View Event',
              metadata: {
                event_id: reminder.event_id,
                reminder_id: reminder.id,
                reminder_type: reminder.reminder_type,
                reminder_minutes: reminder.reminder_minutes,
              },
            },
          });

          if (emailError) {
            console.error(`Failed to send email for reminder ${reminder.id}:`, emailError);
            errors.push(`Email notification failed for reminder ${reminder.id}`);
          } else {
            console.log(`Sent email notification for reminder ${reminder.id}`);
          }
        }

        // Mark reminder as sent
        const { error: updateError } = await supabase
          .from('event_reminders')
          .update({
            sent: true,
            sent_at: nowISO,
          })
          .eq('id', reminder.id);

        if (updateError) {
          console.error(`Failed to mark reminder ${reminder.id} as sent:`, updateError);
          errors.push(`Failed to mark reminder ${reminder.id} as sent`);
        } else {
          processedIds.push(reminder.id);
          console.log(`Marked reminder ${reminder.id} as sent`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`Error processing reminder ${reminder.id}:`, errorMsg);
        errors.push(`Error processing reminder ${reminder.id}: ${errorMsg}`);
      }
    }

    const response = {
      success: true,
      processed: processedIds.length,
      totalDue: dueReminders.length,
      totalChecked: reminders.length,
      processedIds,
      errors: errors.length > 0 ? errors : undefined,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Unexpected error in process-event-reminders:", errorMsg);
    const errorResponse = {
      success: false,
      error: "Unexpected error processing reminders",
      message: errorMsg,
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};

serve(handler);
