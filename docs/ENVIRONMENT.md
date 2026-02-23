# Environment Variables Documentation

This document provides a comprehensive guide to all environment variables used in the Kouti Legal Hub application.

## Table of Contents

- [Overview](#overview)
- [Frontend Variables (Vite)](#frontend-variables-vite)
- [Backend Variables (Supabase Edge Functions)](#backend-variables-supabase-edge-functions)
- [Setup Instructions](#setup-instructions)
- [Environment Validation](#environment-validation)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The application uses different environment variables for the frontend (prefixed with `VITE_`) and backend (Supabase Edge Functions). Frontend variables are embedded at build time, while backend variables are set in the Supabase dashboard.

**CRITICAL**: Never commit `.env` files to version control. Always use `.env.example` as a template.

## Frontend Variables (Vite)

These variables must be prefixed with `VITE_` to be accessible in the frontend code.

### Required Variables

| Variable | Description | Example | Where Used |
|----------|-------------|---------|------------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xyz.supabase.co` | Authentication, database queries |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anonymous/public key | `eyJhbGc...` | Authentication, database queries |
| `VITE_SUPABASE_ANON_KEY` | Alternative name for publishable key | `eyJhbGc...` | Authentication (legacy) |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `VITE_APP_URL` | Frontend application URL | `window.location.origin` | `https://app.kourti.com` |
| `VITE_API_TIMEOUT` | API request timeout (ms) | `30000` | `60000` |
| `VITE_APP_VERSION` | Application version | `1.0.0` | `2.1.3` |
| `VITE_BUILD_TIME` | Build timestamp | Current time | `2025-01-23T10:00:00Z` |
| `VITE_LOG_API_ENDPOINT` | Server logging endpoint | `null` | `https://logs.example.com/api` |

### Deprecated/Insecure Variables

⚠️ **DO NOT USE IN FRONTEND**:
- `VITE_OPENAI_API_KEY` - ❌ **SECURITY RISK**: OpenAI keys should NEVER be in frontend code
- `VITE_DOCUMENSO_API_KEY` - ❌ **SECURITY RISK**: API keys should be server-side only

**Note**: These variables are present in `.env.example` but should NOT be used. OpenAI and third-party API calls must be made from Supabase Edge Functions.

## Backend Variables (Supabase Edge Functions)

These variables are set in the Supabase dashboard under "Settings → Edge Functions → Secrets".

### Core Supabase Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | ✅ Yes | Supabase project URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Yes | Service role key (bypasses RLS) | `eyJhbGc...` |
| `SUPABASE_ANON_KEY` | ❌ No | Anonymous key (rarely needed in functions) | `eyJhbGc...` |

### OpenAI Integration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `OPENAI_API_KEY` | ✅ Yes | OpenAI API key for AI features | - |
| `OPENAI_CHAT_MODEL` | ❌ No | Primary chat model | `gpt-5.1` |
| `OPENAI_FALLBACK_CHAT_MODEL` | ❌ No | Fallback if primary fails | `gpt-5.1` |
| `OPENAI_CONTRACT_MODEL` | ❌ No | Contract generation model | `gpt-5.1` |
| `OPENAI_CONTRACT_FALLBACK_MODEL` | ❌ No | Contract generation fallback | `gpt-5.1` |

### Application Configuration

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APP_URL` | ✅ Yes | Frontend URL for CORS and redirects | `https://app.kourti.com` |
| `ENVIRONMENT` | ❌ No | Environment name | `production`, `development` |
| `NODE_ENV` | ❌ No | Node environment | `production`, `development` |
| `SUPABASE_FUNCTIONS_ENV` | ❌ No | Supabase function environment | `local`, `production` |

### Email (Resend)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `RESEND_API_KEY` | ✅ Yes | Resend API key for sending emails | `re_...` |
| `SMTP_FROM_EMAIL` | ❌ No | Email sender address | `noreply@kourti.com` |

### Single Sign-On (SSO)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `SSO_SECRET_KEY` | ✅ Yes | 32-byte secret for SSO encryption | `your-32-byte-secret-key-here...` |
| `SSO_ALLOWED_REDIRECT_ORIGINS` | ✅ Yes | Allowed redirect origins (comma-separated) | `https://app.kourti.com,http://localhost:5173` |
| `SSO_STATE_SECRET` | ✅ Yes | Secret for OAuth state parameter | `your-state-secret` |

### Langfuse (LLM Observability)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `LANGFUSE_SECRET_KEY` | ❌ No | Langfuse secret key | `sk-lf-...` |
| `LANGFUSE_PUBLIC_KEY` | ❌ No | Langfuse public key | `pk-lf-...` |
| `LANGFUSE_HOST` | ❌ No | Langfuse host URL | `https://cloud.langfuse.com` |

### Security & Feature Flags

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DISABLE_HSTS` | ❌ No | Disable HSTS header | `false` |
| `DISABLE_STRICT_TRANSPORT_SECURITY` | ❌ No | Disable HSTS (alternative) | `false` |

## Setup Instructions

### 1. Local Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd kouti-legal-hub-41

# Copy the example environment file
cp .env.example .env

# Edit .env and fill in your values
# At minimum, you MUST set:
# - VITE_SUPABASE_URL
# - VITE_SUPABASE_PUBLISHABLE_KEY
```

### 2. Configure Supabase Edge Function Secrets

Set backend variables in Supabase dashboard:

```bash
# Using Supabase CLI
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
supabase secrets set OPENAI_API_KEY="your-openai-key"
supabase secrets set APP_URL="https://app.kourti.com"
supabase secrets set RESEND_API_KEY="your-resend-key"
supabase secrets set SSO_SECRET_KEY="your-32-byte-secret"
supabase secrets set SSO_ALLOWED_REDIRECT_ORIGINS="https://app.kourti.com"

# Or set via Supabase Dashboard:
# Settings → Edge Functions → Secrets
```

### 3. Configure Production (Vercel)

Set frontend variables in Vercel:

```bash
# Via Vercel CLI
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_PUBLISHABLE_KEY

# Or via Vercel Dashboard:
# Project Settings → Environment Variables
```

### 4. Validate Configuration

```bash
# Frontend validation (runs automatically on app start)
npm run dev

# Backend validation (test edge function)
supabase functions serve voice-transcription

# Check for missing variables
npm run check-env  # (if script exists)
```

## Environment Validation

### Frontend Validation

The application automatically validates required environment variables on startup using [src/lib/env.ts](../src/lib/env.ts):

```typescript
import { validateEnv } from '@/lib/env';

const validation = validateEnv();
if (!validation.valid) {
  console.error('Missing environment variables:', validation.errors);
  console.error('Missing variables:', validation.missingVariables);
}
```

**Required Frontend Variables**:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (or `VITE_SUPABASE_ANON_KEY`)

If these are missing, the app will throw an error and refuse to start.

### Backend Validation

Each edge function should validate its required variables:

```typescript
// Example validation in edge function
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
if (!openAIApiKey) {
  return createJsonResponse(
    { error: 'OpenAI API key not configured' },
    { status: 500, cors: corsOptions }
  );
}
```

## Security Best Practices

### 1. Never Expose Secrets in Frontend

❌ **WRONG**:
```javascript
// DO NOT DO THIS
const apiKey = import.meta.env.VITE_OPENAI_API_KEY; // Exposed to browser!
```

✅ **CORRECT**:
```javascript
// Make API call through Supabase Edge Function
const response = await supabase.functions.invoke('ream-ai-assistant', {
  body: { prompt: 'Hello' }
});
// OpenAI key stays secure in edge function
```

### 2. Use Different Keys for Different Environments

```bash
# Development
VITE_SUPABASE_URL=https://dev-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=dev-key...

# Production
VITE_SUPABASE_URL=https://prod-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=prod-key...
```

### 3. Rotate Secrets Regularly

- Service role keys: Rotate every 90 days
- API keys (OpenAI, Resend): Rotate every 180 days
- SSO secrets: Rotate every 365 days

### 4. Limit Service Role Key Usage

The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS). Only use it when:
- Creating system-level resources (invitations, users)
- Admin operations that need to bypass RLS
- Background jobs (cron, scheduled tasks)

**Always validate authorization** before using service role operations.

### 5. Verify CORS Origins

The `APP_URL` variable controls CORS allowed origins. Ensure it matches your production domain:

```typescript
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),  // Should be https://app.kourti.com
  "http://localhost:5173",   // Development only
];
```

## Troubleshooting

### Issue: "Missing required environment variables: VITE_SUPABASE_URL"

**Cause**: `.env` file not created or variables not set.

**Solution**:
```bash
cp .env.example .env
# Edit .env and set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
```

### Issue: "OpenAI API key not configured" in edge function

**Cause**: `OPENAI_API_KEY` not set in Supabase secrets.

**Solution**:
```bash
supabase secrets set OPENAI_API_KEY="sk-..."
```

### Issue: CORS errors in production

**Cause**: `APP_URL` not set correctly in edge function secrets.

**Solution**:
```bash
supabase secrets set APP_URL="https://app.kourti.com"
# Ensure no trailing slash
# Ensure https:// protocol included
```

### Issue: Edge function works locally but not in production

**Cause**: Environment variables not synced between local and production.

**Solution**:
```bash
# List current secrets
supabase secrets list

# Verify each required secret is set
supabase secrets get OPENAI_API_KEY
supabase secrets get SUPABASE_SERVICE_ROLE_KEY
```

### Issue: "Invalid Supabase URL" error

**Cause**: URL is missing protocol or has typo.

**Solution**:
```bash
# ✅ CORRECT
VITE_SUPABASE_URL=https://xyz.supabase.co

# ❌ WRONG
VITE_SUPABASE_URL=xyz.supabase.co  # Missing https://
VITE_SUPABASE_URL=https://xyz.supabase.co/  # Trailing slash
```

## Environment Files

### `.env` (Local Development)
- **Never commit** to version control
- Contains actual secrets and keys
- Used during local development
- Automatically loaded by Vite

### `.env.example` (Template)
- **Commit to version control**
- Contains placeholder values
- Documents required variables
- Developers copy this to `.env`

### `.env.backup` / `.env.clean`
- **Never commit** to version control
- Personal backup files
- Not used by application

## Environment Variable Hierarchy

1. **Build-time (Frontend)**:
   - `.env` file → Loaded by Vite
   - Vercel environment variables → Injected at build time
   - Embedded in compiled JavaScript

2. **Runtime (Backend)**:
   - Supabase Edge Function Secrets → Available via `Deno.env.get()`
   - Not visible to frontend
   - Can be updated without redeployment

## Validation Scripts

Create a validation script to check environment configuration:

```bash
# package.json
{
  "scripts": {
    "check-env": "node scripts/check-env.js"
  }
}
```

```javascript
// scripts/check-env.js
const requiredVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY'
];

const missing = requiredVars.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`  - ${key}`));
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set');
}
```

## Related Documentation

- [CORS Implementation](./CORS_IMPLEMENTATION.md)
- [Security Audit Results](../SECURITY_AUDIT_RESULTS.md)
- [Environment Validation](../src/lib/env.ts)

## References

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Supabase Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
