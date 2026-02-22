declare const Deno: any;

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  ...(Deno.env.get("ENVIRONMENT") !== "production" ? [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:8083",
  ] : []),
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

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

function ensureConfigured() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new HttpError('Supabase credentials are not configured', 503, 'CONFIG_ERROR');
  }

  if (!ssoSecretKey) {
    throw new HttpError('SSO secret key is not configured', 503, 'CONFIG_ERROR');
  }
}

function normalizeToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

const ALLOWED_REDIRECT_PATHS = [
  '/auth/callback',
  '/sso/callback',
  '/auth',
];

function validateRedirectUri(uri?: string | null) {
  if (!uri) return;

  try {
    const parsed = new URL(uri);
    
    // Check origin
    if (
      allowedRedirectOrigins.length > 0 &&
      !allowedRedirectOrigins.some((origin: string) => origin === parsed.origin)
    ) {
      throw new Error("Redirect URI origin is not in allowed origins");
    }
    
    // Check path
    const isValidPath = ALLOWED_REDIRECT_PATHS.some(validPath => 
      parsed.pathname === validPath || parsed.pathname.startsWith(validPath + '/')
    );
    
    if (!isValidPath) {
      throw new Error("Redirect URI path is not allowed");
    }
    
    // Reject query parameters that could enable open redirects
    const dangerousParams = ['redirect', 'return', 'next', 'url', 'return_to', 'continue', 'returnUrl'];
    const hasOpenRedirect = dangerousParams.some(param => parsed.searchParams.has(param));
    
    if (hasOpenRedirect) {
      throw new Error("Redirect URI cannot contain redirect parameters");
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
    .from("organization_sso_configs_view" as any)
    .select("*")
    .eq("id", id)
    .single() as { data: SsoConfigRow | null; error: any };

  if (error || !data) {
    throw new HttpError('SSO configuration not found', 404, 'SSO_NOT_FOUND');
  }

  return data;
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === "OPTIONS") {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    ensureConfigured();

    const token = normalizeToken(req.headers.get("Authorization"));
    if (!token) {
      throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error('Authentication failed:', userError?.message);
      throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
    }

    console.log(`Processing SSO config management for user ${user.id}`);

    // CSRF Protection - critical for SSO configuration changes
    await requireCsrfTokenForUser(supabase, user.id, req);

    // Rate limiting - prevent abuse of sensitive SSO configuration operations
    const rateLimitId = user.id;
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.SENSITIVE, // 3 requests per minute for sensitive operations
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Get user's organization_id
    const { data: profile, error: profileError } = await supabase
      .from("profiles" as any)
      .select("organization_id")
      .eq("user_id", user.id)
      .single() as { data: { organization_id: string } | null; error: any };

    if (profileError || !profile) {
      throw new HttpError('User profile not found', 404, 'PROFILE_NOT_FOUND');
    }

    // Check if user has superadmin role in user_role_assignments
    const { data: roleAssignments, error: roleError } = await supabase
      .from("user_role_assignments" as any)
      .select("role_name")
      .eq("user_id", user.id)
      .eq("organization_id", profile.organization_id) as { data: { role_name: string }[] | null; error: any };

    if (roleError) {
      console.error("Failed to check user permissions", roleError);
      throw new HttpError('Failed to check user permissions', 500, 'PERMISSION_CHECK_FAILED');
    }

    const isSuperadmin = roleAssignments?.some((r: { role_name: string }) => r.role_name === "superadmin");

    if (!isSuperadmin) {
      throw new HttpError('Only superadmins can manage SSO configurations', 403, 'FORBIDDEN');
    }

    const request = (await req.json()) as ManageSsoConfigRequest;

    switch (request.action) {
      case "create": {
        const payload = request.payload;
        if (!payload.provider || !payload.clientId) {
          throw new HttpError('provider and clientId are required', 400, 'INVALID_INPUT');
        }

        validateRedirectUri(payload.redirectUri);

        const { data, error } = await supabase
          .from("organization_sso_configs" as any)
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
          } as any)
          .select()
          .single();

        if (error) {
          console.error("Failed to create SSO config", error);
          throw new HttpError(`Failed to create SSO config: ${error.message}`, 400, 'SSO_CREATE_FAILED');
        }

        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
        return createJsonResponse({ data }, { cors: corsOptions, headers: rateLimitHeaders });
      }

      case "update": {
        const payload = request.payload;
        if (!payload.id) {
          throw new HttpError('id is required for updates', 400, 'INVALID_INPUT');
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          throw new HttpError('SSO configuration not found in your organization', 404, 'SSO_NOT_FOUND');
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
          .from("organization_sso_configs" as any)
          .update(updateData as any)
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id)
          .select()
          .single();

        if (error) {
          console.error("Failed to update SSO config", error);
          throw new HttpError(`Failed to update SSO config: ${error.message}`, 400, 'SSO_UPDATE_FAILED');
        }

        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
        return createJsonResponse({ data }, { cors: corsOptions, headers: rateLimitHeaders });
      }

      case "rotate": {
        const payload = request.payload;
        if (!payload.id || !payload.clientSecret) {
          throw new HttpError('id and clientSecret are required for rotation', 400, 'INVALID_INPUT');
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          throw new HttpError('SSO configuration not found in your organization', 404, 'SSO_NOT_FOUND');
        }

        const { data, error } = await supabase
          .from("organization_sso_configs" as any)
          .update({
            client_secret: payload.clientSecret,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id)
          .select()
          .single();

        if (error) {
          console.error("Failed to rotate SSO secret", error);
          throw new HttpError(`Failed to rotate SSO secret: ${error.message}`, 400, 'SSO_ROTATE_FAILED');
        }

        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
        return createJsonResponse({ data }, { cors: corsOptions, headers: rateLimitHeaders });
      }

      case "delete": {
        const payload = request.payload;
        if (!payload.id) {
          throw new HttpError('id is required for deletion', 400, 'INVALID_INPUT');
        }

        const { error } = await supabase
          .from("organization_sso_configs" as any)
          .delete()
          .eq("id", payload.id)
          .eq("organization_id", profile.organization_id);

        if (error) {
          console.error("Failed to delete SSO config", error);
          throw new HttpError(`Failed to delete SSO config: ${error.message}`, 400, 'SSO_DELETE_FAILED');
        }

        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
        return createJsonResponse({ success: true }, { cors: corsOptions, headers: rateLimitHeaders });
      }

      case "test": {
        const payload = request.payload;
        if (!payload.id) {
          throw new HttpError('id is required for testing', 400, 'INVALID_INPUT');
        }

        const existing = await fetchExistingConfig(supabase, payload.id);

        if (existing.organization_id !== profile.organization_id) {
          throw new HttpError('SSO configuration not found in your organization', 404, 'SSO_NOT_FOUND');
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

        const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);

        if (validationErrors.length > 0) {
          return createJsonResponse(
            {
              data: {
                success: false,
                errors: validationErrors,
                message: "SSO configuration is incomplete",
              },
            },
            { cors: corsOptions, headers: rateLimitHeaders },
          );
        }

        // All validations passed
        return createJsonResponse(
          {
            data: {
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
            },
          },
          { cors: corsOptions, headers: rateLimitHeaders },
        );
      }

      default:
        throw new HttpError('Unsupported action', 400, 'INVALID_ACTION');
    }
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'manage-sso-config',
    });
  }
});
