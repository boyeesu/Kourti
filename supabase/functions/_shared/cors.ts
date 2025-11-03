const DEFAULT_ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL") ?? undefined,
  "http://localhost:3000",
  "https://localhost:3000",
  "http://localhost:5173",
  "https://localhost:5173",
  "http://localhost:54321",
  "https://localhost:54321",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:54321",
].filter((value): value is string => Boolean(value));

const envAllowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const allowedOrigins = envAllowedOrigins.length > 0
  ? envAllowedOrigins
  : DEFAULT_ALLOWED_ORIGINS;

export interface CorsOptions {
  allowCredentials?: boolean;
  allowMethods?: string;
  allowHeaders?: string;
}

export interface CorsResult {
  headers: Record<string, string>;
  isAllowed: boolean;
  origin: string | null;
}

const DEFAULT_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const DEFAULT_ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";

export function buildCorsHeaders(requestOrigin: string | null, options: CorsOptions = {}): CorsResult {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": options.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": options.allowMethods ?? DEFAULT_ALLOW_METHODS,
  };

  const allowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : null;

  const isAllowed = !requestOrigin || Boolean(allowedOrigin);

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;

    if (options.allowCredentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  return {
    headers,
    isAllowed,
    origin: allowedOrigin,
  };
}
