/**
 * Environment variables utility
 * Provides type-safe access to environment variables with validation
 */

type EnvConfig = {
  /**
   * Supabase URL for API requests
   */
  SUPABASE_URL: string;

  /**
   * Supabase anonymous key for public API access
   */
  SUPABASE_ANON_KEY: string;

  /**
   * Alternative name for Supabase anonymous key
   */
  SUPABASE_PUBLISHABLE_KEY: string;

  /**
   * Application URL for redirects and absolute URLs
   */
  APP_URL: string;

  /**
   * API request timeout in milliseconds
   */
  API_TIMEOUT: number;

  /**
   * Environment name (development, production, etc.)
   */
  NODE_ENV: 'development' | 'production' | 'test';

  /**
   * Optional Node backend base URL
   */
  BACKEND_API_URL: string;

  /**
   * Feature flag to route selected queries through Node backend
   */
  USE_NODE_BACKEND: boolean;
};

type EnvKey = 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY';

type RequiredEnvVar = {
  key: EnvKey;
  label: string;
  message: string;
};

export type MissingEnvVariable = Pick<RequiredEnvVar, 'key' | 'label' | 'message'>;

const REQUIRED_ENV_VARS: RequiredEnvVar[] = [
  {
    key: 'VITE_SUPABASE_URL',
    label: 'Supabase URL',
    message: 'SUPABASE_URL is not set',
  },
  {
    key: 'VITE_SUPABASE_PUBLISHABLE_KEY',
    label: 'Supabase anonymous key',
    message: 'SUPABASE_ANON_KEY is not set',
  },
];

const envSource = import.meta.env as Record<string, string | undefined>;

const getEnvValue = (key: EnvKey): string => {
  const value = envSource[key];
  return typeof value === 'string' ? value : '';
};

const missingRequiredVariables: MissingEnvVariable[] = REQUIRED_ENV_VARS.filter(
  ({ key }) => !getEnvValue(key)
).map(({ key, label, message }) => ({ key, label, message }));

// Get environment variables - REQUIRED in all environments
// Secrets are managed via Supabase and Vercel environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// No hardcoded fallbacks - environment variables must be set
const finalSupabaseUrl = SUPABASE_URL;
const finalSupabaseKey = SUPABASE_ANON_KEY;

// Validate required environment variables - strict validation in all environments
if (!finalSupabaseUrl || !finalSupabaseKey) {
  const missingKeys = [];
  if (!SUPABASE_URL) missingKeys.push('VITE_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missingKeys.push('VITE_SUPABASE_ANON_KEY');

  const errorMessage =
    `Missing required environment variables: ${missingKeys.join(', ')}. ` +
    'Please set these variables in your environment (Supabase/Vercel).';

  if (typeof window !== 'undefined') {
    console.error(errorMessage);
  }

  // Throw error to prevent app from running with missing credentials
  throw new Error(errorMessage);
}

/**
 * Environment configuration object
 */
export const env: EnvConfig = {
  SUPABASE_URL: finalSupabaseUrl,
  SUPABASE_ANON_KEY: finalSupabaseKey,
  SUPABASE_PUBLISHABLE_KEY: finalSupabaseKey,
  APP_URL: typeof window !== 'undefined' ? window.location.origin : '',
  API_TIMEOUT: 30000,
  NODE_ENV: (import.meta.env.MODE || 'development') as 'development' | 'production' | 'test',
  BACKEND_API_URL: import.meta.env.VITE_BACKEND_API_URL || '',
  USE_NODE_BACKEND: import.meta.env.VITE_USE_NODE_BACKEND === 'true',
};

export const envStatus = {
  missingRequiredVariables: missingRequiredVariables,
  hasSupabaseConfiguration: Boolean(finalSupabaseUrl && finalSupabaseKey),
};

/**
 * Check if we're in development mode
 */
export const isDev = env.NODE_ENV === 'development';

/**
 * Check if we're in production mode
 */
export const isProd = env.NODE_ENV === 'production';

/**
 * Check if we're in test mode
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Validate environment variables on initialization
 * In development mode, we use fallback values and only log warnings
 * In production, we enforce strict validation
 */
export function validateEnv(): {
  valid: boolean;
  errors: string[];
  missingVariables: MissingEnvVariable[];
} {
  const errors: string[] = [];

  // Check if we have valid Supabase configuration
  // In development, fallbacks should provide values
  // In production, env vars are required
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    // Only show as error if we're in production OR if fallbacks aren't available
    if (import.meta.env.PROD || !import.meta.env.DEV) {
      if (!env.SUPABASE_URL) {
        errors.push('SUPABASE_URL is required');
      }
      if (!env.SUPABASE_ANON_KEY) {
        errors.push('SUPABASE_ANON_KEY is required');
      }
    }
  }

  // Show missing variables if they're not set (no fallbacks)
  const actualMissingVariables = missingRequiredVariables;

  return {
    valid: errors.length === 0,
    errors,
    missingVariables: actualMissingVariables,
  };
}
