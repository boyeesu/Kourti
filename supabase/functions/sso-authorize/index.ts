import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
].filter(Boolean);

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "*");
  
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

type Provider = "google" | "microsoft";

type AuthorizeRequest = {
  provider?: Provider;
  email?: string;
  organization_id?: string;
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
}

interface DryRunResponse {
  available: boolean;
  provider: Provider;
  mode: "federated" | null;
  organization_id: string | null;
  enforce_sso: boolean;
  button_text?: string | null;
  domain_match?: string | null;
  redirect_to?: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SSO_STATE_SECRET = Deno.env.get("SSO_STATE_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required Supabase environment variables for SSO authorize function");
}

if (!SSO_STATE_SECRET) {
  console.error("CRITICAL: SSO_STATE_SECRET is required for secure SSO operation");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

function base64UrlEncode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function signState(payload: Record<string, unknown>): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));
  const keyData = encoder.encode(SSO_STATE_SECRET);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const statePayload = base64UrlEncode(data);
  const stateSignature = base64UrlEncode(new Uint8Array(signature));
  return `${statePayload}.${stateSignature}`;
}

async function resolveConfig(request: AuthorizeRequest): Promise<SsoConfigRow | null> {
  if (!supabase) return null;

  const provider = request.provider;
  if (!provider) return null;

  const domain = request.email?.split("@").pop()?.toLowerCase().trim();
  const organizationId = request.organization_id?.trim();

  const selection = "id, provider, organization_id, is_enabled, tenant_id, client_id, client_secret, redirect_uri, domain_hint";

  const runQuery = async (modify: (query: any) => any) => {
    let query: any = (supabase.from("organization_sso_configs" as any) as any)
      .select(selection)
      .eq("provider", provider)
      .eq("is_enabled", true)
      .order("created_at", { ascending: false })
      .limit(1);

    query = modify(query);
    const { data, error } = await query.maybeSingle();
    if (error && error.code !== "PGRST116") {
      console.error("Error resolving SSO config", { error, provider, organizationId, domain });
    }
    return (data as SsoConfigRow | null) ?? null;
  };

  if (organizationId) {
    const config = await runQuery((q) => q.eq("organization_id", organizationId));
    if (config) return config;
  }

  // If no organization-specific config, return null
  return null;
}

function buildAuthorizeUrl(config: SsoConfigRow, state: string, callbackUrl: string, request: AuthorizeRequest) {
  if (!config.client_id) {
    throw new Error("SSO configuration is missing client_id");
  }

  const provider = config.provider;
  const params = new URLSearchParams();
  params.set("client_id", config.client_id);
  params.set("redirect_uri", config.redirect_uri || callbackUrl);
  params.set("response_type", "code");
  params.set("state", state);

  const scope = provider === "google"
    ? "openid email profile https://www.googleapis.com/auth/calendar.readonly"
    : "openid profile email offline_access Calendars.Read";
  params.set("scope", scope);

  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    const domain = config.domain_hint || request.email?.split("@").pop()?.toLowerCase();
    if (domain) {
      params.set("hd", domain);
    }
  } else if (provider === "microsoft") {
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
    const loginHint = request.email?.toLowerCase();
    if (loginHint) {
      params.set("login_hint", loginHint);
    }
  }

  const authorizeBase = provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : `https://login.microsoftonline.com/${config.tenant_id ?? "common"}/oauth2/v2.0/authorize`;

  return `${authorizeBase}?${params.toString()}`;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!supabase) {
    return new Response(JSON.stringify({ error: "Supabase client not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const request: AuthorizeRequest = await req.json();
    if (!request.provider) {
      return new Response(JSON.stringify({ error: "Missing provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const config = await resolveConfig(request);

    if (!config) {
      const dryResponse: DryRunResponse = {
        available: false,
        provider: request.provider,
        mode: null,
        organization_id: null,
        enforce_sso: false,
      };
      return new Response(JSON.stringify(dryResponse), {
        status: request.dry_run ? 200 : 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Always use federated mode (custom OAuth flow)
    const mode = "federated";

    if (request.dry_run) {
      const dryResponse: DryRunResponse = {
        available: true,
        provider: request.provider,
        mode,
        organization_id: config.organization_id,
        enforce_sso: false,
        button_text: `Sign in with ${request.provider === 'google' ? 'Google' : 'Microsoft'}`,
        domain_match: request.email?.split("@").pop()?.toLowerCase() ?? null,
        redirect_to: config.redirect_uri ?? null,
      };
      return new Response(JSON.stringify(dryResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const redirectTo = request.redirect_to ?? config.redirect_uri;
    if (!redirectTo) {
      return new Response(JSON.stringify({ error: "Missing redirect target" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const callbackUrl = new URL(req.url);
    const path = callbackUrl.pathname.replace(/\/sso-authorize$/, "/sso-callback");
    callbackUrl.pathname = path;
    callbackUrl.search = "";

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

    return new Response(JSON.stringify({
      authorization_url: authorizationUrl,
      state,
      provider: config.provider,
      organization_id: config.organization_id,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("SSO authorize handler error", error);
    const errorMessage = error instanceof Error ? error.message : "Unexpected error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
