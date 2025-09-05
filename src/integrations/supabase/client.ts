import { createClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from './types';
import { validateEnv } from '@/lib/env';

// Directly access environment variables as a fallback
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 
                     "https://zjbvnvydgsxqmmrrmvif.supabase.co";
                     
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 
                         "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYnZudnlkZ3N4cW1tcnJtdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODYzMTAsImV4cCI6MjA2OTY2MjMxMH0.-lE-O7iPZM_fxM93ddDapJVzcPdBArdCmN1HrwCHIH4";

// Validate environment variables - log but don't block initialization
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.warn('Environment validation issue (using fallback values):', envValidation.errors.join(', '));
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

// Log the values we're using (development only)
if (import.meta.env.DEV) {
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Using Supabase credentials (anonymized):', 
    SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 8)}...` : 'Not set');
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
    // Initialize user data when signed in
    console.info('User signed in successfully');
  } else if (event === 'TOKEN_REFRESHED') {
    console.info('Auth token refreshed');
  }
});

// Export helper functions
export const getCurrentSession = () => supabase.auth.getSession();
export const getCurrentUser = () => supabase.auth.getUser();
