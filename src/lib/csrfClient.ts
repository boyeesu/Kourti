/**
 * CSRF-protected API client
 *
 * Previously this module wrapped Supabase Edge Functions with CSRF tokens.
 * Now that all traffic routes through the Node backend, the CSRF token is
 * handled automatically by the fetch interceptor in csrf.ts and the
 * httpOnly cookie flow in authClient.ts.
 *
 * This file is kept for backward compatibility -- existing callers can
 * continue importing `invokeFunctionWithCsrf` and `addCsrfToHeaders`.
 * Under the hood they delegate to `invokeNodeApi`.
 */

import { invokeNodeApi } from '@/lib/backendApi';
import { getCSRFToken, setCSRFToken } from '@/lib/csrf';

/**
 * Invoke a backend endpoint with CSRF protection.
 *
 * `functionName` is interpreted as a backend path segment, e.g.
 *   invokeFunctionWithCsrf('analyze-contract', { body: { ... } })
 * becomes a POST to /api/v1/functions/<functionName>.
 */
export async function invokeFunctionWithCsrf<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await invokeNodeApi<T>(`/api/v1/functions/${functionName}`, {
      method: 'POST',
      body: options?.body as Record<string, unknown>,
      headers: options?.headers,
    });

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Helper to add CSRF token to any fetch request headers.
 */
export async function addCsrfToHeaders(headers: HeadersInit = {}): Promise<HeadersInit> {
  const csrfToken = getCSRFToken() || setCSRFToken();
  const headersObj =
    headers instanceof Headers
      ? Object.fromEntries(headers.entries())
      : Array.isArray(headers)
        ? Object.fromEntries(headers)
        : headers;

  if (csrfToken && !headersObj['X-CSRF-Token'] && !headersObj['x-csrf-token']) {
    return {
      ...headersObj,
      'X-CSRF-Token': csrfToken,
    };
  }

  return headersObj;
}

/**
 * Initialize CSRF token on application start (no-op now; kept for compat)
 */
export async function initCsrfToken(): Promise<void> {
  setCSRFToken();
}

/**
 * Clear CSRF token on logout
 */
export function clearCsrfTokenOnLogout(): void {
  sessionStorage.removeItem('csrf_token');
  sessionStorage.removeItem('csrf_token_expiry');
}
