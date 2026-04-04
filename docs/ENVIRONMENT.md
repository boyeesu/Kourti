# Environment Variables Documentation

This document provides a comprehensive guide to all environment variables used in the Kourti Legal Hub application.

## Table of Contents

- [Overview](#overview)
- [Frontend Variables (Vite)](#frontend-variables-vite)
- [Backend Variables (Node)](#backend-variables-node)
- [Setup Instructions](#setup-instructions)
- [Environment Validation](#environment-validation)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The application uses different environment variables for the frontend (prefixed with `VITE_`) and backend (Node.js). Frontend variables are embedded at build time, while backend variables are set in the deployment platform (Railway, Docker, etc.).

**CRITICAL**: Never commit `.env` files to version control. Always use `.env.example` as a template.

## Frontend Variables (Vite)

These variables must be prefixed with `VITE_` to be accessible in the frontend code.

### Optional Variables

| Variable                | Description                             | Default                  | Example                        |
| ----------------------- | --------------------------------------- | ------------------------ | ------------------------------ |
| `VITE_APP_URL`          | Frontend application URL                | `window.location.origin` | `https://app.kourti.com`       |
| `VITE_API_TIMEOUT`      | API request timeout (ms)                | `30000`                  | `60000`                        |
| `VITE_APP_VERSION`      | Application version                     | `1.0.0`                  | `2.1.3`                        |
| `VITE_BUILD_TIME`       | Build timestamp                         | Current time             | `2025-01-23T10:00:00Z`         |
| `VITE_LOG_API_ENDPOINT` | Server logging endpoint                 | `null`                   | `https://logs.example.com/api` |
| `VITE_USE_NODE_BACKEND` | Enable Node API (should always be true) | `true`                   | `true`                         |
| `VITE_BACKEND_API_URL`  | Node backend base URL                   | `''`                     | `http://localhost:4000`        |

### Deprecated/Insecure Variables

⚠️ **DO NOT USE IN FRONTEND**:

- `VITE_OPENAI_API_KEY` - ❌ **SECURITY RISK**: OpenAI keys should NEVER be in frontend code
- `VITE_DOCUMENSO_API_KEY` - ❌ **SECURITY RISK**: API keys should be server-side only

**Note**: OpenAI and third-party API calls must be made through the Node backend.

## Backend Variables (Node)

These variables are set in your deployment platform (Railway, Docker, etc.) or in `.env` for local development.

### Database

| Variable       | Required | Description                  | Example                                   |
| -------------- | -------- | ---------------------------- | ----------------------------------------- |
| `DATABASE_URL` | ✅ Yes   | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` |

### Authentication

| Variable                 | Required | Description                           | Default  |
| ------------------------ | -------- | ------------------------------------- | -------- |
| `AUTH_MODE`              | ❌ No    | Auth mode (`custom` or `development`) | `custom` |
| `JWT_SECRET`             | ✅ Yes   | Secret for access token signing       | -        |
| `JWT_REFRESH_SECRET`     | ✅ Yes   | Secret for refresh token signing      | -        |
| `JWT_EXPIRES_IN`         | ❌ No    | Access token lifetime                 | `15m`    |
| `JWT_REFRESH_EXPIRES_IN` | ❌ No    | Refresh token lifetime                | `7d`     |

### Server

| Variable       | Required | Description                               | Default |
| -------------- | -------- | ----------------------------------------- | ------- |
| `PORT`         | ❌ No    | Server port                               | `4000`  |
| `NODE_ENV`     | ❌ No    | Environment (`production`, `development`) | -       |
| `APP_URL`      | ❌ No    | Frontend URL for CORS and email links     | -       |
| `CORS_ORIGINS` | ❌ No    | Allowed origins (comma-separated)         | -       |

### OpenAI Integration

| Variable                     | Required | Description               | Default  |
| ---------------------------- | -------- | ------------------------- | -------- |
| `OPENAI_API_KEY`             | ❌ No    | OpenAI API key            | -        |
| `OPENAI_CHAT_MODEL`          | ❌ No    | Primary chat model        | `gpt-4o` |
| `OPENAI_FALLBACK_CHAT_MODEL` | ❌ No    | Fallback if primary fails | `gpt-4o` |

### Email (Resend)

| Variable          | Required | Description                       | Example              |
| ----------------- | -------- | --------------------------------- | -------------------- |
| `RESEND_API_KEY`  | ❌ No    | Resend API key for sending emails | `re_...`             |
| `SMTP_FROM_EMAIL` | ❌ No    | Email sender address              | `noreply@kourti.com` |

### Development Defaults

| Variable              | Description                  | Default                                |
| --------------------- | ---------------------------- | -------------------------------------- |
| `DEV_DEFAULT_USER_ID` | Default user for dev mode    | `00000000-0000-0000-0000-000000000001` |
| `DEV_DEFAULT_ORG_ID`  | Default organization for dev | `00000000-0000-0000-0000-000000000001` |

### Security & Feature Flags

| Variable        | Required | Description              | Default |
| --------------- | -------- | ------------------------ | ------- |
| `DISABLE_HSTS`  | ❌ No    | Disable HSTS header      | `false` |
| `RUN_BOOTSTRAP` | ❌ No    | Run DB bootstrap in prod | `false` |

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
# - DATABASE_URL
# - JWT_SECRET and JWT_REFRESH_SECRET
```

### 2. Configure Backend Environment

Set backend variables in your deployment platform:

```bash
# Railway
railway variables set DATABASE_URL="postgresql://..."
railway variables set JWT_SECRET="your-secret"
railway variables set OPENAI_API_KEY="sk-..."
railway variables set APP_URL="https://app.kourti.com"
railway variables set RESEND_API_KEY="re-..."
```

### 3. Configure Production (Vercel)

Set frontend variables in Vercel:

```bash
# Via Vercel CLI
vercel env add VITE_APP_URL
vercel env add VITE_BACKEND_API_URL
vercel env add VITE_USE_NODE_BACKEND

# Or via Vercel Dashboard:
# Project Settings → Environment Variables
```

### 4. Validate Configuration

```bash
# Frontend validation (runs automatically on app start)
npm run dev

# Backend validation (Zod validates on startup - crashes if required vars missing)
cd backend-node && npm run dev
```

## Environment Validation

### Frontend Validation

The application validates environment variables on startup using [src/lib/env.ts](../src/lib/env.ts).

### Backend Validation

The Node backend uses Zod schema validation in `backend-node/src/config/env.ts`. If required variables are missing, the server will crash with a clear error message.

## Security Best Practices

### 1. Never Expose Secrets in Frontend

❌ **WRONG**:

```javascript
// DO NOT DO THIS
const apiKey = import.meta.env.VITE_OPENAI_API_KEY; // Exposed to browser!
```

✅ **CORRECT**:

```javascript
// Make API call through Node backend
const response = await fetch('/api/v1/ai/analyze', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ prompt: 'Hello' }),
});
// OpenAI key stays secure in Node backend
```

### 2. Use Different Keys for Different Environments

```bash
# Development
VITE_BACKEND_API_URL=http://localhost:4000

# Production
VITE_BACKEND_API_URL=https://api.kourti.com
```

### 3. Rotate Secrets Regularly

- JWT secrets: Rotate every 90 days
- API keys (OpenAI, Resend): Rotate every 180 days

## Troubleshooting

### Issue: Backend crashes on startup with Zod error

**Cause**: Required environment variables not set.

**Solution**: Check the error message for which variables are missing, then set them.

### Issue: CORS errors in production

**Cause**: `CORS_ORIGINS` or `APP_URL` not set correctly.

**Solution**:

```bash
CORS_ORIGINS="https://app.kourti.com"
APP_URL="https://app.kourti.com"
# Ensure no trailing slash and https:// protocol included
```

### Issue: Auth not working

**Cause**: `JWT_SECRET` not matching between token signing and verification.

**Solution**: Ensure the same `JWT_SECRET` is used across all backend instances.

## Environment Files

### `.env` (Local Development)

- **Never commit** to version control
- Contains actual secrets and keys
- Used during local development

### `.env.example` (Template)

- **Commit to version control**
- Contains placeholder values
- Documents required variables

## Related Documentation

- [CORS Implementation](./CORS_IMPLEMENTATION.md)
- [Docker Local Setup](./docker-local-setup.md)
- [Environment Validation](../src/lib/env.ts)

## References

- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
