import { supabase } from '@/integrations/supabase/client';

/**
 * Manages CSRF token generation, validation, and usage in API requests.
 * 
 * For Supabase Edge Functions, this ensures that requests are coming
 * from legitimate sources and not from cross-site requests.
 */

// Generate a random CSRF token
export const generateCSRFToken = (): string => {
  const buffer = new Uint8Array(32);
  window.crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// Add a CSRF token meta tag to the document head
export const setCSRFToken = (): string => {
  const existingToken = getCSRFToken();
  if (existingToken) return existingToken;
  
  const token = generateCSRFToken();
  
  // Create meta tag if it doesn't exist
  let metaTag = document.querySelector('meta[name="csrf-token"]');
  if (!metaTag) {
    metaTag = document.createElement('meta');
    metaTag.setAttribute('name', 'csrf-token');
    document.head.appendChild(metaTag);
  }
  
  // Set the token value
  metaTag.setAttribute('content', token);
  
  // Also store in localStorage with expiration (24 hours)
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  localStorage.setItem('csrf-token', JSON.stringify({ token, expiry }));
  
  return token;
};

// Get the current CSRF token
export const getCSRFToken = (): string | null => {
  // First try to get from meta tag
  const metaTag = document.querySelector('meta[name="csrf-token"]');
  if (metaTag) {
    const token = metaTag.getAttribute('content');
    if (token) return token;
  }
  
  // Then try localStorage
  const storedTokenData = localStorage.getItem('csrf-token');
  if (storedTokenData) {
    try {
      const { token, expiry } = JSON.parse(storedTokenData);
      // Check if token is expired
      if (expiry > Date.now()) {
        return token;
      } else {
        // Clear expired token
        localStorage.removeItem('csrf-token');
      }
    } catch (e) {
      console.error('Error parsing CSRF token from localStorage');
      localStorage.removeItem('csrf-token');
    }
  }
  
  return null;
};

// Add CSRF token to a fetch Request
export const addCSRFToRequest = (request: RequestInit = {}): RequestInit => {
  const token = getCSRFToken() || setCSRFToken();
  
  return {
    ...request,
    headers: {
      ...request.headers,
      'X-CSRF-Token': token,
    },
  };
};

// Verify that the CSRF token is valid (for server-side use)
export const verifyCSRFToken = (token: string): boolean => {
  const storedToken = getCSRFToken();
  return !!storedToken && token === storedToken;
};

// Initialize CSRF protection for the application
export const initCSRFProtection = (): void => {
  // Set initial token if not present
  setCSRFToken();
  
  // Listen for auth state changes to refresh token
  supabase.auth.onAuthStateChange(() => {
    setCSRFToken();
  });
  
  // Periodically refresh token (every 12 hours)
  setInterval(setCSRFToken, 12 * 60 * 60 * 1000);
  
  // Patch fetch to automatically include CSRF token
  const originalFetch = window.fetch;
  window.fetch = function(input: RequestInfo, init?: RequestInit) {
    // Only add CSRF token for same-origin requests
    const url = typeof input === 'string' ? new URL(input, window.location.origin) : new URL(input.url);
    if (url.origin === window.location.origin) {
      init = addCSRFToRequest(init);
    }
    return originalFetch.call(this, input, init);
  };
  
  console.log('CSRF protection initialized');
};