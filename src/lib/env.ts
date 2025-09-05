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

/**
 * Get environment variable with type checking and optional validation
 */
function getEnvVar(
  key: keyof EnvConfig, 
  defaultValue?: string | number,
  validator?: (value: string) => boolean
): string | number {
  // Get from import.meta.env (Vite) with VITE_ prefix
  // Also handle the case where key already has VITE_ prefix
  const prefix = key.startsWith('VITE_') ? '' : 'VITE_';
  const formattedKey = key.replace('_', '').replace('VITE', '');
  const fullKey = `${prefix}${formattedKey}`;
  
  // For debugging during development
  console.log(`Looking for env var: ${fullKey}`);
  
  // Try direct access first (how Vite typically exposes env vars)
  let value = import.meta.env[fullKey];
  
  // If not found, try process.env as fallback (for non-Vite environments)
  if (value === undefined && typeof process !== 'undefined' && process.env) {
    value = process.env[fullKey] ?? defaultValue;
  }
  
  // If still not found, use default or empty string
  if (value === undefined) {
    console.warn(`Environment variable ${fullKey} is not defined, using default value`);
    return defaultValue ?? '';
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
  SUPABASE_PUBLISHABLE_KEY: getEnvVar('SUPABASE_PUBLISHABLE_KEY', '') as string,
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
 * In development mode, we use fallback values and only log warnings
 * In production, we enforce strict validation
 */
export function validateEnv(): { valid: boolean; errors: string[] } {
  const isDevelopment = env.NODE_ENV === 'development';
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check Supabase URL
  if (!env.SUPABASE_URL) {
    const message = 'VITE_SUPABASE_URL is not set';
    isDevelopment ? warnings.push(message) : errors.push(message);
  }
  
  // Check Supabase key
  if (!env.SUPABASE_ANON_KEY) {
    const message = 'VITE_SUPABASE_ANON_KEY is not set';
    isDevelopment ? warnings.push(message) : errors.push(message);
  }
  
  // Log warnings in development
  if (isDevelopment && warnings.length > 0) {
    console.warn('Environment variable warnings:', warnings);
  }
  
  return {
    // In development, we consider validation "valid" even with warnings
    // In production, we require all variables to be set
    valid: isDevelopment || errors.length === 0,
    errors: isDevelopment ? [] : errors
  };
}