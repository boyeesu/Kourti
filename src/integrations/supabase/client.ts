import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types';
import { env, validateEnv } from '@/lib/env';

// Validate environment variables
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.error('Environment validation failed:', envValidation.errors.join(', '));
}

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

/**
 * Create and export the Supabase client
 * Uses environment variables from env helper
 */
export const supabase = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  supabaseConfig
);

// Add error handling for auth state changes
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    // Clear any cached data when user signs out
    localStorage.removeItem('app_cache');
  } else if (event === 'SIGNED_IN') {
    // Initialize user data when signed in
    console.info('User signed in successfully');
  } else if (event === 'TOKEN_REFRESHED') {
    console.info('Auth token refreshed');
  }
});

// Export helper functions
export const getCurrentSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
