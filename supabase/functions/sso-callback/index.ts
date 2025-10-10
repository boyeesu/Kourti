import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SSO_STATE_SECRET = Deno.env.get("SSO_STATE_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing required Supabase environment variables for SSO callback function");
}

if (!SSO_STATE_SECRET) {
  console.error("CRITICAL: SSO_STATE_SECRET is required for secure SSO operation");
  throw new Error("SSO_STATE_SECRET must be configured");
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  : null;

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

interface StatePayload {
  config_id: string;
  organization_id: string | null;
  provider: Provider;
  redirect_to: string;
  nonce: string;
  created_at: number;
}

interface SsoConfigRow {
  id: string;
  provider: Provider;
  organization_id: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  token_url?: string | null;
  tenant_id?: string | null;
  scope?: string | null;
  enforce_sso?: boolean | null;
}

interface TokenResponse {
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
}

const MAX_STATE_AGE_MS = 1000 * 60 * 10; // 10 minutes

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

async function verifyState(state: string): Promise<StatePayload> {
  if (!state.includes(".")) {
    throw new Error("Malformed state parameter");
  }
  const [payloadPart, signaturePart] = state.split(".");
  if (!payloadPart || !signaturePart) {
    throw new Error("Incomplete state payload");
  }

  const payloadBytes = base64UrlDecode(payloadPart);
  const signatureBytes = base64UrlDecode(signaturePart);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SSO_STATE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, payloadBytes.buffer as ArrayBuffer);
  const expectedSignature = new Uint8Array(signatureBuffer);
  if (expectedSignature.length !== signatureBytes.length || !expectedSignature.every((value, idx) => value === signatureBytes[idx])) {
    throw new Error("Invalid state signature");
  }

  const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as StatePayload;

  if (!payload.config_id || !payload.provider || !payload.redirect_to) {
    throw new Error("State payload missing required fields");
  }

  if (Date.now() - payload.created_at > MAX_STATE_AGE_MS) {
    throw new Error("State has expired. Please restart the sign-in process.");
  }

  return payload;
}

function parseJwt(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid ID token returned by provider");
  }
  const payload = base64UrlDecode(parts[1]);
  return JSON.parse(new TextDecoder().decode(payload));
}

