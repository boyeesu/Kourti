import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  is_default?: boolean | null;
  use_supabase_managed?: boolean | null;
  enforce_sso?: boolean | null;
  button_text?: string | null;
  match_domains?: string[] | null;
  domain?: string | null;
  authorize_url?: string | null;
  token_url?: string | null;
  scope?: string | null;
  tenant_id?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  default_redirect?: string | null;
  prompt?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface DryRunResponse {
  available: boolean;
  provider: Provider;
  mode: "supabase_managed" | "federated" | null;
  organization_id: string | null;
  enforce_sso: boolean;
  button_text?: string | null;
  domain_match?: string | null;
  redirect_to?: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SSO_STATE_SECRET = Deno.env.get("SSO_STATE_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_URL = Deno.env.get("APP_URL") ?? undefined;
const SITE_URL = Deno.env.get("SITE_URL") ?? undefined;
const SUPABASE_SITE_URL = Deno.env.get("SUPABASE_SITE_URL") ?? undefined;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required Supabase environment variables for SSO authorize function");
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

function safeParseUrl(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    return new URL(value);
  } catch (_err) {
    return null;
  }
}

function resolveRedirectTarget(requested: string | undefined, config: SsoConfigRow): { value: string; status?: number } {
  const allowedOrigins = new Set<string>();
  const fallbackCandidates = [config.default_redirect, APP_URL, SITE_URL, SUPABASE_SITE_URL].filter(Boolean) as string[];

  for (const candidate of fallbackCandidates) {
    const parsed = safeParseUrl(candidate);
    if (parsed) {
      allowedOrigins.add(parsed.origin);
    }
  }

  const fallbackUrl = fallbackCandidates.map((candidate) => safeParseUrl(candidate)).find((parsed) => parsed !== null);

  if (!fallbackUrl) {
    console.error("Unable to resolve fallback redirect URL", { configId: config.id, fallbackCandidates });
    return { value: "", status: 500 };
  }

  if (!requested) {
    return { value: fallbackUrl.toString() };
  }

  const requestedUrl = safeParseUrl(requested);

  if (!requestedUrl) {
    console.warn("Rejecting SSO authorize redirect: invalid URL", { requested });
    return { value: "", status: 400 };
  }

  if (allowedOrigins.size > 0 && !allowedOrigins.has(requestedUrl.origin)) {
    console.warn("Rejecting SSO authorize redirect: origin not allowed", {
      requestedOrigin: requestedUrl.origin,
      allowedOrigins: Array.from(allowedOrigins),
    });
    return { value: "", status: 400 };
  }

  return { value: requestedUrl.toString() };
}

async function resolveConfig(request: AuthorizeRequest): Promise<SsoConfigRow | null> {
  if (!supabase) return null;

  const provider = request.provider;
  if (!provider) return null;

  const domain = request.email?.split("@").pop()?.toLowerCase().trim();
  const organizationId = request.organization_id?.trim();

  const selection = "id, provider, organization_id, is_enabled, is_default, use_supabase_managed, enforce_sso, button_text, match_domains, domain, authorize_url, token_url, scope, tenant_id, client_id, client_secret, default_redirect, prompt, metadata";

  const runQuery = async (modify: (query: any) => any) => {
    let query: any = (supabase.from("organization_sso_configs" as any) as any)
      .select(selection)
      .eq("provider", provider)
      .eq("is_enabled", true)
      .order("is_default", { ascending: false })
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

  if (domain) {
    const arrayMatch = await runQuery((q) => q.contains?.("match_domains", [domain]) ?? q);
    if (arrayMatch) return arrayMatch;

    const singleDomain = await runQuery((q) => q.eq("domain", domain));
    if (singleDomain) return singleDomain;
  }

  const fallback = await runQuery((q) => q.is("organization_id", null).is("domain", null));
  if (fallback) return fallback;

  return null;
}

function buildAuthorizeUrl(config: SsoConfigRow, state: string, callbackUrl: string, request: AuthorizeRequest) {
  if (!config.client_id) {
    throw new Error("SSO configuration is missing client_id");
  }

  const provider = config.provider;
  const params = new URLSearchParams();
  params.set("client_id", config.client_id);
  params.set("redirect_uri", callbackUrl);
  params.set("response_type", "code");
  params.set("state", state);

  const scope = config.scope ?? (provider === "google"
    ? "openid email profile"
    : "openid profile email offline_access");
  params.set("scope", scope);

  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", config.prompt ?? "consent");
    const domain = request.email?.split("@").pop()?.toLowerCase();
    if (domain) {
      params.set("hd", domain);
    }
  } else if (provider === "microsoft") {
    params.set("response_mode", "query");
    if (config.prompt) {
      params.set("prompt", config.prompt);
    }
    const loginHint = request.email?.toLowerCase();
    if (loginHint) {
      params.set("login_hint", loginHint);
    }
  }

  const authorizeBase = config.authorize_url
    ?? (provider === "google"
      ? "https://accounts.google.com/o/oauth2/v2/auth"
      : `https://login.microsoftonline.com/${config.tenant_id ?? "common"}/oauth2/v2.0/authorize`);

  return `${authorizeBase}?${params.toString()}`;
}

serve(async (req) => {
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

    const mode = config.use_supabase_managed ? "supabase_managed" : "federated";

    if (request.dry_run) {
      const dryResponse: DryRunResponse = {
        available: true,
        provider: request.provider,
        mode,
        organization_id: config.organization_id,
        enforce_sso: Boolean(config.enforce_sso),
        button_text: config.button_text ?? undefined,
        domain_match: request.email?.split("@").pop()?.toLowerCase() ?? null,
        redirect_to: config.default_redirect ?? null,
      };
      return new Response(JSON.stringify(dryResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (mode === "supabase_managed") {
      const dryResponse: DryRunResponse = {
        available: true,
        provider: request.provider,
        mode,
        organization_id: config.organization_id,
        enforce_sso: Boolean(config.enforce_sso),
        button_text: config.button_text ?? undefined,
        domain_match: request.email?.split("@").pop()?.toLowerCase() ?? null,
        redirect_to: config.default_redirect ?? null,
      };
      return new Response(JSON.stringify(dryResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const redirectResolution = resolveRedirectTarget(request.redirect_to, config);
    if (!redirectResolution.value) {
      const status = redirectResolution.status ?? 500;
      const errorMessage = status === 400 ? "Invalid redirect target" : "Unable to resolve redirect target";
      return new Response(JSON.stringify({ error: errorMessage }), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const redirectTo = redirectResolution.value;

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
    return new Response(JSON.stringify({ error: error?.message ?? "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
