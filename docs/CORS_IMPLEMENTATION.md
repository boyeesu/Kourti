# CORS Implementation Guide

This document provides a comprehensive guide for implementing CORS (Cross-Origin Resource Sharing) in Supabase Edge Functions.

## Table of Contents

- [Overview](#overview)
- [Standard CORS Pattern](#standard-cors-pattern)
- [Security Considerations](#security-considerations)
- [Implementation Checklist](#implementation-checklist)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Function Status](#function-status)

## Overview

All Supabase Edge Functions **MUST** implement CORS correctly to:
1. Allow legitimate requests from our frontend applications
2. Block requests from unauthorized origins
3. Support credentials (cookies, auth headers) securely
4. Include security headers for defense in depth

## Standard CORS Pattern

### Step 1: Import Required Modules

```typescript
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions
} from "../_shared/responseHeaders.ts";
```

### Step 2: Define Allowed Origins

Every edge function should define allowed origins at the top:

```typescript
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8083",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    // Ensure all origins have a protocol
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));
```

### Step 3: Create CORS Options Helper

```typescript
function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  // Can't use "*" with allowCredentials: true, so we must have a specific origin
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}
```

### Step 4: Handle OPTIONS Preflight

In your Deno.serve handler, **always** handle OPTIONS first:

```typescript
Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // CRITICAL: Handle OPTIONS preflight requests
  if (req.method === "OPTIONS") {
    return createEmptyResponse({ cors: corsOptions });
  }

  // ... rest of your handler
});
```

### Step 5: Include CORS in All Responses

**Every Response** must include CORS headers:

```typescript
// Success response
return createJsonResponse(
  { success: true, data: result },
  { cors: corsOptions }
);

// Error response
return createJsonResponse(
  { error: "Something went wrong" },
  { status: 500, cors: corsOptions }
);
```

## Security Considerations

### 1. Never Use Wildcard with Credentials

❌ **WRONG**:
```typescript
{
  origin: "*",
  allowCredentials: true  // This is forbidden by browsers!
}
```

✅ **CORRECT**:
```typescript
{
  origin: requestOrigin,  // Specific origin
  allowCredentials: true
}
```

### 2. Validate Request Origin

Always validate the origin against your allowlist:

```typescript
const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
  ? requestOrigin
  : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");
```

### 3. Security Headers Are Included Automatically

The `createCorsSecurityHeaders` function automatically includes:
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (restrictive by default)
- `Strict-Transport-Security` (HSTS, in production only)
- `Cache-Control: no-store, no-cache, must-revalidate`

### 4. HSTS in Production Only

HSTS is automatically disabled in:
- Local development (`ENVIRONMENT=development` or `SUPABASE_FUNCTIONS_ENV=local`)
- When `DISABLE_HSTS=true` is set

## Implementation Checklist

Use this checklist when creating or auditing edge functions:

- [ ] Import `createEmptyResponse`, `createJsonResponse`, `CorsSecurityHeadersOptions` from `_shared/responseHeaders.ts`
- [ ] Define `ALLOWED_ORIGINS` array with all legitimate origins
- [ ] Create `getCorsOptions()` helper function
- [ ] Handle `OPTIONS` method FIRST in Deno.serve handler
- [ ] Return `createEmptyResponse({ cors: corsOptions })` for OPTIONS
- [ ] Include `cors: corsOptions` in **ALL** success responses
- [ ] Include `cors: corsOptions` in **ALL** error responses
- [ ] Use `createJsonResponse()` for JSON responses (auto-includes Content-Type)
- [ ] Test with actual frontend making CORS requests
- [ ] Verify preflight (OPTIONS) returns 200 with correct headers
- [ ] Verify actual request includes CORS headers in response

## Examples

### Complete Edge Function Example

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  createEmptyResponse,
  createJsonResponse,
  CorsSecurityHeadersOptions
} from "../_shared/responseHeaders.ts";
import { createErrorResponse } from "../_shared/errorHandling.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "https://app.kourti.com",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean)
  .map((origin) => {
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");

  return {
    origin,
    requestOrigin,
    allowedOrigins: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : undefined,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}

serve(async (req: Request) => {
  const requestOrigin = req.headers.get("origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return createEmptyResponse({ cors: corsOptions });
  }

  try {
    // Your business logic here
    const data = await processRequest(req);

    return createJsonResponse(
      { success: true, data },
      { cors: corsOptions }
    );
  } catch (error) {
    console.error("Error processing request:", error);

    return createErrorResponse(
      error,
      { cors: corsOptions }
    );
  }
});
```

### Testing CORS Locally

```bash
# Test OPTIONS preflight
curl -X OPTIONS http://localhost:54321/functions/v1/your-function \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  -v

# Expected response headers:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Methods: POST, OPTIONS
# Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type, x-csrf-token
# Access-Control-Max-Age: 86400
# Access-Control-Allow-Credentials: true
```

## Troubleshooting

### Issue: "CORS policy: No 'Access-Control-Allow-Origin' header is present"

**Cause**: Edge function is not including CORS headers in response.

**Solution**:
1. Ensure `cors: corsOptions` is passed to all `createJsonResponse()` calls
2. Ensure OPTIONS handler is before main logic
3. Check that `getCorsOptions()` is called with request origin

### Issue: "CORS policy: The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*' when the request's credentials mode is 'include'"

**Cause**: Trying to use wildcard origin with credentials.

**Solution**: Always use specific origin validation in `getCorsOptions()`.

### Issue: Preflight OPTIONS returns 404

**Cause**: OPTIONS handler is not first in Deno.serve.

**Solution**: Move OPTIONS check to the very top of the handler:
```typescript
if (req.method === "OPTIONS") {
  return createEmptyResponse({ cors: corsOptions });
}
```

### Issue: CORS works locally but not in production

**Cause**: Production origin not in ALLOWED_ORIGINS.

**Solution**:
1. Check `APP_URL` environment variable in Supabase dashboard
2. Add production domain to ALLOWED_ORIGINS array
3. Ensure protocol (https) is included

## Function Status

Track CORS implementation status across all edge functions:

### ✅ Implemented (Good Examples)
- `create-invited-user` - Complete implementation with rate limiting and CSRF
- `voice-transcription` - Includes CORS, rate limiting, CSRF
- `send-invitation-email` - Complete CORS implementation

### ⚠️ Needs Review
- `send-invitation-email` - Verify rate limiting added
- `voice-transcription` - Verify rate limiting sufficient
- `generate-embeddings` - Needs rate limiting
- `send-notification-email` - Audit CORS implementation
- `send-password-reset-email` - Audit CORS implementation
- `compare-contracts` - Verify CORS headers
- `contract-analysis-ai` - Verify CORS headers
- `advanced-contract-analysis` - Verify CORS headers
- `ream-ai-assistant` - Verify CORS headers
- `extract-document-text` - Verify CORS headers
- `process-document-chunks` - Verify CORS headers

### 🔄 Scheduled Functions (Lower Priority)
- `calendar-sync-scheduler` - Cron job, no client access
- `process-invitation-updates` - Background job
- `process-event-reminders` - Background job

### 📋 To Audit
Run this checklist on each function:
1. OPTIONS handler present and returns early
2. ALLOWED_ORIGINS defined
3. getCorsOptions() helper implemented
4. All responses include `cors: corsOptions`
5. Error responses include CORS headers
6. Rate limiting implemented (for expensive operations)
7. CSRF protection added (for state-changing operations)

## Best Practices

1. **Copy-Paste Pattern**: Use `create-invited-user` as the gold standard template
2. **Early OPTIONS Return**: Always handle OPTIONS first
3. **Consistent Origin List**: Keep ALLOWED_ORIGINS identical across functions
4. **Environment Variable**: Use `APP_URL` for dynamic origin configuration
5. **Test Both Preflight and Actual**: Test OPTIONS and POST/GET separately
6. **Include CSRF**: State-changing operations should also require CSRF tokens
7. **Add Rate Limiting**: Expensive operations should be rate-limited

## Related Documentation

- [Response Headers Module](../supabase/functions/_shared/responseHeaders.ts)
- [Rate Limiting](./RATE_LIMITING.md) (to be created)
- [CSRF Protection](./CSRF_PROTECTION.md) (to be created)
- [Security Audit Results](../SECURITY_AUDIT_RESULTS.md)
- [Pending Security Issues](../PENDING_SECURITY_ISSUES.md)

## References

- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Supabase Edge Functions CORS](https://supabase.com/docs/guides/functions/cors)
- [OWASP CORS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
