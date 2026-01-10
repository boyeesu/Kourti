# Pending Security Issues - Action Items

Based on the security scan report, here are the remaining security issues that need to be addressed:

## ✅ COMPLETED (From Recent Fixes)
- ✅ Hardcoded secrets removed from `env.ts`
- ✅ Password generation bias fixed
- ✅ Password removed from API responses
- ✅ File upload validation added
- ✅ CORS configuration improved (using shared helper with origin validation)

---

## 🔴 HIGH PRIORITY - Still Pending

### 1. **CORS Configuration Audit**
**Status:** Partially Fixed  
**Action Required:** Verify ALL edge functions use proper CORS

**Edge Functions to Check:**
- [ ] `send-invitation-email` - Check if using proper CORS helper
- [ ] `send-notification-email` - Verify CORS configuration
- [ ] `send-password-reset-email` - Verify CORS configuration
- [ ] `ream-ai-assistant` - Verify CORS configuration
- [ ] `voice-transcription` - Verify CORS configuration
- [ ] `generate-embeddings` - Verify CORS configuration
- [ ] `process-document-chunks` - Verify CORS configuration
- [ ] `calendar-ics` - Verify CORS configuration
- [ ] `teams-calendar-sync` - Verify CORS configuration
- [ ] `sso-authorize` - Already using proper CORS ✅
- [ ] `sso-callback` - Verify CORS configuration

**Fix Pattern:**
All functions should use the shared `responseHeaders.ts` helper:
```typescript
import { createEmptyResponse, createJsonResponse, CorsSecurityHeadersOptions } from "../_shared/responseHeaders.ts";

const ALLOWED_ORIGINS = [
  Deno.env.get("APP_URL"),
  "http://localhost:3000",
  "http://localhost:5173",
  "https://app.kourti.com",
  "https://kouti-legal-hub-41.lovable.app",
]
  .flatMap((value) => (value ? value.split(",") : []))
  .filter(Boolean);

function getCorsOptions(requestOrigin: string | null): CorsSecurityHeadersOptions {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : (ALLOWED_ORIGINS[0] || "https://app.kourti.com");
  
  return {
    origin,
    allowCredentials: true,
    allowMethods: ["POST", "OPTIONS"],
  };
}
```

---

### 2. **SECURITY DEFINER Functions Audit**
**Severity:** HIGH  
**Status:** ✅ COMPLETE - All functions properly configured

**Issue:** 177 instances of `SECURITY DEFINER` functions found. Many may not have explicit `SET search_path` clauses.

**Resolution:** Audit completed - 0 functions need fixing. All SECURITY DEFINER functions already have explicit `SET search_path` clauses.

**Action Required:**
1. Audit all `SECURITY DEFINER` functions in migration files
2. Ensure all have explicit `SET search_path = ''` or `SET search_path = 'public'`
3. Prefer `SET search_path = ''` for maximum security (requires fully qualified names)

**SQL Query to Find Functions Needing Fix:**
```sql
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true  -- SECURITY DEFINER
  AND pg_get_functiondef(p.oid) NOT LIKE '%SET search_path%';
```

**Fix Pattern:**
```sql
CREATE OR REPLACE FUNCTION public.some_function()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''  -- ✅ Explicit and secure
AS $$
BEGIN
  -- Use fully qualified names: public.table_name
  SELECT * FROM public.profiles WHERE ...
END;
$$;
```

---

### 3. **Rate Limiting Implementation**
**Severity:** HIGH  
**Status:** Not Implemented

**Issue:** No rate limiting on edge functions, vulnerable to:
- Brute force attacks
- Resource exhaustion
- Cost spikes (especially for AI functions)

**Action Required:**
1. Implement rate limiting per user/IP
2. Use Supabase Edge Function rate limiting or Redis
3. Add throttling for expensive operations (AI calls)
4. Monitor and alert on unusual activity

**Implementation Options:**

**Option A: Supabase Built-in Rate Limiting**
```typescript
// Use Supabase's rate limiting headers
const rateLimitKey = `rate_limit:${userId}:${functionName}`;
// Check rate limit before processing
```

