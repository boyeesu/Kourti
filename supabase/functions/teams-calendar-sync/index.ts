declare const Deno: any;

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

    const { action, timeMin, timeMax } = await req.json();

    // Get user's Microsoft OAuth token from SSO config
    const { data: ssoData } = await supabase
      .from('organization_sso_configs')
      .select('metadata')
      .eq('provider', 'microsoft')
      .single();

    if (!ssoData?.metadata?.access_token) {
      return createJsonResponse(
        { error: 'Microsoft Teams not connected. Please configure Microsoft SSO first.' },
        { status: 400, cors: corsOptions },
      );
    }

    const accessToken = ssoData.metadata.access_token;

    if (action === 'list-events') {
      // Build Microsoft Graph API URL with filters
      const startDateTime = timeMin || new Date().toISOString();
      const endDateTime = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const graphUrl = `https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`;

      // Fetch events from Microsoft Graph API
      const graphResponse = await fetch(graphUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (!graphResponse.ok) {
        const errorText = await graphResponse.text();
        console.error('Microsoft Graph API error:', errorText);
        return createJsonResponse(
          { error: 'Failed to fetch Microsoft Teams calendar events' },
          { status: 502, cors: corsOptions },
        );
      }

      const graphData = await graphResponse.json();

      // Transform Microsoft Graph events to our format
      const events = graphData.value?.map((event: any) => ({
        id: event.id,
        title: event.subject || 'Untitled Event',
        description: event.bodyPreview || '',
        start_date: event.start.dateTime,
        end_date: event.end.dateTime,
        location: event.location?.displayName || '',
        attendees: event.attendees?.map((a: any) => a.emailAddress.address) || [],
        event_type: event.isOnlineMeeting ? 'meeting' : 'meeting',
        source: 'microsoft_teams'
      })) || [];

      return createJsonResponse({ events }, { cors: corsOptions });
    }

    return createJsonResponse({ error: 'Invalid action' }, { status: 400, cors: corsOptions });

  } catch (error) {
    console.error('Error in teams-calendar-sync:', error);
    return createJsonResponse({ error: String(error) }, { status: 500, cors: corsOptions });
  }
});
