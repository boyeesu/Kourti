/**
 * CSRF-protected Supabase Functions client
 * Automatically includes CSRF token in all function invocations
 * Implements proactive token refresh to prevent expiry issues
 */

import { supabase } from '@/integrations/supabase/client';

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_EXPIRY_KEY = 'csrf_token_expiry';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/**
 * Get CSRF token from storage
 */
function getCsrfToken(): string | null {
  return sessionStorage.getItem(CSRF_TOKEN_KEY);
}

/**
 * Get CSRF token expiry timestamp from storage
 */
function getCsrfTokenExpiry(): number | null {
  const expiry = sessionStorage.getItem(CSRF_EXPIRY_KEY);
  return expiry ? parseInt(expiry, 10) : null;
}

/**
 * Check if CSRF token is expired or will expire soon
 */
function isTokenExpiredOrExpiring(): boolean {
  const expiry = getCsrfTokenExpiry();
  if (!expiry) {
    return true; // No expiry info means token should be refreshed
  }

  // Refresh if expired or will expire within buffer time
  const now = Date.now();
  return now >= (expiry - TOKEN_REFRESH_BUFFER_MS);
}

/**
 * Clear CSRF token from storage
 */
function clearCsrfToken(): void {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
  sessionStorage.removeItem(CSRF_EXPIRY_KEY);
}

/**
 * Fetch CSRF token from server
 */
async function fetchCsrfToken(force: boolean = false): Promise<string | null> {
  try {
    // Check if we have a valid token and don't need to force refresh
    if (!force) {
      const existingToken = getCsrfToken();
      if (existingToken && !isTokenExpiredOrExpiring()) {
        return existingToken;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      clearCsrfToken();
      return null;
    }

    const { data, error } = await supabase.functions.invoke('get-csrf-token', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error || !data?.csrfToken) {
      console.warn('Failed to fetch CSRF token:', error?.message);
      return null;
    }

    // Store token and its expiry time (default 24 hours from now)
    const expiryTime = data.expiresAt
      ? new Date(data.expiresAt).getTime()
      : Date.now() + (24 * 60 * 60 * 1000);

    sessionStorage.setItem(CSRF_TOKEN_KEY, data.csrfToken);
    sessionStorage.setItem(CSRF_EXPIRY_KEY, expiryTime.toString());

    return data.csrfToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
}

/**
 * Ensure we have a valid CSRF token before making a request
 * Proactively refreshes if expired or expiring soon
 */
async function ensureValidCsrfToken(): Promise<string | null> {
  const existingToken = getCsrfToken();

  // If no token or token is expired/expiring, fetch a new one
  if (!existingToken || isTokenExpiredOrExpiring()) {
    return await fetchCsrfToken(true);
  }

  return existingToken;
}

/**
 * Extract a clear error message from edge function invoke result.
 * When the function returns 4xx with a JSON body like { error: "..." }, surface that message.
 */
async function normalizeInvokeResult<T>(result: { data: T | null; error: unknown }): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = result;
  if (!error) return { data, error: null };

  const err = error as Error & { name?: string; context?: Response };
  if (err.name === 'FunctionsHttpError' && err.context && typeof err.context.json === 'function') {
    try {
      const body = await err.context.json() as { error?: string; errorCode?: string };
      if (body?.error) {
        return { data: null, error: new Error(body.error) };
      }
    } catch {
      // ignore json parse failure
    }
  }
  return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
}

/**
 * Invoke Supabase Edge Function with CSRF protection
 * Automatically includes CSRF token in headers
 * Proactively ensures token is valid before making request
 * Explicitly sends Authorization so 401s from stale/absent JWT are avoided
 */
export async function invokeFunctionWithCsrf<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    // Validate session so we never send an expired JWT (avoids 401 from edge gateway)
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return {
        data: null,
        error: new Error('Authentication required'),
      };
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return {
        data: null,
        error: new Error('Authentication required'),
      };
    }

    // Proactively ensure we have a valid token (not expired/expiring)
    const csrfToken = await ensureValidCsrfToken();

    // Prepare headers: always send Authorization so gateway accepts the request
    const headers: Record<string, string> = {
      Authorization: `Bearer ${session.access_token}`,
      ...options?.headers,
    };

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Invoke function
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options?.body as Record<string, unknown>,
      headers,
    });

    // Detect CSRF / auth failures by checking HTTP status code from the Response context.
    // The old message-based check never matched because FunctionsHttpError.message is
    // always the generic "Edge Function returned a non-2xx status code".
    const httpStatus = (error as any)?.context?.status as number | undefined;
    const isCsrfOrAuthFailure = error && (
      httpStatus === 401 || httpStatus === 403 ||
      error.message?.includes('CSRF') || error.message?.includes('csrf')
    );

    if (isCsrfOrAuthFailure) {
      console.log('CSRF/auth error detected (HTTP', httpStatus, '), refreshing token and retrying...');

      // Force fetch a new token
      const newToken = await fetchCsrfToken(true);

      if (newToken) {
        headers['X-CSRF-Token'] = newToken;
        // Re-fetch session for retry in case it was refreshed
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession?.access_token) {
          headers.Authorization = `Bearer ${retrySession.access_token}`;
        }

        // Retry once with new token
        const retryResult = await supabase.functions.invoke(functionName, {
          body: options?.body as Record<string, unknown>,
          headers,
        });

        return await normalizeInvokeResult(retryResult);
      }
    }

    return await normalizeInvokeResult({ data, error });
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Helper to add CSRF token to any fetch request
 * Ensures token is valid before adding to headers
 */
export async function addCsrfToHeaders(headers: HeadersInit = {}): Promise<HeadersInit> {
  const csrfToken = await ensureValidCsrfToken();
  const headersObj = headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : (Array.isArray(headers) ? Object.fromEntries(headers) : headers);

  if (csrfToken && !headersObj['X-CSRF-Token'] && !headersObj['x-csrf-token']) {
    return {
      ...headersObj,
      'X-CSRF-Token': csrfToken,
    };
  }

  return headersObj;
}

/**
 * Initialize CSRF token on application start
 * Fetches initial token if user is authenticated
 */
export async function initCsrfToken(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    await fetchCsrfToken();
  }
}

/**
 * Clear CSRF token on logout
 */
export function clearCsrfTokenOnLogout(): void {
  clearCsrfToken();
}

// Listen for auth state changes to manage token lifecycle
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearCsrfToken();
    } else if (event === 'SIGNED_IN' && session) {
      // Fetch token after sign in
      fetchCsrfToken(true).catch(console.error);
    }
  });
}