async function exchangeToken(config: SsoConfigRow, code: string, callbackUrl: string): Promise<TokenResponse> {
  if (!config.client_id || !config.client_secret) {
    throw new Error("SSO configuration missing OAuth client credentials");
  }

  const tokenUrl = config.token_url ?? (config.provider === "google"
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${config.tenant_id ?? "common"}/oauth2/v2.0/token`);

  const params = new URLSearchParams();
  params.set("client_id", config.client_id);
  params.set("client_secret", config.client_secret);
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("redirect_uri", callbackUrl);

  if (config.provider === "microsoft") {
    params.set("scope", config.scope ?? "openid profile email offline_access");
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Token exchange failed", { status: response.status, body });
    throw new Error("Failed to exchange authorization code for tokens");
  }

  const json = await response.json() as TokenResponse;
  if (!json.id_token && !json.access_token) {
    throw new Error("Provider response missing id_token");
  }

  return json;
}

async function ensureSupabaseUser(email: string, provider: Provider, organizationId: string | null, metadata: Record<string, unknown>) {
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const lowerEmail = email.toLowerCase();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: lowerEmail,
    email_confirm: true,
    user_metadata: { ...metadata, provider },
    app_metadata: { sso_provider: provider, organization_id: organizationId ?? undefined },
  });

  if (!createError && created?.user?.id) {
    return created.user.id;
  }

  if (createError && !createError.message?.includes("already registered")) {
    console.error("Failed to create Supabase user for SSO", createError);
    throw createError;
  }

  // Existing user path
  const { data: profileMatch, error: profileError } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", lowerEmail)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") {
    console.error("Error fetching profile for existing user", profileError);
  }

  if (profileMatch?.user_id) {
    return profileMatch.user_id;
  }

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listError) {
    console.error("Error listing Supabase users for fallback lookup", listError);
    throw listError;
  }

  const match = users.users.find((user: any) => user.email?.toLowerCase() === lowerEmail);
  if (!match) {
    throw new Error("Unable to locate existing Supabase user for SSO account");
  }

  return match.id;
}

async function upsertProfile(userId: string, email: string, organizationId: string | null, claims: Record<string, unknown>) {
  if (!supabase) return;
  const firstName = (claims.given_name ?? claims.first_name ?? "") as string;
  const lastName = (claims.family_name ?? claims.last_name ?? "") as string;

  const payload = {
    user_id: userId,
    email: email.toLowerCase(),
    first_name: firstName || null,
    last_name: lastName || null,
    organization_id: organizationId,
    verified_at: new Date().toISOString(),
    status: "active",
  } as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("Failed to upsert profile for SSO user", error);
    throw error;
  }
}

function buildRedirectWithError(target: string, error: string) {
  try {
    const url = new URL(target);
    url.searchParams.set("sso_error", error);
    return url.toString();
  } catch (_err) {
    return target;
  }
}

function appendSsoSuccess(target: string, provider: Provider) {
  try {
    const url = new URL(target);
    url.searchParams.set("sso", provider);
    return url.toString();
  } catch (_err) {
    return target;
  }
}

async function redirectToMagicLink(email: string, provider: Provider, redirectTo: string) {
  if (!supabase) {
    throw new Error("Supabase client unavailable");
  }

  const finalRedirect = appendSsoSuccess(redirectTo, provider);
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: email.toLowerCase(),
    options: { redirectTo: finalRedirect },
  });

  if (error || !data?.properties?.action_link) {
    console.error("Failed to generate magic link for SSO login", { error, data });
    throw error ?? new Error("Unable to create Supabase session for SSO login");
  }

  return data.properties.action_link;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!supabase) {
    return new Response("Supabase client is not configured", { status: 500, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      console.warn("OAuth provider error:", errorParam);
      const redirectTo = Deno.env.get("APP_URL") ?? "";
      if (redirectTo) {
        const location = buildRedirectWithError(redirectTo, errorParam);
        return new Response(null, { status: 302, headers: { Location: location } });
      }
      return new Response(JSON.stringify({ error: errorParam }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!code || !stateParam) {
      throw new Error("Missing code or state parameter");
    }

    const payload = await verifyState(stateParam);
    if (!payload?.provider) {
      throw new Error("Invalid or expired state parameter");
    }

    const { data: configs } = await supabase
      .from("organization_sso_configs")
      .select("id, provider, organization_id, client_id, client_secret, tenant_id, is_enabled")
      .eq("provider", payload.provider)
      .eq("is_enabled", true);

    if (!configs || configs.length === 0) {
      throw new Error(`No enabled SSO config for provider: ${payload.provider}`);
    }

    let config = configs[0];
    if (payload.organization_id) {
      const match = configs.find((c: typeof config) => c.organization_id === payload.organization_id);
      if (match) config = match;
    }

    const callbackUrl = new URL(req.url);
    callbackUrl.search = "";

    const tokenResponse = await exchangeToken(config, code, callbackUrl.toString());
    const claims = parseJwt(tokenResponse.id_token ?? "");
    const email = claims.email as string;

    if (!email) {
      throw new Error("No email claim in ID token");
    }

    const userId = await ensureSupabaseUser(email, payload.provider, config.organization_id, claims);
    await upsertProfile(userId, email, config.organization_id, claims);
    const magicLink = await redirectToMagicLink(email, payload.provider, payload.redirect_to);

    return new Response(null, {
      status: 302,
      headers: { Location: magicLink },
    });
  } catch (error) {
    console.error("SSO callback handler error", error);
    const fallbackUrl = Deno.env.get("APP_URL") ?? "";
    if (fallbackUrl) {
      const location = buildRedirectWithError(fallbackUrl, "sso_callback_error");
      return new Response(null, { status: 302, headers: { Location: location } });
    }
    const errorMessage = error instanceof Error ? error.message : "Unexpected SSO error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