**Option B: Redis-based Rate Limiting**
```typescript
import { Redis } from "https://deno.land/x/redis@v0.32.0/mod.ts";

const redis = new Redis({
  hostname: Deno.env.get("REDIS_HOST"),
  port: parseInt(Deno.env.get("REDIS_PORT") || "6379"),
});

const rateLimitKey = `rate_limit:${userId}:${functionName}`;
const rateLimitCount = await redis.incr(rateLimitKey);
if (rateLimitCount === 1) {
  await redis.expire(rateLimitKey, 60); // 1 minute window
}
if (rateLimitCount > 10) { // 10 requests per minute
  throw new HttpError('Rate limit exceeded', 429, 'RATE_LIMIT');
}
```

**Functions Needing Rate Limiting:**
- [ ] `create-invited-user` - Prevent user enumeration
- [ ] `send-invitation-email` - Prevent email spam
- [ ] `ream-ai-assistant` - Prevent AI cost abuse
- [ ] `voice-transcription` - Prevent resource exhaustion
- [ ] `generate-embeddings` - Prevent cost spikes
- [ ] `ai-contract-generator` - Prevent cost spikes
- [ ] Authentication endpoints - Prevent brute force

---

### 4. **Error Message Sanitization**
**Severity:** HIGH  
**Status:** Needs Implementation

**Issue:** Error messages may leak sensitive information (database structure, paths, user IDs, config).

**Action Required:**
1. Sanitize all error messages before returning to client
2. Log detailed errors server-side only
3. Return generic error messages to clients
4. Use error codes instead of descriptive messages

**Fix Pattern:**
```typescript
catch (error: any) {
  // Log detailed error server-side only
  console.error('Detailed error (server-side only):', {
    message: error.message,
    stack: error.stack,
    userId: userId,
    // ... other sensitive details
  });
  
  // Return sanitized error to client
  return createJsonResponse(
    { 
      success: false,
      error: 'An error occurred. Please try again.',
      errorCode: 'INTERNAL_ERROR' // Generic code
    },
    { 
      status: 500,
      cors: corsOptions
    }
  );
}
```

