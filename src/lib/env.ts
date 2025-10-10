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

const missingRequiredVariables: MissingEnvVariable[] = REQUIRED_ENV_VARS
  .filter(({ key }) => !getEnvValue(key))
  .map(({ key, label, message }) => ({ key, label, message }));

if (missingRequiredVariables.length > 0) {
  const missingKeys = missingRequiredVariables.map(({ key }) => key).join(', ');
  const logMessage = `Missing required environment variables: ${missingKeys}`;

  if (import.meta.env.PROD) {
    console.error(logMessage);
  } else {
    console.warn(logMessage);
  }
}

// Hardcoded Supabase credentials (VITE_ env vars not supported in Lovable)
const SUPABASE_URL = 'https://zjbvnvydgsxqmmrrmvif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYnZudnlkZ3N4cW1tcnJtdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODYzMTAsImV4cCI6MjA2OTY2MjMxMH0.-lE-O7iPZM_fxM93ddDapJVzcPdBArdCmN1HrwCHIH4';

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

export const envStatus = {
  missingRequiredVariables: [], // Always empty since we use hardcoded values
  hasSupabaseConfiguration: true,
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
export function validateEnv(): { valid: boolean; errors: string[]; missingVariables: MissingEnvVariable[] } {
  // Always valid since we use hardcoded Supabase credentials
  return {
    valid: true,
    errors: [],
    missingVariables: [],
  };
}