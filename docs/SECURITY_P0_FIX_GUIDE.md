# P0 Security Fixes - Quick Implementation Guide

**Estimated Time:** 8-9 hours
**Priority:** 🔴 **CRITICAL - Must complete before production**

---

## Overview

This guide provides step-by-step instructions to fix 3 critical security vulnerabilities identified in the security audit.

---

## Fix 1: compare-contracts - Add Authentication & Rate Limiting

**File:** `supabase/functions/compare-contracts/index.ts`
**Time:** 2-3 hours

### Step 1: Add Imports

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";
```

### Step 2: Add ALLOWED_ORIGINS

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
    if (origin && !origin.startsWith('http://') && !origin.startsWith('https://')) {
      return `https://${origin}`;
    }
    return origin;
  })
  .filter((origin) => origin && (origin.startsWith('http://') || origin.startsWith('https://')));
```

### Step 3: Add getCorsOptions Function

```typescript
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
```

### Step 4: Add Authentication Function

```typescript
async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw new HttpError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new HttpError('Server configuration error', 503, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError?.message);
    throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
  }

  return { user, supabase };
}
```

### Step 5: Update Main Handler

Replace the existing handler with:

```typescript
Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request
    const { user, supabase } = await authenticateRequest(req);
    console.log(`Processing contract comparison for user ${user.id}`);

    // CSRF Protection
    await requireCsrfTokenForUser(supabase, user.id, req);

    // Rate limiting - prevent AI abuse
    const rateLimitId = user.id;
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.AI, // 20 requests per minute
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { document1, document2 } = body ?? {};

    if (!document1 || !document2) {
      throw new HttpError('Both documents are required for comparison', 400, 'INVALID_INPUT');
    }

    // ... rest of existing comparison logic ...

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      { success: true, comparison: result },
      { cors: corsOptions, headers: rateLimitHeaders }
    );

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'compare-contracts',
    });
  }
});
```

### Step 6: Test

```bash
# Test 1: No auth - should fail with 401
curl -X POST http://localhost:54321/functions/v1/compare-contracts \
  -H "Content-Type: application/json" \
  -d '{"document1": "test", "document2": "test"}'

# Test 2: With auth - should succeed
curl -X POST http://localhost:54321/functions/v1/compare-contracts \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -d '{"document1": "test", "document2": "test"}'

# Test 3: Rate limit - run 21 times in 1 minute, should fail on 21st
```

---

## Fix 2: contract-analysis-ai - Add Authentication & Rate Limiting

**File:** `supabase/functions/contract-analysis-ai/index.ts`
**Time:** 2-3 hours

**Note:** This fix is nearly identical to Fix 1. Follow the same steps:

1. Add same imports
2. Add same ALLOWED_ORIGINS
3. Add same getCorsOptions function
4. Add same authenticateRequest function
5. Update main handler with auth, CSRF, and rate limiting
6. Replace error handling with HttpError and createSanitizedErrorResponse
7. Test with same test cases

**Specific changes:**
- Function name in logs: `contract-analysis-ai`
- Keep existing GPT-4o model logic
- Ensure all error responses use `createSanitizedErrorResponse`

---

## Fix 3: extract-document-text - Fix CORS + Add Authentication

**File:** `supabase/functions/extract-document-text/index.ts`
**Time:** 2-3 hours

### Step 1: Remove Wildcard CORS

**Find and remove:**
```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // ❌ Remove this
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### Step 2: Add Proper Imports

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS, createRateLimitHeaders } from "../_shared/rateLimiting.ts";
import { HttpError, createErrorResponse } from "../_shared/httpError.ts";
import { createErrorResponse as createSanitizedErrorResponse } from "../_shared/errorHandling.ts";
import { requireCsrfTokenForUser } from "../_shared/csrfProtection.ts";
```

### Step 3: Add ALLOWED_ORIGINS + getCorsOptions

```typescript
const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081", // Add this if used
  "http://localhost:8083",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
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
```

### Step 4: Add Authentication + Input Validation

```typescript
async function authenticateRequest(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    throw new HttpError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw new HttpError('Invalid authentication token', 401, 'UNAUTHORIZED');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new HttpError('Server configuration error', 503, 'CONFIG_ERROR');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    console.error('Authentication failed:', authError?.message);
    throw new HttpError('Invalid or expired authentication token', 401, 'UNAUTHORIZED');
  }

  return { user, supabase };
}

