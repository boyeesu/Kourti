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
   * OpenAI API key for AI features
   */
  OPENAI_API_KEY?: string;
  
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
};

const envSource = import.meta.env;

function requireEnvVar(key: keyof ImportMetaEnv, friendlyName: string) {
  const value = envSource[key];

  if (!value) {
    const errorMessage = `Missing required environment variable: ${friendlyName}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  return value;
}

function optionalEnvVar<T extends keyof ImportMetaEnv>(key: T, fallback?: string) {
  return envSource[key] || fallback || '';
}

/**
 * Environment configuration object - validates required values eagerly
 */
export const env: EnvConfig = {
  SUPABASE_URL: requireEnvVar('VITE_SUPABASE_URL', 'VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_PUBLISHABLE_KEY: requireEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY'),
  OPENAI_API_KEY: optionalEnvVar('VITE_OPENAI_API_KEY'),
  APP_URL: optionalEnvVar('VITE_APP_URL', typeof window !== 'undefined' ? window.location.origin : ''),
  API_TIMEOUT: Number(optionalEnvVar('VITE_API_TIMEOUT', '30000')),
  NODE_ENV: (envSource.MODE || 'development') as 'development' | 'production' | 'test',
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
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!envSource.VITE_SUPABASE_URL) {
    errors.push('VITE_SUPABASE_URL is not set');
  }

  if (!envSource.VITE_SUPABASE_PUBLISHABLE_KEY) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY is not set');
  }

  if (!env.APP_URL) {
    errors.push('VITE_APP_URL is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}