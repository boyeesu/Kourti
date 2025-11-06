import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore - Deno runtime import
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
  allowCredentials: true,
};

interface CalendarReminderRequest {
  eventId: string;
  reminderType: 'day_before' | 'hour_before' | 'custom';
  customMinutesBefore?: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return createJsonResponse(
        { error: 'Email service not configured' },
        { status: 503, cors: corsOptions }
      );
    }

    const body: CalendarReminderRequest = await req.json();
    const { eventId, reminderType, customMinutesBefore } = body;

    if (!eventId) {
      return createJsonResponse(
        { error: 'Event ID is required' },
        { status: 400, cors: corsOptions }
      );
    }

    // Fetch event details
    const { data: event, error: eventError } = await supabase
      .from('calendar_events')
      .select(`
        id,
        title,
        description,
        start_date,
        end_date,
        location,
        attendees,
        event_type,
        created_by,
        case_id,
        client_id,
        organization_id
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      console.error('Event not found:', eventError);
      return createJsonResponse(
        { error: 'Event not found' },
        { status: 404, cors: corsOptions }
      );
    }

    // Get all users who should receive reminder
    const recipientUserIds: string[] = [];
    
    // Add event creator
    if (event.created_by) {
      recipientUserIds.push(event.created_by);
    }

    // Get organization users with calendar permissions
    const { data: orgUsers, error: orgUsersError } = await supabase
      .from('profiles')
      .select('user_id, email, first_name, last_name')
      .eq('organization_id', event.organization_id);

    if (orgUsersError) {
      console.error('Error fetching organization users:', orgUsersError);
    }

    // Send email to each recipient
    const emailPromises = (orgUsers || []).map(async (user: any) => {
      if (!user.email) return null;

      const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
      const eventDate = new Date(event.start_date);
      const formattedDate = eventDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = eventDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      let reminderText = '';
      if (reminderType === 'day_before') {
        reminderText = 'This is your reminder for an event tomorrow.';
      } else if (reminderType === 'hour_before') {
        reminderText = 'This is your reminder for an event in 1 hour.';
      } else if (customMinutesBefore) {
        reminderText = `This is your reminder for an event in ${customMinutesBefore} minutes.`;
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0;">Calendar Event Reminder</h1>
          </div>
          <div style="padding: 30px; background-color: #f7f7f7;">
            <p style="font-size: 16px; color: #333;">Hello ${userName},</p>
            <p style="font-size: 16px; color: #666;">${reminderText}</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h2 style="color: #667eea; margin-top: 0;">${event.title}</h2>
              ${event.description ? `<p style="color: #666;">${event.description}</p>` : ''}
              
              <div style="margin-top: 20px;">
                <p style="margin: 10px 0;"><strong>📅 Date:</strong> ${formattedDate}</p>
                <p style="margin: 10px 0;"><strong>🕐 Time:</strong> ${formattedTime}</p>
                ${event.location ? `<p style="margin: 10px 0;"><strong>📍 Location:</strong> ${event.location}</p>` : ''}
                <p style="margin: 10px 0;"><strong>🏷️ Type:</strong> ${event.event_type || 'Event'}</p>
              </div>
            </div>

            <p style="color: #999; font-size: 14px; margin-top: 30px;">
              This is an automated reminder from Kourti Legal Management System.
            </p>
          </div>
        </div>
      `;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Kourti Legal <onboarding@resend.dev>',
            to: [user.email],
            subject: `Reminder: ${event.title} - ${formattedDate}`,
            html: emailHtml,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to send email to ${user.email}:`, errorText);
          return { success: false, email: user.email, error: errorText };
        }

        const result = await response.json();
        console.log(`Email sent successfully to ${user.email}`);
        return { success: true, email: user.email, messageId: result.id };
      } catch (error: any) {
        console.error(`Error sending email to ${user.email}:`, error);
        return { success: false, email: user.email, error: error.message };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r: any) => r?.success).length;
    const failureCount = results.filter((r: any) => r && !r.success).length;

    return createJsonResponse(
      {
        success: true,
        message: `Sent ${successCount} reminders, ${failureCount} failed`,
        details: results,
      },
      { cors: corsOptions }
    );

  } catch (error: any) {
    console.error('Error in send-calendar-reminder function:', error);
    return createJsonResponse(
      { error: error.message || 'Failed to send calendar reminders' },
      { status: 500, cors: corsOptions }
    );
  }
};

serve(handler);
