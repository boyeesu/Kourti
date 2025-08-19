import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!SUPABASE_URL) {
  throw new Error(
    'Missing VITE_SUPABASE_URL. Please check your .env file and ensure VITE_SUPABASE_URL is set.'
  );
}

if (!SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. Please check your .env file and ensure VITE_SUPABASE_ANON_KEY is set.'
  );
}

// Client configuration
const supabaseConfig = {
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
  db: {
    schema: 'public',
  },
};

// Create and export the Supabase client
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseConfig
);

// Add error handling for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
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
