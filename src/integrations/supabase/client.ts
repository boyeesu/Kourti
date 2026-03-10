import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types';
import { env } from '@/lib/env';

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

// Client configuration with proper typing and timeout handling
const supabaseConfig: SupabaseClientOptions<'public'> = {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  // Set global error handler and timeout handling
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      // Preserve any existing signal by chaining abort
      const existingSignal = init?.signal;
      if (existingSignal) {
        existingSignal.addEventListener('abort', () => controller.abort());
      }

      return fetch(input, {
        ...init,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    },
  },
};

// Supabase client will be initialized below

/**
 * Create and export the Supabase client
 * Uses direct environment variables with fallback to hardcoded values
 * This ensures the app works even if env variables aren't loaded properly
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfig);

// Add error handling for auth state changes
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Clear all cached data when user signs out
    localStorage.removeItem('app_cache');
    localStorage.removeItem('ai-lastcall');
    localStorage.removeItem('kourti_legal_logs');

    // Clear AI summary caches (ai-summary-* keys)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('ai-summary-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear sessionStorage (document content, CSRF tokens, etc.)
    sessionStorage.clear();
  }
});

// Export helper functions
export const getCurrentSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
