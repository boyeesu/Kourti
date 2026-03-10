declare const Deno: any;

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions,
} from '../_shared/responseHeaders.ts';

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_URL'),
  Deno.env.get('SSO_ALLOWED_REDIRECT_ORIGINS'),
  ...(Deno.env.get('ENVIRONMENT') !== 'production'
    ? [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:8082',
        'http://localhost:8083',
      ]
    : []),
]
  .flatMap((value) => (value ? value.split(',') : []))
  .filter(Boolean);

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  // Can't use "*" with allowCredentials: true, so we must have a specific origin
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0] || 'https://app.kourti.com'; // Fallback to a specific origin, never "*"

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ['POST', 'OPTIONS'],
  };
}

type Provider = 'google' | 'microsoft';

type AuthorizeRequest = {
  provider?: Provider;
  email?: string;
  redirect_to?: string;
  dry_run?: boolean;
};

interface SsoConfigRow {
  id: string;
  provider: Provider;
  organization_id: string | null;
  is_enabled?: boolean | null;
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  redirect_uri?: string | null;
  domain_hint?: string | null;
  domain?: string | null;
}

interface DryRunResponse {
  available: boolean;
  provider: Provider;
  mode: 'federated' | null;
  organization_id: string | null;
  enforce_sso: boolean;
  button_text?: string | null;
  domain_match?: string | null;
  redirect_to?: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SSO_STATE_SECRET = Deno.env.get('SSO_STATE_SECRET');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required Supabase environment variables for SSO authorize function');
}

if (!SSO_STATE_SECRET) {
  console.error('CRITICAL: SSO_STATE_SECRET is required for secure SSO operation');
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

function base64UrlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function signState(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const keyData = encoder.encode(SSO_STATE_SECRET);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  const statePayload = base64UrlEncode(data);
  const stateSignature = base64UrlEncode(new Uint8Array(signature));
  return `${statePayload}.${stateSignature}`;
}

async function resolveConfig(request: AuthorizeRequest): Promise<SsoConfigRow | null> {
  if (!supabase) return null;

  const provider = request.provider;
  if (!provider) return null;

  const domain = request.email?.split('@').pop()?.toLowerCase().trim();
  if (!domain) {
    console.log('SSO: Email with domain is required for SSO configuration lookup');
    return null;
  }

  const selection =
    'id, provider, organization_id, is_enabled, tenant_id, client_id, client_secret, redirect_uri, domain_hint, domain';

  const runQuery = async (modify: (query: any) => any) => {
    let query: any = (supabase.from('organization_sso_configs' as any) as any)
      .select(selection)
      .eq('provider', provider)
      .eq('is_enabled', true)
      .order('created_at', { ascending: false })
      .limit(1);

    query = modify(query);
    const { data, error } = await query.maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('Error resolving SSO config', { error, provider, domain });
    }
    return (data as SsoConfigRow | null) ?? null;
  };

  // SECURITY FIX: ONLY match by email domain - never trust client-provided organization_id
  const config = await runQuery((q) => q.eq('domain', domain));
  if (config) {
    console.log(`Found SSO config for domain: ${domain}`, {
      provider,
      organization_id: config.organization_id,
    });
    return config;
  }

  // No matching config found
  console.log(`No SSO config found for domain: ${domain}`, { provider });
  return null;
}

function buildAuthorizeUrl(
  config: SsoConfigRow,
  state: string,
  callbackUrl: string,
  request: AuthorizeRequest
) {
  if (!config.client_id) {
    throw new Error('SSO configuration is missing client_id');
  }

  const provider = config.provider;
  const params = new URLSearchParams();
  params.set('client_id', config.client_id);
  params.set('redirect_uri', config.redirect_uri || callbackUrl);
  params.set('response_type', 'code');
  params.set('state', state);

  const scope =
    provider === 'google'
      ? 'openid email profile https://www.googleapis.com/auth/calendar.readonly'
      : 'openid profile email offline_access Calendars.Read';
  params.set('scope', scope);

  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
    const domain = config.domain_hint || request.email?.split('@').pop()?.toLowerCase();
    if (domain) {
      params.set('hd', domain);
    }
  } else if (provider === 'microsoft') {
    params.set('response_mode', 'query');
    params.set('prompt', 'select_account');
    const loginHint = request.email?.toLowerCase();
    if (loginHint) {
      params.set('login_hint', loginHint);
    }
  }

  const authorizeBase =
    provider === 'google'
      ? 'https://accounts.google.com/o/oauth2/v2/auth'
      : `https://login.microsoftonline.com/${config.tenant_id ?? 'common'}/oauth2/v2.0/authorize`;

  return `${authorizeBase}?${params.toString()}`;
}

serve(async (req) => {
  const corsOptions = getCorsOptions(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  if (!supabase) {
    return createJsonResponse(
      { error: 'Supabase client not configured' },
      { status: 500, cors: corsOptions }
    );
  }

  try {
    const request: AuthorizeRequest = await req.json();
    if (!request.provider) {
      return createJsonResponse({ error: 'Missing provider' }, { status: 400, cors: corsOptions });
    }

    // SECURITY FIX: Timing oracle mitigation - normalize all response times
    const minResponseTime = 200; // milliseconds
    const requestStartTime = Date.now();

    const config = await resolveConfig(request);

    // Calculate remaining time to meet minimum response time
    const elapsedTime = Date.now() - requestStartTime;
    const delayNeeded = Math.max(0, minResponseTime - elapsedTime);

    if (delayNeeded > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayNeeded));
    }

    if (!config) {
      const dryResponse: DryRunResponse = {
        available: false,
        provider: request.provider,
        mode: null,
        organization_id: null,
        enforce_sso: false,
      };
      // SECURITY FIX: Always return 200 for dry_run to prevent enumeration
      return createJsonResponse(dryResponse, {
        status: 200,
        cors: corsOptions,
      });
    }

    // Always use federated mode (custom OAuth flow)
    const mode = 'federated';

    if (request.dry_run) {
      const dryResponse: DryRunResponse = {
        available: true,
        provider: request.provider,
        mode,
        organization_id: config.organization_id,
        enforce_sso: false,
        button_text: `Sign in with ${request.provider === 'google' ? 'Google' : 'Microsoft'}`,
        domain_match: request.email?.split('@').pop()?.toLowerCase() ?? null,
        redirect_to: config.redirect_uri ?? null,
      };
      return createJsonResponse(dryResponse, { cors: corsOptions });
    }

    const redirectTo = request.redirect_to ?? config.redirect_uri;
    if (!redirectTo) {
      return createJsonResponse(
        { error: 'Missing redirect target' },
        { status: 400, cors: corsOptions }
      );
    }

    const callbackUrl = new URL(req.url);
    const path = callbackUrl.pathname.replace(/\/sso-authorize$/, '/sso-callback');
    callbackUrl.pathname = path;
    callbackUrl.search = '';

    const statePayload = {
      config_id: config.id,
      organization_id: config.organization_id,
      provider: config.provider,
      redirect_to: redirectTo,
      nonce: crypto.randomUUID(),
      created_at: Date.now(),
    };

    const state = await signState(statePayload);
    const authorizationUrl = buildAuthorizeUrl(config, state, callbackUrl.toString(), request);

    return createJsonResponse(
      {
        authorization_url: authorizationUrl,
        state,
        provider: config.provider,
        organization_id: config.organization_id,
      },
      { cors: corsOptions }
    );
  } catch (error) {
    console.error('SSO authorize handler error', error);
    const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
    return createJsonResponse({ error: errorMessage }, { status: 500, cors: corsOptions });
  }
});
