/**
 * Environment variables utility
 * Provides type-safe access to environment variables with validation
 */

type EnvConfig = {
  /** Application URL for redirects and absolute URLs */
  APP_URL: string;

  /** API request timeout in milliseconds */
  API_TIMEOUT: number;

  /** Environment name */
  NODE_ENV: 'development' | 'production' | 'test';

  /** Node backend base URL (required) */
  BACKEND_API_URL: string;
};

const envSource = import.meta.env as Record<string, string | undefined>;

const BACKEND_API_URL = envSource.VITE_BACKEND_API_URL || '';

if (!BACKEND_API_URL) {
  const errorMessage =
    'Missing required environment variable: VITE_BACKEND_API_URL. Set this to your Railway backend URL.';
  if (typeof window !== 'undefined') {
    console.error(errorMessage);
  }
  throw new Error(errorMessage);
}

/**
 * Environment configuration object
 */
export const env: EnvConfig = {
  APP_URL: typeof window !== 'undefined' ? window.location.origin : '',
  API_TIMEOUT: Number(envSource.VITE_API_TIMEOUT) || 30000,
  NODE_ENV: (import.meta.env.MODE || 'development') as 'development' | 'production' | 'test',
  BACKEND_API_URL,
};

export type MissingEnvVariable = { key: string; label: string; message: string };

export const envStatus = {
  missingRequiredVariables: [] as MissingEnvVariable[],
  hasSupabaseConfiguration: false,
};

export const isDev = env.NODE_ENV === 'development';
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export function validateEnv(): {
  valid: boolean;
  errors: string[];
  missingVariables: MissingEnvVariable[];
} {
  const errors: string[] = [];
  if (!env.BACKEND_API_URL) {
    errors.push('VITE_BACKEND_API_URL is required');
  }
  return { valid: errors.length === 0, errors, missingVariables: [] };
}
