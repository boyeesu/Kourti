declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse } from "../_shared/responseHeaders.ts";

const corsOptions = {
  allowMethods: ['GET', 'POST', 'OPTIONS'],
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SSO_STATE_SECRET = Deno.env.get('SSO_STATE_SECRET');

const GOOGLE_SCOPES = "openid email profile https://www.googleapis.com/auth/calendar.events";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables for google-calendar-sync');
}

if (!SSO_STATE_SECRET) {
  console.error('Missing SSO_STATE_SECRET for calendar OAuth state signing');
}

type CalendarAction =
  | 'authorize'
  | 'connect'
  | 'list-events'
  | 'create-event'
  | 'update-event'
  | 'delete-event'
  | 'sync-import'
  | 'sync-export';

type CalendarEventPayload = {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  attendees?: string[];
};

interface CalendarIntegrationRow {
  id: string;
  user_id: string;
  organization_id: string;
  provider: 'google' | 'microsoft';
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  scope: string | null;
  expires_at: string | null;
  external_user_id: string | null;
  external_email: string | null;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface CalendarStatePayload {
  user_id: string;
  organization_id: string;
  provider: 'google';
  redirect_to: string;
  nonce: string;
  created_at: number;
}

const MAX_STATE_AGE_MS = 1000 * 60 * 10;

function base64UrlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const decoded = atob(normalized + padding);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i++) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