// Add UUID validation
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
```

### Step 5: Update Main Handler

```typescript
Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("Origin");
  const corsOptions = getCorsOptions(requestOrigin);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse({ status: 204, cors: corsOptions });
  }

  try {
    // Authenticate the request
    const { user, supabase } = await authenticateRequest(req);
    console.log(`Processing document extraction for user ${user.id}`);

    // CSRF Protection
    await requireCsrfTokenForUser(supabase, user.id, req);

    // Rate limiting - prevent abuse
    const rateLimitId = user.id;
    const rateLimitResult = checkRateLimit({
      ...RATE_LIMIT_PRESETS.API, // 100 requests per minute
      identifier: rateLimitId,
    });

    if (!rateLimitResult.allowed) {
      const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
      return createJsonResponse(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMIT_EXCEEDED',
        },
        {
          status: 429,
          cors: corsOptions,
          headers: rateLimitHeaders,
        }
      );
    }

    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new HttpError('Invalid JSON payload', 400, 'INVALID_JSON');
    }

    const { documentId, filePath } = body ?? {};

    // Validate inputs
    if (!documentId || !isValidUUID(documentId)) {
      throw new HttpError('Valid document ID is required', 400, 'INVALID_INPUT');
    }

    if (!filePath || typeof filePath !== 'string') {
      throw new HttpError('Valid file path is required', 400, 'INVALID_INPUT');
    }

    // Prevent path traversal
    if (filePath.includes('..') || filePath.startsWith('/')) {
      throw new HttpError('Invalid file path', 400, 'INVALID_INPUT');
    }

    // ... rest of existing extraction logic ...

    const rateLimitHeaders = createRateLimitHeaders(rateLimitResult);
    return createJsonResponse(
      { success: true, text: extractedText },
      { cors: corsOptions, headers: rateLimitHeaders }
    );

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return createErrorResponse(error, corsOptions);
    }
    return createSanitizedErrorResponse(error, corsOptions, {
      function: 'extract-document-text',
    });
  }
});
```

### Step 6: Test

```bash
# Test 1: Wildcard CORS blocked
curl -X POST http://localhost:54321/functions/v1/extract-document-text \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json"
# Should see CORS error or restricted origin

# Test 2: Valid origin with auth
curl -X POST http://localhost:54321/functions/v1/extract-document-text \
  -H "Origin: http://localhost:5173" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentId": "valid-uuid", "filePath": "documents/file.pdf"}'
# Should succeed

# Test 3: Path traversal prevention
curl -X POST http://localhost:54321/functions/v1/extract-document-text \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"documentId": "valid-uuid", "filePath": "../../../etc/passwd"}'
# Should fail with 400
```

---

## Deployment Checklist

After completing all P0 fixes:

### Pre-Deployment
- [ ] All 3 functions tested locally with Supabase CLI
- [ ] Authentication test passed for all 3
- [ ] Rate limiting test passed for all 3
- [ ] CORS test passed for all 3
- [ ] CSRF test passed for all 3
- [ ] Path traversal test passed (extract-document-text)

### Deployment
- [ ] Deploy functions to staging: `supabase functions deploy <function-name>`
- [ ] Test on staging environment
- [ ] Monitor logs for errors: `supabase functions logs <function-name>`
- [ ] Deploy to production
- [ ] Monitor production logs for 24 hours

### Post-Deployment
- [ ] Verify authentication working in production
- [ ] Verify rate limiting triggering correctly
- [ ] Check error logs for any sanitization issues
- [ ] Update [SECURITY_AUDIT_COMPLETE.md](./SECURITY_AUDIT_COMPLETE.md) with completion dates

---

## Rollback Plan

If issues arise after deployment:

```bash
# Revert to previous version
supabase functions deploy <function-name> --version <previous-version>

# Or disable function temporarily
# (Manual in Supabase Dashboard: Edge Functions → Function → Disable)
```

---

## Support

- **Documentation:** [CORS_IMPLEMENTATION.md](./CORS_IMPLEMENTATION.md)
- **Environment:** [ENVIRONMENT.md](./ENVIRONMENT.md)
- **Security Audit:** [SECURITY_AUDIT_COMPLETE.md](./SECURITY_AUDIT_COMPLETE.md)

---

**Estimated Total Time:** 8-9 hours
**Risk Level:** 🔴 High - These are critical security vulnerabilities
**Priority:** Fix before any production deployment

**Last Updated:** 2025-01-23
