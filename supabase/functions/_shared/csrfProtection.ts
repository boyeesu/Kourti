/**
 * CSRF Protection utilities
 * Implements token-based CSRF protection for edge functions
 * Uses session-based token storage in database
 */

import { HttpError } from './httpError.ts';
// @ts-ignore: Deno module
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate CSRF token format
 */
export function validateCsrfTokenFormat(token: string | null): boolean {
  if (!token) {
    return false;
  }
  // Token should be 64 hex characters (32 bytes = 64 hex chars)
  return token.length === 64 && /^[a-f0-9]+$/i.test(token);
}

/**
 * Validate CSRF token against expected token
 */
export function validateCsrfToken(requestToken: string | null, expectedToken?: string): boolean {
  if (!requestToken || !expectedToken) {
    return false;
  }
  return requestToken === expectedToken && validateCsrfTokenFormat(requestToken);
}

/**
 * Extract CSRF token from request headers
 */
export function getCsrfTokenFromRequest(req: Request): string | null {
  // Check X-CSRF-Token header first
  const headerToken = req.headers.get('X-CSRF-Token');
  if (headerToken) {
    return headerToken;
  }

  // Check X-XSRF-Token (common alternative)
  const xsrfToken = req.headers.get('X-XSRF-Token');
  if (xsrfToken) {
    return xsrfToken;
  }

  // Could also check body for form submissions
  return null;
}

/**
 * Require CSRF token validation
 * Throws HttpError if token is invalid
 */
export function requireCsrfToken(req: Request, expectedToken?: string): void {
  const requestToken = getCsrfTokenFromRequest(req);
  
  if (!validateCsrfToken(requestToken, expectedToken)) {
    throw new HttpError('Invalid or missing CSRF token', 403, 'CSRF_ERROR');
  }
}

/**
 * Create and store CSRF token for a user session
 * Returns the token to be sent to the client
 */
export async function createCsrfTokenForUser(
  supabase: SupabaseClient,
  userId: string,
  expiresInHours: number = 24
): Promise<string> {
  // Generate new token
  const csrfToken = generateCsrfToken();
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  // Delete any existing tokens for this user (one token per session)
  await supabase
    .from('user_csrf_sessions')
    .delete()
    .eq('user_id', userId);

  // Insert new token
  const { error } = await supabase
    .from('user_csrf_sessions')
    .insert({
      user_id: userId,
      csrf_token: csrfToken,
      expires_at: expiresAt.toISOString(),
      last_used_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to store CSRF token:', error);
    throw new HttpError('Failed to create CSRF token', 500, 'CSRF_TOKEN_CREATION_ERROR');
  }

  return csrfToken;
}

/**
 * Validate CSRF token from request against user's stored token
 * Updates last_used_at on successful validation
 */
export async function validateCsrfTokenForUser(
  supabase: SupabaseClient,
  userId: string,
  req: Request
): Promise<boolean> {
  const requestToken = getCsrfTokenFromRequest(req);

  if (!requestToken || !validateCsrfTokenFormat(requestToken)) {
    return false;
  }

  // Get token from database
  const { data: session, error } = await supabase
    .from('user_csrf_sessions')
    .select('csrf_token, expires_at')
    .eq('user_id', userId)
    .eq('csrf_token', requestToken)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) {
    return false;
  }

  // Update last_used_at
  await supabase
    .from('user_csrf_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('csrf_token', requestToken);

  return true;
}

/**
 * Require CSRF token validation for a user
 * Throws HttpError if token is invalid or missing
 */
export async function requireCsrfTokenForUser(
  supabase: SupabaseClient,
  userId: string,
  req: Request
): Promise<void> {
  const isValid = await validateCsrfTokenForUser(supabase, userId, req);
  
  if (!isValid) {
    throw new HttpError('Invalid or expired CSRF token', 403, 'CSRF_ERROR');
  }
}

/**
 * Revoke CSRF token for a user (e.g., on logout or password change)
 */
export async function revokeCsrfTokenForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('user_csrf_sessions')
    .delete()
    .eq('user_id', userId);
}

/**
 * Get CSRF token for a user (if exists and not expired)
 */
export async function getCsrfTokenForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: session } = await supabase
    .from('user_csrf_sessions')
    .select('csrf_token, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return session?.csrf_token || null;
}

/**
 * CSRF protection middleware
 * For functions that need CSRF protection
 * Note: Supabase Auth already provides some CSRF protection via SameSite cookies
 * This adds an additional layer for sensitive operations
 */
export function withCsrfProtection(
  handler: (req: Request) => Promise<Response>,
  options: {
    requireToken?: boolean;
    getExpectedToken?: (req: Request) => Promise<string | undefined>;
  } = {}
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    // Skip CSRF check for OPTIONS requests
    if (req.method === 'OPTIONS') {
      return handler(req);
    }

    // Skip CSRF check if not required
    if (options.requireToken !== true) {
      return handler(req);
    }

    // Get expected token if provided
    const expectedToken = options.getExpectedToken
      ? await options.getExpectedToken(req)
      : undefined;

    // Validate CSRF token
    try {
      requireCsrfToken(req, expectedToken);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError('CSRF validation failed', 403, 'CSRF_ERROR');
    }

    return handler(req);
  };
}
