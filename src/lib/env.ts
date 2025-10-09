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

// Supabase public credentials - fail fast if not configured
if (!import.meta.env.VITE_SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL environment variable is required but not configured. Please check your .env file.');
}

if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY environment variable is required but not configured. Please check your .env file.');
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Environment configuration object
 */
export const env: EnvConfig = {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PUBLISHABLE_KEY: SUPABASE_ANON_KEY,
  OPENAI_API_KEY: undefined,
  APP_URL: typeof window !== 'undefined' ? window.location.origin : '',
  API_TIMEOUT: 30000,
  NODE_ENV: (import.meta.env.MODE || 'development') as 'development' | 'production' | 'test',
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

  if (!env.SUPABASE_URL) {
    errors.push('SUPABASE_URL is not set');
  }

  if (!env.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY is not set');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}