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

const MICROSOFT_SCOPES = 'openid profile email offline_access Calendars.ReadWrite';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase environment variables for teams-calendar-sync');
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

interface OAuthConfig {
  client_id: string;
  client_secret: string | null;
  redirect_uri: string | null;
  tenant_id: string | null;
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
  provider: 'microsoft';
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

  if (payload.provider !== 'microsoft') {
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
        .from('organization_sso_configs_view')
        .select('client_id, client_secret, redirect_uri, tenant_id')
        .eq('provider', 'microsoft')
        .eq('organization_id', state.organization_id)
        .eq('is_enabled', true)
        .maybeSingle();

      if (configError || !config?.client_id) {
        return createJsonResponse({ error: 'Microsoft OAuth is not configured for this organization.' }, { status: 400, cors: corsOptions });
      }

      const tenantId = config.tenant_id ?? 'common';
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const redirectUri = config.redirect_uri ?? `${url.origin}${url.pathname}`;

      const params = new URLSearchParams();
      params.set('client_id', config.client_id);
      if (config.client_secret) {
        params.set('client_secret', config.client_secret);
      }
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      params.set('redirect_uri', redirectUri);
      params.set('scope', MICROSOFT_SCOPES);

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Microsoft token exchange failed:', errorText);
        return createJsonResponse({ error: 'Failed to exchange Microsoft authorization code.' }, { status: 502, cors: corsOptions });
      }

