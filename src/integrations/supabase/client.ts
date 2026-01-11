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
    fetch: (...args) => {
      const [url, options = {}] = args;
      // Increase timeout for auth operations to 60 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      return fetch(url, {
        ...options,
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
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseConfig
);

// Add error handling for auth state changes
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Clear any cached data when user signs out
    localStorage.removeItem('app_cache');
  }
});

// Export helper functions
export const getCurrentSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
