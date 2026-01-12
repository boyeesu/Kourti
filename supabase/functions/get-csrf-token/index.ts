/**
 * Get or create CSRF token for authenticated user
 * Called after successful login to obtain CSRF token
 */

// @ts-ignore: Deno module
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore: Deno module
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { createCsrfTokenForUser, getCsrfTokenForUser } from "../_shared/csrfProtection.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
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
    allowMethods: ["GET", "POST", "OPTIONS"],
  };
}

serve(async (req: Request): Promise<Response> => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createJsonResponse(
        {
          success: false,
          error: 'Authentication required',
          errorCode: 'UNAUTHORIZED',
        },
        { status: 401, cors: corsOptions }
      );
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return createJsonResponse(
        {
          success: false,
          error: 'Invalid authorization header',
          errorCode: 'UNAUTHORIZED',
        },
        { status: 401, cors: corsOptions }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return createJsonResponse(
        {
          success: false,
          error: 'Invalid or expired token',
          errorCode: 'UNAUTHORIZED',
        },
        { status: 401, cors: corsOptions }
      );
    }

    // Check if user already has a valid token
    let csrfToken = await getCsrfTokenForUser(supabase, user.id);

    // If no valid token exists, create a new one
    if (!csrfToken) {
      csrfToken = await createCsrfTokenForUser(supabase, user.id, 24); // 24 hours
    }

    return createJsonResponse(
      {
        success: true,
        csrfToken,
      },
      {
        status: 200,
        cors: corsOptions,
      }
    );
  } catch (error: unknown) {
    return createErrorResponse(error, corsOptions, {
      function: 'get-csrf-token',
    });
  }
});
