/**
 * CSRF-protected Supabase Functions client
 * Automatically includes CSRF token in all function invocations
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Get CSRF token from storage
 */
function getCsrfToken(): string | null {
  return sessionStorage.getItem('csrf_token');
}

/**
 * Fetch CSRF token from server
 */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return null;
    }

    const { data, error } = await supabase.functions.invoke('get-csrf-token', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error || !data?.csrfToken) {
      return null;
    }

    sessionStorage.setItem('csrf_token', data.csrfToken);
    return data.csrfToken;
  } catch {
    return null;
  }
}

/**
 * Invoke Supabase Edge Function with CSRF protection
 * Automatically includes CSRF token in headers
 */
export async function invokeFunctionWithCsrf<T = unknown>(
  functionName: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    // Get or fetch CSRF token
    let csrfToken = getCsrfToken();
    if (!csrfToken) {
      csrfToken = await fetchCsrfToken();
    }

    // Prepare headers with CSRF token
    const headers: Record<string, string> = {
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

    // If CSRF error, try refreshing token once
    if (error && (error.message?.includes('CSRF') || error.message?.includes('csrf'))) {
      const newToken = await fetchCsrfToken();
      if (newToken) {
        headers['X-CSRF-Token'] = newToken;
        // Retry once
        const retryResult = await supabase.functions.invoke(functionName, {
          body: options?.body as Record<string, unknown>,
          headers,
        });
        return retryResult;
      }
    }

    return { data, error };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Helper to add CSRF token to any fetch request
 */
export function addCsrfToHeaders(headers: HeadersInit = {}): HeadersInit {
  const csrfToken = getCsrfToken();
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
