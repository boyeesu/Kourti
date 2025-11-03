import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const { headers: corsHeaders, isAllowed } = buildCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    if (!isAllowed) {
      return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
    }
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAllowed) {
    return new Response('Origin not allowed', { status: 403, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, calendarId, timeMin, timeMax } = await req.json();

    // Get user's Google OAuth token from SSO config
    const { data: ssoData } = await supabase
      .from('organization_sso_configs')
      .select('metadata')
      .eq('provider', 'google')
      .single();

    if (!ssoData?.metadata?.access_token) {
      return new Response(
        JSON.stringify({ error: 'Google Calendar not connected. Please configure Google SSO first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        return new Response(
          JSON.stringify({ error: 'Failed to fetch Google Calendar events' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

      return new Response(
        JSON.stringify({ events }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in google-calendar-sync:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
