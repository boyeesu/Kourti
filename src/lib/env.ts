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
 * Environment configuration object - using direct access to import.meta.env
 */
export const env: EnvConfig = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '', // Using publishable key as anon key
  SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY || '',
  APP_URL: import.meta.env.VITE_APP_URL || 'http://localhost:5173',
  API_TIMEOUT: Number(import.meta.env.VITE_API_TIMEOUT || 30000),
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
  if (!import.meta.env.VITE_SUPABASE_URL) {
    const message = 'VITE_SUPABASE_URL is not set';
    isDevelopment ? warnings.push(message) : errors.push(message);
  }
  
  // Check Supabase key (using the actual env var name from .env)
  if (!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    const message = 'VITE_SUPABASE_PUBLISHABLE_KEY is not set';
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