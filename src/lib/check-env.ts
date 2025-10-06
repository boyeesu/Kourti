/**
 * Utility to check environment variables
 * This can be imported anywhere to verify env variable loading
 */

// Import our env helper to check its values
import { env } from './env';

console.log('[check-env] Supabase configuration:');
console.log('env.SUPABASE_URL:', env.SUPABASE_URL ? '✅ Set' : '❌ Not set');
console.log('env.SUPABASE_ANON_KEY:', env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Not set');
console.log('env.NODE_ENV:', env.NODE_ENV);

// Export a function to check in components
export function checkEnvironmentVariables() {
  return {
    envHelper: {
      supabaseUrl: env.SUPABASE_URL ? true : false,
      supabaseKey: env.SUPABASE_ANON_KEY ? true : false,
      nodeEnv: env.NODE_ENV
    }
  };
}

// Auto-execute the check when this module is imported
checkEnvironmentVariables();