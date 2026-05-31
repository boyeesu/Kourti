import { logError, logInfo } from './logger';

/**
 * CSRF protection module that manages token generation,
 * validation, and usage in API requests.
 */

// Cookie name constants for better maintainability
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const TOKEN_EXPIRY_HOURS = 4; // Shorter expiry for better security

/**
 * Generate a cryptographically secure random CSRF token
 */
export const generateCSRFToken = (): string => {
  const buffer = new Uint8Array(32);
  window.crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Set a secure cookie with the CSRF token
 */
const setCsrfCookie = (token: string): void => {
  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + TOKEN_EXPIRY_HOURS);

  // Set as SameSite strict, Secure cookie (note: httpOnly not possible via document.cookie)
  document.cookie = `${CSRF_COOKIE_NAME}=${token}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict; Secure`;
};

/**
 * Add a CSRF token meta tag to the document head and set a cookie
 */
export const setCSRFToken = (): string => {
  const existingToken = getCSRFToken();
  if (existingToken) return existingToken;

  const token = generateCSRFToken();

  try {
    // Create meta tag if it doesn't exist
    let metaTag = document.querySelector('meta[name="csrf-token"]');
    if (!metaTag) {
      metaTag = document.createElement('meta');
      metaTag.setAttribute('name', 'csrf-token');
      document.head.appendChild(metaTag);
    }

    // Set the token value in meta tag
    metaTag.setAttribute('content', token);

    // Set the cookie
    setCsrfCookie(token);

    // Also store in sessionStorage (more secure than localStorage for sensitive tokens)
    sessionStorage.setItem(CSRF_COOKIE_NAME, token);

    logInfo('CSRF token generated and set');
    return token;
  } catch (error) {
    logError('Failed to set CSRF token', error);
    return token; // Still return the token even if setting fails
  }
};

/**
 * Get the current CSRF token from various sources with fallbacks
 */
export const getCSRFToken = (): string | null => {
  try {
    // First try to get from meta tag (fastest)
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
      const token = metaTag.getAttribute('content');
      if (token) return token;
    }

    // Then try sessionStorage
    const sessionToken = sessionStorage.getItem(CSRF_COOKIE_NAME);
    if (sessionToken) return sessionToken;

    // Last resort, try to get from cookie
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === CSRF_COOKIE_NAME && value) {
        return value;
      }
    }
  } catch (error) {
    logError('Error retrieving CSRF token', error);
  }

  return null;
};

/**
 * Add CSRF token to a fetch Request
 */
export const addCSRFToRequest = (request: RequestInit = {}): RequestInit => {
  const token = getCSRFToken() || setCSRFToken();
  const headers = new Headers(request.headers || {});

  // Only add if not already present
  if (!headers.has(CSRF_HEADER_NAME)) {
    headers.set(CSRF_HEADER_NAME, token);
  }

  return {
    ...request,
    headers,
  };
};

/**
 * Verify that the CSRF token is valid
 */
export const verifyCSRFToken = (token: string): boolean => {
  const storedToken = getCSRFToken();
  return !!storedToken && token === storedToken;
};

/**
 * Refresh the CSRF token
 */
export const refreshCSRFToken = (): string => {
  // Clear existing token from all storage mechanisms
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    metaTag.removeAttribute('content');
  }

  sessionStorage.removeItem(CSRF_COOKIE_NAME);
  document.cookie = `${CSRF_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;

  // Generate and set a new token
  return setCSRFToken();
};

/**
 * Initialize CSRF protection for the application.
 *
 * NOTE (M6): the previous implementation monkey-patched `window.fetch` to inject
 * the `X-CSRF-Token` header on same-origin, state-changing requests. That code
 * was dead: every API call goes cross-origin to `VITE_BACKEND_API_URL`, so the
 * same-origin guard never matched and no token was ever sent. Staff/portal auth
 * is bearer-token-in-header (not cookie-based), so it is not CSRF-vulnerable and
 * the patch provided only false assurance. The fetch patch, the periodic
 * refresh interval, and the auth-state listener have therefore been removed.
 *
 * The token is still minted on init and exposed via `addCSRFToRequest()`, which
 * the logger uses for the optional same-origin log endpoint
 * (`VITE_LOG_API_ENDPOINT`) — the one genuinely same-origin caller.
 */
export const initCSRFProtection = (): void => {
  try {
    // Set initial token (consumed by addCSRFToRequest for the log endpoint).
    setCSRFToken();
    logInfo('CSRF token initialized');
  } catch (error) {
    logError('Failed to initialize CSRF protection', error);
  }
};