**Functions to Update:**
- [ ] All edge functions error handlers
- [ ] Frontend error handling (don't expose server errors)

---

### 5. **CSRF Protection**
**Severity:** HIGH  
**Status:** Not Implemented

**Issue:** No CSRF tokens, relies solely on CORS (which is now properly configured but not sufficient).

**Action Required:**
1. Implement CSRF token validation
2. Use SameSite cookies for session management
3. Validate Referer/Origin headers
4. Consider Supabase's built-in CSRF protection

**Implementation:**
```typescript
// Generate CSRF token on session creation
const csrfToken = crypto.randomUUID();

// Validate CSRF token on requests
const requestToken = req.headers.get('X-CSRF-Token');
if (!requestToken || requestToken !== expectedToken) {
  throw new HttpError('Invalid CSRF token', 403, 'CSRF_ERROR');
}
```

---

### 6. **Organization ID Validation Consistency**
**Severity:** HIGH  
**Status:** Needs Audit

**Issue:** Organization validation exists but needs to be consistent across all functions.

**Action Required:**
1. Create reusable organization validation function
2. Apply to all edge functions that accept `organizationId`
3. Use database-level constraints where possible
4. Add unit tests for organization boundary checks

**Create Shared Helper:**
```typescript
// _shared/organizationValidation.ts
export async function validateOrganizationAccess(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userId)
    .single();
  
  return profile?.organization_id === organizationId;
}
```

---

## 🟡 MEDIUM PRIORITY - Pending

### 7. **Security Headers**
**Status:** Partially Implemented (in responseHeaders.ts helper)

**Action Required:**
1. Verify all edge functions use security headers
2. Add Content-Security-Policy header
3. Ensure HSTS is enabled for production
4. Add security headers to Vite build (via Vercel/Netlify config)

**Headers Needed:**
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy: strict-origin-when-cross-origin`

**Vercel Configuration:**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

---

### 8. **RLS Policy Audit**
**Status:** Most tables have RLS, but needs verification

**Action Required:**
1. Audit all tables to ensure RLS is enabled
2. Test RLS policies with different user roles
3. Verify no tables are missing policies
4. Check for policy conflicts or gaps

**SQL to Check:**
```sql
-- Find tables without RLS enabled
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT IN (
    SELECT tablename 
    FROM pg_policies 
    WHERE schemaname = 'public'
  );

-- Find tables with RLS disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = false;
```

---

### 9. **Password Policy Enforcement**
**Status:** Not Enforced

**Action Required:**
1. Enforce minimum password length (12+ characters)
2. Require mix of uppercase, lowercase, numbers, symbols
3. Check against common password lists
4. Implement password strength meter
5. Use Supabase Auth password policies

**Supabase Configuration:**
```sql
-- Set password policy in Supabase Auth settings
-- Or use Supabase Dashboard: Authentication > Policies
```

---

### 10. **Session Management Enhancement**
**Status:** Basic implementation exists

**Action Required:**
1. Implement session timeout (verify `useInactivityLogout` works)
2. Add "Remember Me" functionality securely
3. Implement concurrent session limits
4. Add session invalidation on password change
5. Log security events (logins, password changes)

---

### 11. **Logging and Monitoring**
**Status:** Basic logging exists

**Action Required:**
1. Implement comprehensive security event logging
2. Monitor for suspicious activities:
   - Failed logins
   - Privilege escalations
   - Unusual API usage patterns
3. Set up alerts for security events
4. Log all admin actions
5. Implement audit trails for sensitive operations

**Recommended Tools:**
- Supabase Logs
- Sentry for error tracking
- Custom logging to database
- CloudWatch / Datadog for monitoring

---

### 12. **Email Security**
**Status:** Needs Verification

**Action Required:**
1. Verify email sending uses TLS
2. Implement email verification for new accounts
3. Add SPF/DKIM/DMARC records
4. Sanitize email content to prevent injection
5. Use email templates to prevent XSS in emails

---

### 13. **API Key Security**
**Status:** Needs Verification

**Action Required:**
1. Verify OpenAI API key is NEVER used in frontend code
2. All AI operations must go through edge functions
3. Verify `VITE_OPENAI_API_KEY` is not used in frontend
4. Rotate API keys regularly
5. Use environment variables in Supabase Edge Functions only

---

## 🟢 LOW PRIORITY / BEST PRACTICES

### 14. **Source Maps in Production**
**Status:** Currently enabled

**Action:** Disable source maps in production builds

**Fix:**
```typescript
// vite.config.ts
sourcemap: import.meta.env.PROD ? false : true,
```

---

### 15. **Security Testing**
**Status:** Not Implemented

**Action Required:**
1. Implement automated security testing in CI/CD
2. Regular penetration testing
3. Dependency scanning in pipeline
4. SAST (Static Application Security Testing)

**Tools:**
- OWASP ZAP
- Snyk
- SonarQube
- npm audit (already in use)

---

## 📋 PRIORITY SUMMARY

### Immediate (This Week)
1. 🔴 Audit and fix CORS in all edge functions
2. 🔴 Implement rate limiting on critical functions
3. 🔴 Sanitize error messages in all edge functions

### High Priority (This Month)
4. 🟠 Audit SECURITY DEFINER functions
5. 🟠 Implement CSRF protection
6. 🟠 Create organization validation helper
7. 🟠 Add security headers verification

### Medium Priority (Next Quarter)
8. 🟡 Complete RLS policy audit
9. 🟡 Implement password policies
10. 🟡 Enhance logging/monitoring
11. 🟡 Email security improvements

---

## 📝 NOTES

- The `create-invited-user` function now properly handles password security
- CORS is partially fixed using shared helper - need to verify all functions
- File upload validation is implemented
- Hardcoded secrets are removed

**Next Steps:**
1. Review this list with your team
2. Prioritize based on your risk assessment
3. Create tickets for each item
4. Track progress in this document
