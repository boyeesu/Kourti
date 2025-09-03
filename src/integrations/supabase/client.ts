import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Supabase configuration (hardcoded for Lovable)
const SUPABASE_URL = 'https://zjbvnvydgsxqmmrrmvif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYnZudnlkZ3N4cW1tcnJtdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODYzMTAsImV4cCI6MjA2OTY2MjMxMH0.-lE-O7iPZM_fxM93ddDapJVzcPdBArdCmN1HrwCHIH4';

// Client configuration
const supabaseConfig = {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce' as any,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
};

// Create and export the Supabase client
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
