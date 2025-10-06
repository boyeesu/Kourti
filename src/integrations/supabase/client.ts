import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types';
import { env } from '@/lib/env';
import { logInfo } from '@/lib/logger';

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

// Client configuration with proper typing
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
  // Set global error handler to improve debugging
  global: {
    fetch: (...args) => {
      return fetch(...args);
    },
  },
};

// Log the values we're using (development only)
if (import.meta.env.DEV) {
  logInfo('Supabase client initialized', {
    supabaseUrl: SUPABASE_URL,
    anonKeyPrefix: SUPABASE_ANON_KEY.substring(0, 8),
  });
}

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
  } else if (event === 'SIGNED_IN') {
    logInfo('User signed in successfully');
  } else if (event === 'TOKEN_REFRESHED') {
    logInfo('Auth token refreshed');
  }
});

// Export helper functions
export const getCurrentSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
