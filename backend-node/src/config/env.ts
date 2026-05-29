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
  // Fallback used when the primary model rejects (4xx) — also a sensible
  // choice for structured-extraction workloads where a smaller model
  // suffices. Override via env in prod if you want the same model on
  // both tiers.
  OPENAI_FALLBACK_CHAT_MODEL: z.string().default('gpt-5-mini'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_CHAT_MODEL: z.string().default('claude-opus-4-6'),
  ANTHROPIC_API_VERSION: z.string().default('2023-06-01'),

  // OpenRouter: OpenAI-compatible gateway giving access to any model
  // (Claude, GPT, Llama, Gemini, etc.) behind a single key.
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_CHAT_MODEL: z.string().default('moonshotai/kimi-k2.6'),
  OPENROUTER_FALLBACK_CHAT_MODEL: z.string().default('openai/gpt-5-mini'),
  OPENROUTER_EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),
  OPENROUTER_STT_MODEL: z.string().default('openai/gpt-audio-mini'),
  // Sent as HTTP-Referer / X-Title to OpenRouter for usage analytics.
  OPENROUTER_APP_NAME: z.string().default('Kourti Legal'),

  LLM_PRIMARY_PROVIDER: z.enum(['anthropic', 'openai', 'openrouter']).default('openrouter'),

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

  // File storage driver. 'fs' = local Railway volume at STORAGE_PATH (default,
  // unchanged behavior). 's3' = S3-compatible object store (Garage on Railway).
  STORAGE_DRIVER: z.enum(['fs', 's3']).default('fs'),
  STORAGE_PATH: z.string().default('/app/storage'),

  // S3 driver settings (only required when STORAGE_DRIVER=s3).
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default('garage'),
  S3_BUCKET: optionalNonEmptyString,
  S3_ACCESS_KEY: optionalNonEmptyString,
  S3_SECRET_KEY: optionalNonEmptyString,
  // Garage requires path-style addressing (no virtual-hosted subdomain).
  S3_FORCE_PATH_STYLE: z
    .preprocess((v) => v === 'true' || v === '1' || v === true, z.boolean())
    .default(true),

  // Paystack. Public key is FE-only and not needed here. Secret key signs
  // server calls AND HMAC-validates webhook payloads (Paystack signs the
  // webhook body with the same secret key, HMAC-SHA512).
  PAYSTACK_SECRET_KEY: optionalNonEmptyString,
  PAYSTACK_CURRENCY: z.string().default('NGN'),
});

export const env = envSchema.parse(process.env);

if (env.NODE_ENV === 'production' && env.AUTH_MODE === 'development') {
  throw new Error('AUTH_MODE=development is not allowed in production');
}

if (env.AUTH_MODE === 'custom' && (!env.JWT_SECRET || !env.JWT_REFRESH_SECRET)) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET are required when AUTH_MODE=custom');
}

// Refuse to boot if access and refresh secrets match — otherwise an
// access JWT can be replayed as a refresh token (CWE-326).
if (env.JWT_SECRET && env.JWT_REFRESH_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must differ');
}

// Minimum entropy guard — a leaked production secret with <32 bytes is
// brute-forceable. Both should be ≥32 chars in production.
if (env.NODE_ENV === 'production') {
  for (const [name, val] of [
    ['JWT_SECRET', env.JWT_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
  ] as const) {
    if (val && val.length < 32) {
      throw new Error(`${name} must be at least 32 characters in production`);
    }
  }

  if (env.SSO_SECRET_KEY === 'kourti-dev-sso-key-change-in-production') {
    throw new Error('SSO_SECRET_KEY must be changed from the default value in production');
  }
}

// S3 driver requires its full credential set — refuse to boot half-configured.
if (env.STORAGE_DRIVER === 's3') {
  const missing: string[] = [];
  if (!env.S3_ENDPOINT) missing.push('S3_ENDPOINT');
  if (!env.S3_BUCKET) missing.push('S3_BUCKET');
  if (!env.S3_ACCESS_KEY) missing.push('S3_ACCESS_KEY');
  if (!env.S3_SECRET_KEY) missing.push('S3_SECRET_KEY');
  if (missing.length) {
    throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(', ')}`);
  }
}

export const corsOrigins = (env.CORS_ORIGINS || env.APP_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (env.NODE_ENV === 'production' && corsOrigins.length === 0) {
  console.warn(
    '[env] WARNING: NODE_ENV=production but CORS_ORIGINS / APP_URL are empty. ' +
      'All cross-origin browser requests will be denied.'
  );
}
