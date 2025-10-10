import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ssoSecretKey = Deno.env.get("SSO_SECRET_KEY") ?? "";
const allowedRedirectOrigins = (Deno.env.get("SSO_ALLOWED_REDIRECT_ORIGINS") ?? "")
  .split(",")
  .map((origin: string) => origin.trim())
  .filter((origin: string) => origin.length > 0);

type Provider = "google" | "microsoft";

type CreatePayload = {
  provider: Provider;
  clientId: string;
  clientSecret?: string;
  tenantId?: string;
  domainHint?: string;
  redirectUri?: string;
  isEnabled?: boolean;
};

type UpdatePayload = {
  id: string;
  clientId?: string;
  clientSecret?: string;
  tenantId?: string;
  domainHint?: string;
  redirectUri?: string;
  isEnabled?: boolean;
};

type DeletePayload = {
  id: string;
};

type RotatePayload = {
  id: string;
  clientSecret: string;
};

type TestPayload = {
  id: string;
};

type ManageSsoConfigRequest =
  | { action: "create"; payload: CreatePayload }
  | { action: "update"; payload: UpdatePayload }
  | { action: "delete"; payload: DeletePayload }
  | { action: "rotate"; payload: RotatePayload }
  | { action: "test"; payload: TestPayload };

type SsoConfigRow = {
  id: string;
  organization_id: string;
  provider: Provider;
  client_id: string;
  tenant_id: string | null;
  domain_hint: string | null;
  redirect_uri: string | null;
  is_enabled: boolean;
  has_client_secret: boolean;
  client_secret_masked: string | null;
  created_at: string;
  updated_at: string;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureConfigured() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase credentials are not configured");
  }

  if (!ssoSecretKey) {
    throw new Error("SSO secret key is not configured");
  }
}

function normalizeToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

function validateRedirectUri(uri?: string | null) {
  if (!uri) return;

  try {
    const parsed = new URL(uri);
    if (
      allowedRedirectOrigins.length > 0 &&
      !allowedRedirectOrigins.some((origin: string) => origin === parsed.origin)
    ) {
      throw new Error("Redirect URI is not part of the allowed origins");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid redirect URI: ${error.message}`);
    }
    throw new Error("Invalid redirect URI");
  }
}

async function fetchExistingConfig(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<SsoConfigRow> {
  const { data, error } = await supabase
    .from("organization_sso_configs_view")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error("SSO configuration not found");
  }

  return data;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    ensureConfigured();

    const token = normalizeToken(req.headers.get("Authorization"));
    if (!token) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Get user's organization_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return jsonResponse({ error: "User profile not found" }, 404);
    }

    if (profile.role !== "superadmin") {
      return jsonResponse({ error: "Only superadmins can manage SSO configurations" }, 403);
    }

    const request = (await req.json()) as ManageSsoConfigRequest;

    switch (request.action) {
      case "create": {
        const payload = request.payload;
        if (!payload.provider || !payload.clientId) {
          return jsonResponse({ error: "provider and clientId are required" }, 400);
        }

        validateRedirectUri(payload.redirectUri);

        const { data, error } = await supabase
          .from("organization_sso_configs")
          .insert({
            organization_id: profile.organization_id,
            provider: payload.provider,
            client_id: payload.clientId,
            client_secret: payload.clientSecret ?? null,
            tenant_id: payload.tenantId ?? null,
            domain_hint: payload.domainHint ?? null,
            redirect_uri: payload.redirectUri ?? null,
            is_enabled: payload.isEnabled ?? false,
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single();

        if (error) {
          console.error("Failed to create SSO config", error);
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse({ data });
      }

      case "update": {
        const payload = request.payload;
        if (!payload.id) {
          return jsonResponse({ error: "id is required for updates" }, 400);
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          return jsonResponse({ error: "SSO configuration not found in your organization" }, 404);
        }

        const redirectUri = payload.redirectUri ?? existing.redirect_uri ?? null;
        validateRedirectUri(redirectUri);

        const updateData: any = {
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        };

        if (payload.clientId) updateData.client_id = payload.clientId;
        if (payload.clientSecret) updateData.client_secret = payload.clientSecret;
        if (payload.tenantId !== undefined) updateData.tenant_id = payload.tenantId;
        if (payload.domainHint !== undefined) updateData.domain_hint = payload.domainHint;
        if (redirectUri !== undefined) updateData.redirect_uri = redirectUri;
        if (payload.isEnabled !== undefined) updateData.is_enabled = payload.isEnabled;

        const { data, error } = await supabase
          .from("organization_sso_configs")
          .update(updateData)
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id)
          .select()
          .single();

        if (error) {
          console.error("Failed to update SSO config", error);
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse({ data });
      }

      case "rotate": {
        const payload = request.payload;
        if (!payload.id || !payload.clientSecret) {
          return jsonResponse({ error: "id and clientSecret are required for rotation" }, 400);
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          return jsonResponse({ error: "SSO configuration not found in your organization" }, 404);
        }

        const { data, error } = await supabase
          .from("organization_sso_configs")
          .update({
            client_secret: payload.clientSecret,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id)
          .select()
          .single();

        if (error) {
          console.error("Failed to rotate SSO secret", error);
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse({ data });
      }

      case "delete": {
        const payload = request.payload;
        if (!payload.id) {
          return jsonResponse({ error: "id is required for deletion" }, 400);
        }

        const { error } = await supabase
          .from("organization_sso_configs")
          .delete()
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id);

        if (error) {
          console.error("Failed to delete SSO config", error);
          return jsonResponse({ error: error.message }, 400);
        }

        return jsonResponse({ success: true });
      }

      case "test": {
        const payload = request.payload;
        if (!payload.id) {
          return jsonResponse({ error: "id is required for testing" }, 400);
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          return jsonResponse({ error: "SSO configuration not found in your organization" }, 404);
        }

        // Validate configuration completeness
        const validationErrors: string[] = [];

        if (!existing.client_id || existing.client_id.trim() === "") {
          validationErrors.push("Client ID is missing");
        }

        if (!existing.has_client_secret) {
          validationErrors.push("Client Secret is not configured");
        }

        if (!existing.redirect_uri || existing.redirect_uri.trim() === "") {
          validationErrors.push("Redirect URI is missing");
        }

        if (existing.provider === "microsoft" && (!existing.tenant_id || existing.tenant_id.trim() === "")) {
          validationErrors.push("Tenant ID is required for Microsoft Entra ID");
        }

        if (validationErrors.length > 0) {
          return jsonResponse({
            success: false,
            errors: validationErrors,
            message: "SSO configuration is incomplete",
          });
        }

        // All validations passed
        return jsonResponse({
          success: true,
          message: `${existing.provider === "google" ? "Google Workspace" : "Microsoft Entra ID"} SSO configuration is valid and ready`,
          config: {
            provider: existing.provider,
            client_id: existing.client_id,
            redirect_uri: existing.redirect_uri,
            tenant_id: existing.tenant_id,
            domain_hint: existing.domain_hint,
            is_enabled: existing.is_enabled,
          },
        });
      }

      default:
        return jsonResponse({ error: "Unsupported action" }, 400);
    }
  } catch (error) {
    console.error("manage-sso-config error", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 500);
  }
});