      const tokenJson = await tokenResponse.json() as TokenResponse;
      if (!tokenJson.access_token) {
        return createJsonResponse({ error: 'Microsoft token response missing access token.' }, { status: 502, cors: corsOptions });
      }

      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          Accept: 'application/json',
        },
      });

      const profileJson = profileResponse.ok ? await profileResponse.json() : {};
      const externalEmail = profileJson.mail ?? profileJson.userPrincipalName ?? null;
      const externalUserId = profileJson.id ?? null;

      const { data: existingIntegration } = await supabase
        .from('user_calendar_integrations')
        .select('refresh_token')
        .eq('user_id', state.user_id)
        .eq('provider', 'microsoft')
        .maybeSingle();

      const expiresAt = tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
        : null;

      const refreshToken = tokenJson.refresh_token ?? existingIntegration?.refresh_token ?? null;

      const { error: upsertError } = await supabase
        .from('user_calendar_integrations')
        .upsert({
          user_id: state.user_id,
          organization_id: state.organization_id,
          provider: 'microsoft',
          access_token: tokenJson.access_token,
          refresh_token: refreshToken,
          token_type: tokenJson.token_type ?? null,
          scope: tokenJson.scope ?? MICROSOFT_SCOPES,
          expires_at: expiresAt,
          external_user_id: externalUserId,
          external_email: externalEmail,
        }, { onConflict: 'user_id,provider' });

      if (upsertError) {
        console.error('Failed to store Microsoft calendar tokens:', upsertError);
        return createJsonResponse({ error: 'Failed to store Microsoft calendar tokens.' }, { status: 500, cors: corsOptions });
      }

      const redirectTo = buildRedirectUrl(state.redirect_to, 'microsoft');
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
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile?.organization_id) {
      return createJsonResponse({ error: 'Organization not found' }, { status: 400, cors: corsOptions });
    }

    const body = await req.json();
    const action = body.action as CalendarAction | undefined;

    const { data: config } = await supabase
      .from('organization_sso_configs_view')
      .select('client_id, client_secret, redirect_uri, tenant_id')
      .eq('provider', 'microsoft')
      .eq('organization_id', profile.organization_id)
      .eq('is_enabled', true)
      .maybeSingle() as { data: OAuthConfig | null };

    if (!config?.client_id) {
      return createJsonResponse({ error: 'Microsoft Calendar OAuth is not configured.' }, { status: 400, cors: corsOptions });
    }

    if (action === 'authorize') {
      const redirectTo = body.redirect_to ?? Deno.env.get('APP_URL') ?? '';
      if (!redirectTo) {
        return createJsonResponse({ error: 'Missing redirect URL' }, { status: 400, cors: corsOptions });
      }

      const statePayload: CalendarStatePayload = {
        user_id: user.id,
        organization_id: profile.organization_id,
        provider: 'microsoft',
        redirect_to: redirectTo,
        nonce: crypto.randomUUID(),
        created_at: Date.now(),
      };

      const state = await signState(statePayload);
      const redirectUri = config.redirect_uri ?? `${url.origin}${url.pathname}`;
      const tenantId = config.tenant_id ?? 'common';

      const params = new URLSearchParams();
      params.set('client_id', config.client_id);
      params.set('redirect_uri', redirectUri);
      params.set('response_type', 'code');
      params.set('response_mode', 'query');
      params.set('scope', MICROSOFT_SCOPES);
      params.set('state', state);
      params.set('prompt', 'select_account');

      const authorizationUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
      return createJsonResponse({ authorization_url: authorizationUrl, redirect_uri: redirectUri }, { cors: corsOptions });
    }

    const { data: integration } = await supabase
      .from('user_calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'microsoft')
      .maybeSingle() as { data: CalendarIntegrationRow | null };

    if (!integration?.access_token) {
      return createJsonResponse(
        { error: 'Microsoft Calendar not connected. Please connect your calendar first.' },
        { status: 400, cors: corsOptions },
      );
    }

    let accessToken = integration.access_token;
    const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() : null;
    const shouldRefresh = expiresAt !== null && expiresAt - Date.now() < 60 * 1000;

    if (shouldRefresh && integration.refresh_token) {
      const tenantId = config.tenant_id ?? 'common';
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const refreshParams = new URLSearchParams();
      refreshParams.set('client_id', config.client_id);
      if (config.client_secret) {
        refreshParams.set('client_secret', config.client_secret);
      }
      refreshParams.set('grant_type', 'refresh_token');
      refreshParams.set('refresh_token', integration.refresh_token);
      refreshParams.set('scope', MICROSOFT_SCOPES);

      const refreshResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams.toString(),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        console.error('Microsoft token refresh failed:', errorText);
        return createJsonResponse({ error: 'Microsoft token refresh failed' }, { status: 502, cors: corsOptions });
      }

      const refreshJson = await refreshResponse.json() as TokenResponse;
      if (refreshJson.access_token) {
        accessToken = refreshJson.access_token;
        const refreshExpiresAt = refreshJson.expires_in
          ? new Date(Date.now() + refreshJson.expires_in * 1000).toISOString()
          : integration.expires_at;

        await supabase
          .from('user_calendar_integrations')
          .update({
            access_token: accessToken,
            expires_at: refreshExpiresAt,
            scope: refreshJson.scope ?? integration.scope,
            token_type: refreshJson.token_type ?? integration.token_type,
          })
          .eq('id', integration.id);
      }
    }

    if (action === 'list-events') {
      const { timeMin, timeMax } = body;
      const startDateTime = timeMin || new Date().toISOString();
      const endDateTime = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const graphUrl = `https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime=${startDateTime}&endDateTime=${endDateTime}`;

      const graphResponse = await fetch(graphUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
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
      const events = graphData.value?.map((event: any) => ({
        id: event.id,
        title: event.subject || 'Untitled Event',
        description: event.bodyPreview || '',
        start_date: event.start.dateTime,
        end_date: event.end.dateTime,
        location: event.location?.displayName || '',
        attendees: event.attendees?.map((a: any) => a.emailAddress.address) || [],
        event_type: event.isOnlineMeeting ? 'meeting' : 'meeting',
        source: 'microsoft_teams',
        external_event_id: event.id,
      })) || [];

      return createJsonResponse({ events }, { cors: corsOptions });
    }

    if (action === 'create-event') {
      const { calendarEventId, event } = body as { calendarEventId?: string; event?: CalendarEventPayload };
      if (!event) {
        return createJsonResponse({ error: 'Missing event payload' }, { status: 400, cors: corsOptions });
      }

      const attendees = event.attendees?.map((email) => ({ emailAddress: { address: email }, type: 'required' }));
      const createPayload = {
        subject: event.title,
        body: {
          contentType: 'HTML',
          content: event.description ?? '',
        },
        start: { dateTime: event.start_date, timeZone: 'UTC' },
        end: { dateTime: event.end_date, timeZone: 'UTC' },
        location: event.location ? { displayName: event.location } : undefined,
        attendees,
      };

      const createResponse = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createPayload),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Microsoft Graph create error:', errorText);
        return createJsonResponse({ error: 'Failed to create Microsoft calendar event' }, { status: 502, cors: corsOptions });
      }

      const createdEvent = await createResponse.json();
      if (calendarEventId && createdEvent?.id) {
        await supabase
          .from('calendar_events')
          .update({
            external_event_id: createdEvent.id,
            external_source: 'microsoft_teams',
            external_calendar_id: 'default',
          })
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ event: createdEvent }, { cors: corsOptions });
    }

    if (action === 'update-event') {
      const { calendarEventId, externalEventId, updates } = body as {
        calendarEventId?: string;
        externalEventId?: string;
        updates?: Partial<CalendarEventPayload>;
      };

      let eventId = externalEventId;
      if (!eventId && calendarEventId) {
        const { data: calendarRow } = await supabase
          .from('calendar_events')
          .select('external_event_id')
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id)
          .maybeSingle();
        eventId = calendarRow?.external_event_id ?? null;
      }

      if (!eventId) {
        return createJsonResponse({ error: 'Missing external event ID for update' }, { status: 400, cors: corsOptions });
      }

      const updatePayload: Record<string, unknown> = {};
      if (updates?.title) updatePayload.subject = updates.title;
      if (updates?.description !== undefined) updatePayload.body = { contentType: 'HTML', content: updates.description ?? '' };
      if (updates?.start_date) updatePayload.start = { dateTime: updates.start_date, timeZone: 'UTC' };
      if (updates?.end_date) updatePayload.end = { dateTime: updates.end_date, timeZone: 'UTC' };
      if (updates?.location !== undefined) updatePayload.location = updates.location ? { displayName: updates.location } : null;
      if (updates?.attendees) {
        updatePayload.attendees = updates.attendees.map((email) => ({ emailAddress: { address: email }, type: 'required' }));
      }

      const updateResponse = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error('Microsoft Graph update error:', errorText);
        return createJsonResponse({ error: 'Failed to update Microsoft calendar event' }, { status: 502, cors: corsOptions });
      }

      const updatedEvent = updateResponse.status === 204 ? {} : await updateResponse.json();
      if (calendarEventId) {
        await supabase
          .from('calendar_events')
          .update({
            external_event_id: updatedEvent?.id ?? eventId,
            external_source: 'microsoft_teams',
            external_calendar_id: 'default',
          })
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ event: updatedEvent }, { cors: corsOptions });
    }

    if (action === 'delete-event') {
      const { calendarEventId, externalEventId } = body as {
        calendarEventId?: string;
        externalEventId?: string;
      };

      let eventId = externalEventId;
      if (!eventId && calendarEventId) {
        const { data: calendarRow } = await supabase
          .from('calendar_events')
          .select('external_event_id')
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id)
          .maybeSingle();
        eventId = calendarRow?.external_event_id ?? null;
      }

      if (!eventId) {
        return createJsonResponse({ error: 'Missing external event ID for delete' }, { status: 400, cors: corsOptions });
      }

      const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text();
        console.error('Microsoft Graph delete error:', errorText);
        return createJsonResponse({ error: 'Failed to delete Microsoft calendar event' }, { status: 502, cors: corsOptions });
      }

      if (calendarEventId) {
        await supabase
          .from('calendar_events')
          .update({
            external_event_id: null,
            external_source: null,
            external_calendar_id: null,
          })
          .eq('id', calendarEventId)
          .eq('organization_id', profile.organization_id);
      }

      return createJsonResponse({ success: true }, { cors: corsOptions });
    }

    // Sync-import: Import events from Microsoft Teams
    if (action === 'sync-import') {
      const { timeMin, timeMax } = body;
      
      const { data: integration } = await supabase
        .from('user_calendar_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'microsoft')
        .maybeSingle() as { data: CalendarIntegrationRow | null };

      if (!integration?.access_token) {
        return createJsonResponse({ error: 'Microsoft Teams calendar not connected' }, { status: 400, cors: corsOptions });
      }

      const timeMinParam = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMaxParam = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      let accessToken = integration.access_token;
      if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
        // Token refresh logic would go here
      }

      const eventsResponse = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime=${timeMinParam}&endDateTime=${timeMaxParam}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!eventsResponse.ok) {
        return createJsonResponse({ error: 'Failed to fetch Microsoft calendar events' }, { status: 502, cors: corsOptions });
      }

      const eventsData = await eventsResponse.json();
      const importedEvents = eventsData.value || [];

      // Create sync log
      const { data: syncLog } = await supabase
        .from('calendar_sync_logs')
        .insert({
          integration_id: integration.id,
          sync_type: 'import',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      let eventsCreated = 0;
      let eventsUpdated = 0;
      const errors: any[] = [];

      for (const msEvent of importedEvents) {
        try {
          const existingEvent = await supabase
            .from('calendar_events')
            .select('id')
            .eq('external_event_id', msEvent.id)
            .eq('organization_id', integration.organization_id)
            .single();

          const eventData = {
            title: msEvent.subject || 'Untitled Event',
            description: msEvent.body?.content || '',
            start_date: msEvent.start?.dateTime || msEvent.start?.date,
            end_date: msEvent.end?.dateTime || msEvent.end?.date,
            location: msEvent.location?.displayName,
            organization_id: integration.organization_id,
            created_by: integration.user_id,
            external_event_id: msEvent.id,
            external_source: 'microsoft_teams',
            external_calendar_id: msEvent.calendar?.id || 'primary',
          };

          if (existingEvent.data) {
            await supabase
              .from('calendar_events')
              .update(eventData)
              .eq('id', existingEvent.data.id);
            eventsUpdated++;
          } else {
            await supabase.from('calendar_events').insert(eventData);
            eventsCreated++;
          }
        } catch (err: any) {
          errors.push({ event_id: msEvent.id, error: err.message });
        }
      }

      // Update sync log
      if (syncLog) {
        await supabase
          .from('calendar_sync_logs')
          .update({
            status: errors.length > 0 ? 'partial' : 'completed',
            events_synced: importedEvents.length,
            events_created: eventsCreated,
            events_updated: eventsUpdated,
            errors: errors,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }

      // Update last_sync_at
      await supabase
        .from('user_calendar_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', integration.id);

      return createJsonResponse({
        success: true,
        events_imported: importedEvents.length,
        events_created: eventsCreated,
        events_updated: eventsUpdated,
        errors: errors.length,
      }, { cors: corsOptions });
    }

    // Sync-export: Export events to Microsoft Teams
    if (action === 'sync-export') {
      const { data: integration } = await supabase
        .from('user_calendar_integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'microsoft')
        .maybeSingle() as { data: CalendarIntegrationRow | null };

      if (!integration?.access_token) {
        return createJsonResponse({ error: 'Microsoft Teams calendar not connected' }, { status: 400, cors: corsOptions });
      }

      const { timeMin, timeMax } = body;
      const timeMinParam = timeMin || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMaxParam = timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      // Get events that need to be synced
      const { data: events } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('organization_id', integration.organization_id)
        .gte('start_date', timeMinParam)
        .lte('end_date', timeMaxParam)
        .or(`external_event_id.is.null,external_source.neq.microsoft_teams`);

      if (!events || events.length === 0) {
        return createJsonResponse({ success: true, events_exported: 0 }, { cors: corsOptions });
      }

      // Create sync log
      const { data: syncLog } = await supabase
        .from('calendar_sync_logs')
        .insert({
          integration_id: integration.id,
          sync_type: 'export',
          status: 'running',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      let accessToken = integration.access_token;
      if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
        // Token refresh logic would go here
      }

      let eventsExported = 0;
      const errors: any[] = [];

      for (const event of events) {
        try {
          const msEvent = {
            subject: event.title,
            body: {
              contentType: 'HTML',
              content: event.description || '',
            },
            start: {
              dateTime: event.start_date,
              timeZone: 'UTC',
            },
            end: {
              dateTime: event.end_date,
              timeZone: 'UTC',
            },
            location: event.location ? {
              displayName: event.location,
            } : undefined,
          };

          let response;
          if (event.external_event_id) {
            // Update existing event
            response = await fetch(
              `https://graph.microsoft.com/v1.0/me/events/${event.external_event_id}`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(msEvent),
              }
            );
          } else {
            // Create new event
            response = await fetch(
              'https://graph.microsoft.com/v1.0/me/events',
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(msEvent),
              }
            );
          }

          if (response.ok) {
            const msEventData = await response.json();
            await supabase
              .from('calendar_events')
              .update({
                external_event_id: msEventData.id,
                external_source: 'microsoft_teams',
                external_calendar_id: msEventData.calendar?.id || 'primary',
              })
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
          .from('calendar_sync_logs')
          .update({
            status: errors.length > 0 ? 'partial' : 'completed',
            events_synced: events.length,
            events_exported: eventsExported,
            errors: errors,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncLog.id);
      }

      // Update last_sync_at
      await supabase
        .from('user_calendar_integrations')
        .update({ last_sync_at: new Date().toISOString() })
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
    console.error('Error in teams-calendar-sync:', error);
    return createJsonResponse({ error: String(error) }, { status: 500, cors: corsOptions });
  }
});
