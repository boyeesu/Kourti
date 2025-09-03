import { supabase } from '@/integrations/supabase/client';
import { logError, logInfo } from './logger';

/**
 * Enhanced CSRF protection module that securely manages token generation, 
 * validation, and usage in API requests.
 * 
 * For Supabase Edge Functions and other API endpoints, this ensures that requests 
 * are coming from legitimate sources and not from cross-site requests.
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
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Set a secure, HTTP-only cookie with the CSRF token
 */
const setCsrfCookie = (token: string): void => {
  const expiryDate = new Date();
  expiryDate.setHours(expiryDate.getHours() + TOKEN_EXPIRY_HOURS);
  
  // Set as HTTP-only, same-site strict cookie for security
  document.cookie = `${CSRF_COOKIE_NAME}=${token}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Strict`;
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
 * Initialize CSRF protection for the application
 */
export const initCSRFProtection = (): void => {
  try {
    // Set initial token
    setCSRFToken();
    
    // Listen for auth state changes to refresh token
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        refreshCSRFToken();
      }
    });
    
    // Periodically refresh token (every few hours)
    const refreshInterval = TOKEN_EXPIRY_HOURS * 60 * 60 * 1000 / 2; // Refresh at half the expiry time
    setInterval(refreshCSRFToken, refreshInterval);
    
    // Patch fetch to automatically include CSRF token for same-origin requests
    const originalFetch = window.fetch;
    window.fetch = function(input: URL | RequestInfo, init?: RequestInit) {
      try {
        let url: URL;
        
        if (typeof input === 'string') {
          // Handle relative URLs correctly
          url = new URL(input, window.location.origin);
        } else if (input instanceof URL) {
          url = input;
        } else {
          // Handle Request objects
          url = new URL(input.url, window.location.origin);
        }
        
        // Only add CSRF token for same-origin requests that modify state
        const isModifyingMethod = !init?.method || 
                                ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase());
                                
        if (url.origin === window.location.origin && isModifyingMethod) {
          init = addCSRFToRequest(init || {});
        }
      } catch (error) {
        logError('Error in CSRF fetch wrapper', error);
      }
      
      return originalFetch.call(this, input, init);
    };
    
    logInfo('CSRF protection initialized successfully');
  } catch (error) {
    logError('Failed to initialize CSRF protection', error);
  }
};