/**
 * Utility to check environment variables
 * This can be imported anywhere to verify env variable loading
 */

// Check direct access to Vite environment variables
const directViteSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const directViteSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('[check-env] Direct access to Vite environment variables:');
console.log('VITE_SUPABASE_URL:', directViteSupabaseUrl ? '✅ Set' : '❌ Not set');
console.log('VITE_SUPABASE_ANON_KEY:', directViteSupabaseKey ? '✅ Set' : '❌ Not set');

// Import our env helper to check its values
import { env } from './env';

console.log('[check-env] Access through env helper:');
console.log('env.SUPABASE_URL:', env.SUPABASE_URL ? '✅ Set' : '❌ Not set');
console.log('env.SUPABASE_ANON_KEY:', env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set');
console.log('env.NODE_ENV:', env.NODE_ENV);

// Export a function to check in components
export function checkEnvironmentVariables() {
  return {
    directAccess: {
      supabaseUrl: directViteSupabaseUrl ? true : false,
      supabaseKey: directViteSupabaseKey ? true : false
    },
    envHelper: {
      supabaseUrl: env.SUPABASE_URL ? true : false,
      supabaseKey: env.SUPABASE_ANON_KEY ? true : false,
      nodeEnv: env.NODE_ENV
    }
  };
}

// Auto-execute the check when this module is imported
checkEnvironmentVariables();