async function signState(payload: CalendarStatePayload): Promise<string> {
  if (!SSO_STATE_SECRET) {
    throw new Error('SSO_STATE_SECRET not configured');
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const keyData = encoder.encode(SSO_STATE_SECRET);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return `${base64UrlEncode(data)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyState(state: string): Promise<CalendarStatePayload> {
  if (!SSO_STATE_SECRET) {
    throw new Error('SSO_STATE_SECRET not configured');
  }
  if (!state.includes('.')) {
    throw new Error('Malformed state parameter');
  }
  const [payloadPart, signaturePart] = state.split('.');
  if (!payloadPart || !signaturePart) {
    throw new Error('Incomplete state parameter');
  }

  const payloadBytes = base64UrlDecode(payloadPart);
  const signatureBytes = base64UrlDecode(signaturePart);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SSO_STATE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes.buffer as ArrayBuffer);
  const expectedSignature = new Uint8Array(signatureBuffer);
  if (expectedSignature.length !== signatureBytes.length || !expectedSignature.every((value, idx) => value === signatureBytes[idx])) {
    throw new Error('Invalid state signature');
  }

  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as CalendarStatePayload;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRegex.test(payload.user_id)) {
    throw new Error('Invalid user id in state');
  }

  if (!uuidRegex.test(payload.organization_id)) {
    throw new Error('Invalid organization id in state');
  }

  if (payload.provider !== 'google') {
    throw new Error('Invalid provider in state');
  }

  if (Date.now() - payload.created_at > MAX_STATE_AGE_MS) {
    throw new Error('State has expired');
  }

  return payload;
}

function buildRedirectUrl(target: string, provider: string) {
  try {
    const url = new URL(target);
    url.searchParams.set('calendar_connected', provider);
    return url.toString();
  } catch (_err) {
    return target;
  }
}

function normalizeDateTime(isoString: string) {
  if (isoString.includes('T')) {
    return { dateTime: isoString };
  }
  return { date: isoString.split('T')[0] };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return createJsonResponse({ error: 'Supabase client not configured' }, { status: 500, cors: corsOptions });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && url.searchParams.get('code')) {
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state');

      if (!code || !stateParam) {
        return createJsonResponse({ error: 'Missing OAuth parameters' }, { status: 400, cors: corsOptions });
      }

      const state = await verifyState(stateParam);
      const { data: config, error: configError } = await supabase
        .from('organization_sso_configs_view' as any)
        .select('client_id, client_secret, redirect_uri, domain_hint')
        .eq('provider', 'google')
        .eq('organization_id', state.organization_id)
        .eq('is_enabled', true)
        .maybeSingle() as { data: { client_id: string; client_secret: string | null; redirect_uri: string | null; domain_hint: string | null } | null; error: any };

      if (configError || !config?.client_id) {
        return createJsonResponse({ error: 'Google OAuth is not configured for this organization.' }, { status: 400, cors: corsOptions });
      }

      const redirectUri = config.redirect_uri ?? `${url.origin}${url.pathname}`;
      const params = new URLSearchParams();
      params.set('client_id', config.client_id);
      if (config.client_secret) {
        params.set('client_secret', config.client_secret);
      }
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      params.set('redirect_uri', redirectUri);

      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Google token exchange failed:', errorText);
        return createJsonResponse({ error: 'Failed to exchange Google authorization code.' }, { status: 502, cors: corsOptions });
      }

      const tokenJson = await tokenResponse.json() as TokenResponse;
      if (!tokenJson.access_token) {
        return createJsonResponse({ error: 'Google token response missing access token.' }, { status: 502, cors: corsOptions });
      }

      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: 'application/json',
        },
      });

      const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};
      const externalEmail = userInfo.email ?? null;
      const externalUserId = userInfo.sub ?? null;

      const { data: existingIntegration } = await supabase
        .from('user_calendar_integrations' as any)
        .select('refresh_token')
        .eq('user_id', state.user_id)
        .eq('provider', 'google')
        .maybeSingle() as { data: { refresh_token: string | null } | null; error: any };

      const expiresAt = tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null;

      const refreshToken = tokenJson.refresh_token ?? existingIntegration?.refresh_token ?? null;

      const { error: upsertError } = await supabase
        .from('user_calendar_integrations' as any)
        .upsert({
          user_id: state.user_id,
          organization_id: state.organization_id,
          provider: 'google',
          access_token: tokenJson.access_token,
          refresh_token: refreshToken,
          token_type: tokenJson.token_type ?? null,
          scope: tokenJson.scope ?? GOOGLE_SCOPES,
          expires_at: expiresAt,
          external_user_id: externalUserId,
          external_email: externalEmail,
        } as any, { onConflict: 'user_id,provider' });

      if (upsertError) {
        console.error('Failed to store Google calendar tokens:', upsertError);
        return createJsonResponse({ error: 'Failed to store Google calendar tokens.' }, { status: 500, cors: corsOptions });
      }

      const redirectTo = buildRedirectUrl(state.redirect_to, 'google');
      return createEmptyResponse({ status: 302, cors: corsOptions, headers: { Location: redirectTo } });
    }

    if (req.method !== 'POST') {
      return createJsonResponse({ error: 'Method not allowed' }, { status: 405, cors: corsOptions });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createJsonResponse({ error: 'No authorization header' }, { status: 401, cors: corsOptions });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return createJsonResponse({ error: 'Unauthorized' }, { status: 401, cors: corsOptions });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles' as any)
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { organization_id: string } | null; error: any };

    if (profileError || !profile?.organization_id) {
      return createJsonResponse({ error: 'Organization not found' }, { status: 400, cors: corsOptions });
    }

    const body = await req.json();
    const action = body.action as CalendarAction | undefined;

    const { data: config } = await supabase
      .from('organization_sso_configs_view' as any)
      .select('client_id, client_secret, redirect_uri, domain_hint')
      .eq('provider', 'google')
      .eq('organization_id', profile.organization_id)
      .eq('is_enabled', true)
      .maybeSingle() as { data: { client_id: string; client_secret: string | null; redirect_uri: string | null; domain_hint: string | null } | null; error: any };

    if (!config?.client_id) {
      return createJsonResponse({ error: 'Google Calendar OAuth is not configured.' }, { status: 400, cors: corsOptions });
    }

    if (action === 'authorize') {
      const redirectTo = body.redirect_to ?? Deno.env.get('APP_URL') ?? '';
      if (!redirectTo) {
        return createJsonResponse({ error: 'Missing redirect URL' }, { status: 400, cors: corsOptions });
      }

      const statePayload: CalendarStatePayload = {
        user_id: user.id,
        organization_id: profile.organization_id,
        provider: 'google',
        redirect_to: redirectTo,
        nonce: crypto.randomUUID(),
        created_at: Date.now(),
      };

      const state = await signState(statePayload);
      const redirectUri = config.redirect_uri ?? `${url.origin}${url.pathname}`;
      const params = new URLSearchParams();
      params.set('client_id', config.client_id);
      params.set('redirect_uri', redirectUri);
      params.set('response_type', 'code');
      params.set('scope', GOOGLE_SCOPES);
      params.set('state', state);
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
      if (config.domain_hint) {
        params.set('hd', config.domain_hint);
      }

      const authorizationUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return createJsonResponse({ authorization_url: authorizationUrl, redirect_uri: redirectUri }, { cors: corsOptions });
    }

    const { data: integration } = await supabase
      .from('user_calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .maybeSingle() as { data: CalendarIntegrationRow | null };

    if (!integration?.access_token) {
      return createJsonResponse(
        { error: 'Google Calendar not connected. Please connect your calendar first.' },
        { status: 400, cors: corsOptions },
      );
    }

    let accessToken = integration.access_token;
    const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : null;
    const shouldRefresh = expiresAt !== null && expiresAt - Date.now() < 60 * 1000;

    if (shouldRefresh && integration.refresh_token) {
      const refreshParams = new URLSearchParams();
      refreshParams.set('client_id', config.client_id);
      if (config.client_secret) {
        refreshParams.set('client_secret', config.client_secret);
      }
      refreshParams.set('grant_type', 'refresh_token');
      refreshParams.set('refresh_token', integration.refresh_token);

      const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        console.error('Google token refresh failed:', errorText);
        return createJsonResponse({ error: 'Google token refresh failed' }, { status: 502, cors: corsOptions });
      }

      const refreshJson = await refreshResponse.json() as TokenResponse;
      if (refreshJson.access_token) {
        accessToken = refreshJson.access_token;
        const refreshExpiresAt = refreshJson.expires_in
          ? new Date(Date.now() + refreshJson.expires_in * 1000).toISOString()
          : integration.expires_at;

        await supabase
          .from('user_calendar_integrations' as any)
          .update({
            access_token: accessToken,
            expires_at: refreshExpiresAt,
            scope: refreshJson.scope ?? integration.scope,
            token_type: refreshJson.token_type ?? integration.token_type,
          } as any)
          .eq('id', integration.id);
      }
    }

    if (action === 'list-events') {
      const { calendarId, timeMin, timeMax } = body;
      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId || 'primary'}/events?timeMin=${timeMin}&timeMax=${timeMax}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
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
      const events = calendarData.items?.map((event: any) => ({
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        start_date: event.start.dateTime || event.start.date,
        end_date: event.end.dateTime || event.end.date,
        location: event.location || '',
        attendees: event.attendees?.map((a: any) => a.email) || [],
        event_type: 'meeting',
        source: 'google_calendar',
        external_event_id: event.id,
      })) || [];

      return createJsonResponse({ events }, { cors: corsOptions });
    }

    if (action === 'create-event') {
      const { calendarId, calendarEventId, event } = body as { calendarId?: string; calendarEventId?: string; event?: CalendarEventPayload };
      if (!event) {
        return createJsonResponse({ error: 'Missing event payload' }, { status: 400, cors: corsOptions });
      }

      const googleEvent = {
        summary: event.title,
        description: event.description,
        location: event.location,
        start: normalizeDateTime(event.start_date),
        end: normalizeDateTime(event.end_date),
        attendees: event.attendees?.map((email) => ({ email })),
      };

      const createResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId || 'primary'}/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        },
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Google Calendar create error:', errorText);
        return createJsonResponse({ error: 'Failed to create Google Calendar event' }, { status: 502, cors: corsOptions });
      }

      const createdEvent = await createResponse.json();
      if (calendarEventId && createdEvent?.id) {
        await supabase
          .from('calendar_events' as any)
          .update({
            external_event_id: createdEvent.id,
            external_source: 'google_calendar',
            external_calendar_id: calendarId || 'primary',
          })
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ event: createdEvent }, { cors: corsOptions });
    }

    if (action === 'update-event') {
      const { calendarId, calendarEventId, externalEventId, updates } = body as {
        calendarId?: string;
        calendarEventId?: string;
        externalEventId?: string;
        updates?: Partial<CalendarEventPayload>;
      };

      let eventId = externalEventId;
      if (!eventId && calendarEventId) {
        const { data: calendarRow } = await supabase
          .from('calendar_events' as any)
          .select('external_event_id')
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id)
          .maybeSingle() as { data: { external_event_id: string | null } | null; error: any };
        eventId = calendarRow?.external_event_id ?? null;
      }

      if (!eventId) {
        return createJsonResponse({ error: 'Missing external event ID for update' }, { status: 400, cors: corsOptions });
      }

      const googleUpdates: Record<string, unknown> = {};
      if (updates?.title) googleUpdates.summary = updates.title;
      if (updates?.description !== undefined) googleUpdates.description = updates.description;
      if (updates?.location !== undefined) googleUpdates.location = updates.location;
      if (updates?.start_date) googleUpdates.start = normalizeDateTime(updates.start_date);
      if (updates?.end_date) googleUpdates.end = normalizeDateTime(updates.end_date);
      if (updates?.attendees) googleUpdates.attendees = updates.attendees.map((email) => ({ email }));

      const updateResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId || 'primary'}/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleUpdates),
        },
      );

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Google Calendar update error:', errorText);
        return createJsonResponse({ error: 'Failed to update Google Calendar event' }, { status: 502, cors: corsOptions });
      }

      const updatedEvent = await updateResponse.json();
      if (calendarEventId && updatedEvent?.id) {
        await supabase
          .from('calendar_events' as any)
          .update({
            external_event_id: updatedEvent.id,
            external_source: 'google_calendar',
            external_calendar_id: calendarId || 'primary',
          } as any)
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ event: updatedEvent }, { cors: corsOptions });
    }

    if (action === 'delete-event') {
      const { calendarId, calendarEventId, externalEventId } = body as {
        calendarId?: string;
        calendarEventId?: string;
        externalEventId?: string;
      };

      let eventId = externalEventId;
      if (!eventId && calendarEventId) {
        const { data: calendarRow } = await supabase
          .from('calendar_events' as any)
          .select('external_event_id')
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id)
          .maybeSingle() as { data: { external_event_id: string | null } | null; error: any };
        eventId = calendarRow?.external_event_id ?? null;
      }

      if (!eventId) {
        return createJsonResponse({ error: 'Missing external event ID for delete' }, { status: 400, cors: corsOptions });
      }

      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId || 'primary'}/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
      );

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error('Google Calendar delete error:', errorText);
        return createJsonResponse({ error: 'Failed to delete Google Calendar event' }, { status: 502, cors: corsOptions });
      }

      if (calendarEventId) {
        await supabase
          .from('calendar_events' as any)
          .update({
            external_event_id: null,
            external_source: null,
            external_calendar_id: null,
          } as any)
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ success: true }, { cors: corsOptions });
    }

    // Sync-import: Import events from Google Calendar
    if (action === 'sync-import') {
      const { timeMin, timeMax } = body;
      
      const { data: integration } = await supabase
        .from('user_calendar_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle() as { data: CalendarIntegrationRow | null };

      if (!integration?.access_token) {
        return createJsonResponse({ error: 'Google Calendar not connected' }, { status: 400, cors: corsOptions });
      }

      const calendarId = 'primary';
      const timeMinParam = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMaxParam = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Refresh token if needed
      let accessToken = integration.access_token;
      if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
        // Token refresh logic would go here
        // For now, use existing token
      }

      const eventsResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMinParam}&timeMax=${timeMaxParam}&singleEvents=true`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!eventsResponse.ok) {
        return createJsonResponse({ error: 'Failed to fetch Google Calendar events' }, { status: 502, cors: corsOptions });
      }

      const eventsData = await eventsResponse.json();
      const importedEvents = eventsData.items || [];

      // Create sync log
      const { data: syncLog } = await supabase
        .from('calendar_sync_logs' as any)
        .insert({
          integration_id: integration.id,
          sync_type: 'import',
          status: 'running',
          started_at: new Date().toISOString(),
        } as any)
        .select()
        .single() as { data: { id: string } | null; error: any };

      let eventsCreated = 0;
      let eventsUpdated = 0;
      const errors: any[] = [];

      for (const googleEvent of importedEvents) {
        try {
          const existingEvent = await supabase
            .from('calendar_events' as any)
            .select('id')
            .eq('external_event_id', googleEvent.id)
            .eq('organization_id', integration.organization_id)
            .single() as { data: { id: string } | null; error: any };

          const eventData = {
            title: googleEvent.summary || 'Untitled Event',
            description: googleEvent.description,
            start_date: googleEvent.start.dateTime || googleEvent.start.date,
            end_date: googleEvent.end.dateTime || googleEvent.end.date,
            location: googleEvent.location,
            organization_id: integration.organization_id,
            created_by: integration.user_id,
            external_event_id: googleEvent.id,
            external_source: 'google_calendar',
            external_calendar_id: calendarId,
          };

          if (existingEvent.data) {
            await supabase
              .from('calendar_events' as any)
              .update(eventData as any)
              .eq('id', existingEvent.data.id);
            eventsUpdated++;
          } else {
            await supabase.from('calendar_events' as any).insert(eventData as any);
            eventsCreated++;
          }
        } catch (err: any) {
          errors.push({ event_id: googleEvent.id, error: err.message });
        }
      }

      // Update sync log
      if (syncLog) {
        await supabase
          .from('calendar_sync_logs' as any)
          .update({
            status: errors.length > 0 ? 'partial' : 'completed',
            events_synced: importedEvents.length,
            events_created: eventsCreated,
            events_updated: eventsUpdated,
            errors: errors,
            completed_at: new Date().toISOString(),
          } as any)
          .eq('id', syncLog.id);
      }

      // Update last_sync_at
      await supabase
        .from('user_calendar_integrations' as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq('id', integration.id);

      return createJsonResponse({
        success: true,
        events_imported: importedEvents.length,
        events_created: eventsCreated,
        events_updated: eventsUpdated,
        errors: errors.length,
      }, { cors: corsOptions });
    }

    // Sync-export: Export events to Google Calendar
    if (action === 'sync-export') {
      const { data: integration } = await supabase
        .from('user_calendar_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .maybeSingle() as { data: CalendarIntegrationRow | null };

      if (!integration?.access_token) {
        return createJsonResponse({ error: 'Google Calendar not connected' }, { status: 400, cors: corsOptions });
      }

      const { timeMin, timeMax } = body;
      const timeMinParam = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMaxParam = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get events that need to be synced
      const { data: events } = await supabase
        .from('calendar_events' as any)
        .select('*')
        .eq('organization_id', integration.organization_id)
        .gte('start_date', timeMinParam)
        .lte('end_date', timeMaxParam)
        .or(`external_event_id.is.null,external_source.neq.google_calendar`) as { data: any[] | null; error: any };

      if (!events || events.length === 0) {
        return createJsonResponse({ success: true, events_exported: 0 }, { cors: corsOptions });
      }

      // Create sync log
      const { data: syncLog } = await supabase
        .from('calendar_sync_logs' as any)
        .insert({
          integration_id: integration.id,
          sync_type: 'export',
          status: 'running',
          started_at: new Date().toISOString(),
        } as any)
        .select()
        .single() as { data: { id: string } | null; error: any };

      // Refresh token if needed
      let accessToken = integration.access_token;
      if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
        // Token refresh logic would go here
        // For now, use existing token
      }

      let eventsExported = 0;
      const errors: any[] = [];

      for (const event of events) {
        try {
          const googleEvent = {
            summary: event.title,
            description: event.description || '',
            start: { dateTime: event.start_date, timeZone: 'UTC' },
            end: { dateTime: event.end_date, timeZone: 'UTC' },
            location: event.location || '',
          };

          let response;
          if (event.external_event_id) {
            // Update existing event
            response = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.external_event_id}`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(googleEvent),
              }
            );
          } else {
            // Create new event
            response = await fetch(
              'https://www.googleapis.com/calendar/v3/calendars/primary/events',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(googleEvent),
              }
            );
          }

          if (response.ok) {
            const googleEventData = await response.json();
            await supabase
              .from('calendar_events' as any)
              .update({
                external_event_id: googleEventData.id,
                external_source: 'google_calendar',
                external_calendar_id: 'primary',
              } as any)
              .eq('id', event.id);
            eventsExported++;
          } else {
            throw new Error(`HTTP ${response.status}`);
          }
        } catch (err: any) {
          errors.push({ event_id: event.id, error: err.message });
        }
      }

      // Update sync log
      if (syncLog) {
        await supabase
          .from('calendar_sync_logs' as any)
          .update({
            status: errors.length > 0 ? 'partial' : 'completed',
            events_synced: events.length,
            events_exported: eventsExported,
            errors: errors,
            completed_at: new Date().toISOString(),
          } as any)
          .eq('id', syncLog.id);
      }

      // Update last_sync_at
      await supabase
        .from('user_calendar_integrations' as any)
        .update({ last_sync_at: new Date().toISOString() } as any)
        .eq('id', integration.id);

      return createJsonResponse({
        success: true,
        events_exported: eventsExported,
        errors: errors.length,
      }, { cors: corsOptions });
    }

    // Connect action (alias for authorize)
    if (action === 'connect') {
      // Redirect to authorize with same parameters
      return createJsonResponse({ 
        redirect: true, 
        action: 'authorize',
        ...body 
      }, { cors: corsOptions });
    }

    return createJsonResponse({ error: 'Invalid action' }, { status: 400, cors: corsOptions });
  } catch (error) {
    console.error('Error in google-calendar-sync:', error);
    return createJsonResponse({ error: String(error) }, { status: 500, cors: corsOptions });
  }
});
