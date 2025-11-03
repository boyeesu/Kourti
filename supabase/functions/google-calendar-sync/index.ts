import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ['POST', 'OPTIONS'],
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createJsonResponse({ error: 'No authorization header' }, { status: 401, cors: corsOptions });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const { action, calendarId, timeMin, timeMax } = await req.json();

    // Get user's Google OAuth token from SSO config
    const { data: ssoData } = await supabase
      .from('organization_sso_configs')
      .select('metadata')
      .eq('provider', 'google')
      .single();

    if (!ssoData?.metadata?.access_token) {
      return createJsonResponse(
        { error: 'Google Calendar not connected. Please configure Google SSO first.' },
        { status: 400, cors: corsOptions },
      );
    }

    const accessToken = ssoData.metadata.access_token;

    if (action === 'list-events') {
      // Fetch events from Google Calendar
      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId || 'primary'}/events?timeMin=${timeMin}&timeMax=${timeMax}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      if (!calendarResponse.ok) {
        const errorText = await calendarResponse.text();
        console.error('Google Calendar API error:', errorText);
        return createJsonResponse(
          { error: 'Failed to fetch Google Calendar events' },
          { status: 502, cors: corsOptions },
        );
      }

      const calendarData = await calendarResponse.json();

      // Transform Google Calendar events to our format
      const events = calendarData.items?.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start_date: event.start.dateTime || event.start.date,
        end_date: event.end.dateTime || event.end.date,
        location: event.location || '',
        attendees: event.attendees?.map((a: any) => a.email) || [],
        event_type: 'meeting',
        source: 'google_calendar'
      })) || [];

      return createJsonResponse({ events }, { cors: corsOptions });
    }

    return createJsonResponse({ error: 'Invalid action' }, { status: 400, cors: corsOptions });

  } catch (error) {
    console.error('Error in google-calendar-sync:', error);
    return createJsonResponse({ error: String(error) }, { status: 500, cors: corsOptions });
  }
});
