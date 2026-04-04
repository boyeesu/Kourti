import { z } from 'zod';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional()
);

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional()
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_MODE: z.enum(['custom', 'development']).default('custom'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: optionalUrl,
  CORS_ORIGINS: z.string().optional(),
  DATABASE_URL: z.string().min(1),

  // JWT config (required for AUTH_MODE=custom)
  JWT_SECRET: optionalNonEmptyString,
  JWT_REFRESH_SECRET: optionalNonEmptyString,
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-5.4-2026-03-05'),
  OPENAI_FALLBACK_CHAT_MODEL: z.string().default('gpt-4o'),
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  DEV_DEFAULT_USER_ID: z.string().default('00000000-0000-0000-0000-000000000001'),
  DEV_DEFAULT_ORG_ID: z.string().default('00000000-0000-0000-0000-000000000001'),

  // Agent infrastructure
  // SSO encryption key for client secrets
  SSO_SECRET_KEY: z.string().default('kourti-dev-sso-key-change-in-production'),

  AGENT_ENABLED: z
    .preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean())
    .default(true),
  AGENT_MAX_CONCURRENT_JOBS: z.coerce.number().int().positive().default(3),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production' && env.AUTH_MODE === 'development') {
  throw new Error('AUTH_MODE=development is not allowed in production');
}

if (env.AUTH_MODE === 'custom' && (!env.JWT_SECRET || !env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required when AUTH_MODE=custom');
}

export const corsOrigins = (env.CORS_ORIGINS || env.APP_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
