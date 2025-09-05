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

/**
 * Get environment variable with type checking and optional validation
 */
function getEnvVar(
  key: keyof EnvConfig, 
  defaultValue?: string | number,
  validator?: (value: string) => boolean
): string | number {
  // Get from import.meta.env (Vite) with VITE_ prefix
  const fullKey = `VITE_${key.replace('_', '')}`;
  const value = import.meta.env[fullKey] ?? defaultValue;
  
  if (value === undefined) {
    console.warn(`Environment variable ${fullKey} is not defined`);
    return '';
  }
  
  if (validator && typeof value === 'string' && !validator(value)) {
    console.warn(`Environment variable ${fullKey} failed validation`);
  }
  
  return value;
}

/**
 * Environment configuration object
 */
export const env: EnvConfig = {
  SUPABASE_URL: getEnvVar('SUPABASE_URL', '') as string,
  SUPABASE_ANON_KEY: getEnvVar('SUPABASE_ANON_KEY', '') as string,
  OPENAI_API_KEY: getEnvVar('OPENAI_API_KEY', '') as string,
  APP_URL: getEnvVar('APP_URL', 'http://localhost:5173') as string,
  API_TIMEOUT: Number(getEnvVar('API_TIMEOUT', 30000)),
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
 */
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!env.SUPABASE_URL) {
    errors.push('VITE_SUPABASE_URL is required');
  }
  
  if (!env.SUPABASE_ANON_KEY) {
    errors.push('VITE_SUPABASE_ANON_KEY is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}