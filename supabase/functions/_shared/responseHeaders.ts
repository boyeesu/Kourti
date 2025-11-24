declare const Deno: any;

const DEFAULT_ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
];

const DEFAULT_PERMISSIONS_POLICY = [
  'accelerometer=()',
  'ambient-light-sensor=()',
  'autoplay=()',
  'camera=()',
  'encrypted-media=()',
  'fullscreen=(self)',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'midi=()',
  'payment=()',
  'picture-in-picture=(self)',
  'sync-xhr=(self)',
  'usb=()',
].join(', ');

const DEFAULT_HSTS = 'max-age=31536000; includeSubDomains';

function isTrue(value: string | null | undefined): boolean {
  return value !== undefined && value !== null && value.toLowerCase() === 'true';
}

function shouldIncludeHsts(): boolean {
  if (isTrue(Deno.env.get('DISABLE_HSTS')) || isTrue(Deno.env.get('DISABLE_STRICT_TRANSPORT_SECURITY'))) {
    return false;
  }

  const environment = (Deno.env.get('ENVIRONMENT') ?? Deno.env.get('NODE_ENV') ?? '').toLowerCase();
  if (environment === 'development' || environment === 'local') {
    return false;
  }

  const deploymentMode = (Deno.env.get('SUPABASE_FUNCTIONS_ENV') ?? '').toLowerCase();
  if (deploymentMode === 'local') {
    return false;
  }

  return true;
}

export interface CorsSecurityHeadersOptions {
  origin?: string;
  requestOrigin?: string | null;
  allowedOrigins?: string[];
  allowMethods?: string[];
  allowHeaders?: string[];
  allowCredentials?: boolean;
  exposeHeaders?: string[];
  varyOrigin?: boolean;
  cacheControl?: string | false;
  includeHsts?: boolean;
  permissionsPolicy?: string;
  referrerPolicy?: string;
}

function resolveOrigin(options: CorsSecurityHeadersOptions): string {
  const { origin, requestOrigin, allowedOrigins } = options;

  if (origin) {
    return origin;
  }

  if (allowedOrigins && allowedOrigins.length > 0) {
    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }

    return allowedOrigins[0] ?? '*';
  }

  if (requestOrigin) {
    return requestOrigin;
  }

  return '*';
}

export function createCorsSecurityHeaders(options: CorsSecurityHeadersOptions = {}): Record<string, string> {
  const {
    allowMethods = ['POST', 'OPTIONS'],
    allowHeaders = DEFAULT_ALLOWED_HEADERS,
    allowCredentials = false,
    exposeHeaders,
    varyOrigin,
    cacheControl = 'no-store, no-cache, must-revalidate',
    includeHsts,
    permissionsPolicy = DEFAULT_PERMISSIONS_POLICY,
    referrerPolicy = 'strict-origin-when-cross-origin',
  } = options;

  const resolvedOrigin = resolveOrigin(options);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': allowMethods.join(', '),
    'Access-Control-Allow-Headers': allowHeaders.join(', '),
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': referrerPolicy,
    'Permissions-Policy': permissionsPolicy,
  };

  if (allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (exposeHeaders && exposeHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = exposeHeaders.join(', ');
  }

  const shouldVary = varyOrigin ?? (resolvedOrigin !== '*' && resolvedOrigin !== options.origin);
  if (shouldVary) {
    headers['Vary'] = 'Origin';
  }

  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }

  const applyHsts = includeHsts ?? shouldIncludeHsts();
  if (applyHsts) {
    headers['Strict-Transport-Security'] = DEFAULT_HSTS;
  }

  return headers;
}

export interface JsonResponseInit extends Omit<ResponseInit, 'headers'> {
  headers?: HeadersInit;
  cors?: CorsSecurityHeadersOptions;
}

export function createJsonResponse(body: unknown, init: JsonResponseInit = {}): Response {
  const corsHeaders = createCorsSecurityHeaders(init.cors);
  const responseHeaders = new Headers({
    ...corsHeaders,
    'Content-Type': 'application/json',
  });

  if (init.headers) {
    const extraHeaders = new Headers(init.headers);
    extraHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers: responseHeaders,
  });
}

export function createEmptyResponse(init: JsonResponseInit = {}): Response {
  const corsHeaders = createCorsSecurityHeaders(init.cors);
  const responseHeaders = new Headers(corsHeaders);

  if (init.headers) {
    const extraHeaders = new Headers(init.headers);
    extraHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
  }

  return new Response(null, {
    ...init,
    headers: responseHeaders,
  });
}
