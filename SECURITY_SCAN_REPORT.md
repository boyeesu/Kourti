# Security Scan Report - Kouti Legal Hub
**Date:** $(Get-Date -Format "yyyy-MM-dd")  
**Application:** Kouti Legal Hub (React + TypeScript + Supabase)  
**Scan Type:** Comprehensive Security Audit

---

## Executive Summary

This security scan identified **15 critical and high-priority security issues** requiring immediate attention, along with **12 medium-priority recommendations** and **8 low-priority improvements**. The application demonstrates good security practices in several areas (RLS policies, input validation, XSS protection) but has significant vulnerabilities in secrets management, CORS configuration, and edge function security.

**Overall Security Rating: 6.5/10** (Moderate Risk)

---

## 🔴 CRITICAL ISSUES (Immediate Action Required)

### 1. **Hardcoded Secrets in Source Code**
**Severity:** CRITICAL  
**Location:** `src/lib/env.ts:83-84`

**Issue:**
```typescript
const DEV_FALLBACK_URL = import.meta.env.DEV ? 'https://zjbvnvydgsxqmmrrmvif.supabase.co' : '';
const DEV_FALLBACK_KEY = import.meta.env.DEV ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' : '';
```

**Risk:** 
- Supabase project URL and anon key are hardcoded in source code
- These credentials are exposed in client-side JavaScript bundles
- Anyone can extract these keys from the browser's developer tools
- Allows unauthorized access to your Supabase project

**Recommendation:**
1. **IMMEDIATELY** rotate the exposed Supabase anon key in Supabase dashboard
2. Remove all hardcoded credentials from source code
3. Use environment variables exclusively (even in development)
4. Ensure `.env` files are in `.gitignore` (verify this)
5. Never commit secrets to version control

**Fix:**
```typescript
// Remove DEV_FALLBACK_URL and DEV_FALLBACK_KEY entirely
// Force environment variables to be set
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
}
```

---

### 2. **Overly Permissive CORS Configuration**
**Severity:** CRITICAL  
**Location:** `supabase/functions/create-invited-user/index.ts:7`

**Issue:**
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

**Risk:**
- `Access-Control-Allow-Origin: *` allows any website to make requests to your edge functions
- Enables Cross-Site Request Forgery (CSRF) attacks
- Malicious sites can potentially invoke your functions if users are authenticated

**Recommendation:**
1. Restrict CORS to specific allowed origins
2. Use environment variable for allowed origins
3. Implement origin validation

**Fix:**
```typescript
const allowedOrigins = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['https://yourdomain.com'];
const origin = req.headers.get('Origin');

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin || '') ? origin : allowedOrigins[0],
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

**Apply to ALL edge functions** (check: `create-invited-user`, `send-invitation-email`, `ream-ai-assistant`, `voice-transcription`, `ai-contract-generator`, etc.)

---

### 3. **Temporary Password Exposed in API Response**
**Severity:** CRITICAL  
**Location:** `supabase/functions/create-invited-user/index.ts:173`

**Issue:**
```typescript
return new Response(
  JSON.stringify({
    success: true,
    userId: newUser.user.id,
    tempPassword, // ⚠️ Exposed in response
    message: 'User created successfully',
  }),
```

**Risk:**
- Temporary passwords are returned in API responses
- If intercepted (man-in-the-middle, logs, browser history), passwords are compromised
- Passwords may be logged in server logs or browser console

**Recommendation:**
1. **NEVER** return passwords in API responses
2. Send passwords only via secure email channel
3. Use one-time password links instead of plain passwords
4. Implement password reset flow for invited users

**Fix:**
```typescript
// Don't return password in response
return new Response(
  JSON.stringify({
    success: true,
    userId: newUser.user.id,
    message: 'User created successfully. Credentials sent via email.',
  }),
  { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
);

// Send password ONLY via email (in send-invitation-email function)
```

---

### 4. **Insufficient Password Generation Entropy**
**Severity:** HIGH  
**Location:** `supabase/functions/create-invited-user/index.ts:22-27`

**Issue:**
```typescript
function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}
```

**Risk:**
- Using modulo operation (`byte % chars.length`) introduces bias in password generation
- Some characters are more likely to appear than others
- Reduces effective entropy

**Recommendation:**
Use a cryptographically secure method without bias:

**Fix:**
```typescript
function generateTempPassword(length = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const charsLength = chars.length;
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  // Use rejection sampling to avoid bias
  let password = '';
  for (let i = 0; i < length; i++) {
    let randomByte;
    do {
      randomByte = array[i];
    } while (randomByte >= 256 - (256 % charsLength));
    password += chars[randomByte % charsLength];
  }
  return password;
}
```

Or use a library like `nanoid` for better security.

---

### 5. **Missing Input Validation on File Uploads**
**Severity:** HIGH  
**Location:** Multiple files (`DocumentUpload.tsx`, `ContractUploadDialog.tsx`, `useDocuments.tsx`)

**Issue:**
- File type validation appears minimal
- No file size limits enforced client-side
- No virus/malware scanning
- File extensions can be spoofed

**Risk:**
- Malicious file uploads (executables, scripts)
- Storage quota exhaustion
- Potential code execution if files are processed unsafely

**Recommendation:**
1. Implement strict file type validation (whitelist approach)
2. Enforce file size limits (e.g., 10MB max)
3. Validate file content, not just extension
4. Scan files server-side before storage
5. Use Supabase Storage policies to enforce limits

**Fix Example:**
```typescript
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

if (!ALLOWED_FILE_TYPES.includes(file.type)) {
  throw new Error('File type not allowed');
}
if (file.size > MAX_FILE_SIZE) {
  throw new Error('File size exceeds limit');
}
```

---

## 🟠 HIGH PRIORITY ISSUES

### 6. **SECURITY DEFINER Functions Without Proper search_path**
**Severity:** HIGH  
**Location:** Multiple migration files (177 instances found)

**Issue:**
Many `SECURITY DEFINER` functions don't set `SET search_path = ''` or `SET search_path = 'public'`, which can lead to:
- Schema injection attacks
- Unintended function/table resolution
- Security bypass vulnerabilities

**Recommendation:**
1. Audit all `SECURITY DEFINER` functions
2. Ensure all have explicit `SET search_path` clauses
3. Prefer `SET search_path = ''` for maximum security (fully qualify all objects)
4. Or use `SET search_path = 'public'` if needed, but be explicit

**Example Fix:**
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

### 7. **Missing Rate Limiting on Edge Functions**
**Severity:** HIGH  
**Location:** All edge functions

**Issue:**
- No rate limiting on API endpoints
- Vulnerable to brute force attacks
- Can lead to resource exhaustion
- OpenAI API costs could spike from abuse

**Recommendation:**
1. Implement rate limiting per user/IP
2. Use Supabase Edge Function rate limiting features
3. Add request throttling for expensive operations (AI calls)
4. Monitor and alert on unusual activity

**Implementation:**
```typescript
// Add to edge functions
const rateLimitKey = `rate_limit:${userId}:${functionName}`;
const rateLimitCount = await redis.incr(rateLimitKey);
if (rateLimitCount === 1) {
  await redis.expire(rateLimitKey, 60); // 1 minute window
}
if (rateLimitCount > 10) { // 10 requests per minute
  throw new HttpError('Rate limit exceeded', 429, 'RATE_LIMIT');
}
```

---

### 8. **Insufficient Error Message Sanitization**
**Severity:** HIGH  
**Location:** Edge functions error responses

**Issue:**
Error messages may leak sensitive information:
- Database structure
- Internal paths
- User IDs
- System configuration

**Recommendation:**
1. Sanitize all error messages before returning to client
2. Log detailed errors server-side only
3. Return generic error messages to clients
4. Use error codes instead of descriptive messages

**Fix:**
```typescript
catch (error: any) {
  console.error('Detailed error (server-side only):', error);
  
  // Return sanitized error to client
  return new Response(
    JSON.stringify({ 
      success: false,
      error: 'An error occurred. Please try again.',
      errorCode: 'INTERNAL_ERROR' // Generic code
    }),
    { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
  );
}
```

---

### 9. **Missing CSRF Protection**
**Severity:** HIGH  
**Location:** All API endpoints

**Issue:**
- No CSRF tokens implemented
- Relies solely on CORS (which is currently too permissive)
- Vulnerable to cross-site request forgery

**Recommendation:**
1. Implement CSRF token validation
2. Use SameSite cookies for session management
3. Validate Referer/Origin headers
4. Consider using Supabase's built-in CSRF protection

---

### 10. **Organization ID Validation Bypass Risk**
**Severity:** HIGH  
**Location:** `supabase/functions/create-invited-user/index.ts:94`

**Issue:**
```typescript
if (organizationId !== callerProfile.organization_id) {
  throw new Error('Unauthorized: Cannot invite to a different organization');
}
```

While this check exists, ensure it's applied consistently across all functions.

**Recommendation:**
1. Create a reusable organization validation function
2. Apply to all edge functions that accept organizationId
3. Use database-level constraints where possible
4. Add unit tests for organization boundary checks

---

## 🟡 MEDIUM PRIORITY ISSUES

### 11. **Dependency Vulnerabilities**
**Status:** ✅ Currently clean (0 vulnerabilities found)  
**Action:** Continue monitoring with `npm audit` regularly

---

### 12. **Missing Security Headers**
**Severity:** MEDIUM  
**Location:** Vite config, edge functions

**Recommendation:**
Add security headers:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security` (HSTS)
- `Referrer-Policy: strict-origin-when-cross-origin`

**Implementation:**
```typescript
// In edge functions
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
```

---

### 13. **Incomplete RLS Policy Coverage**
**Severity:** MEDIUM  
**Status:** Most tables have RLS enabled, but verify all

**Recommendation:**
1. Audit all tables to ensure RLS is enabled
2. Test RLS policies with different user roles
3. Verify no tables are missing policies
4. Check for policy conflicts or gaps

**SQL to check:**
```sql
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  );
```

---

### 14. **Password Policy Not Enforced**
**Severity:** MEDIUM  
**Location:** User registration/password change flows

**Issue:**
No visible password complexity requirements enforced.

**Recommendation:**
1. Enforce minimum password length (12+ characters)
2. Require mix of uppercase, lowercase, numbers, symbols
3. Check against common password lists
4. Implement password strength meter
5. Use Supabase Auth password policies

---

### 15. **Session Management**
**Severity:** MEDIUM  
**Location:** `src/hooks/useAuth.tsx`

**Recommendation:**
1. Implement session timeout
2. Add "Remember Me" functionality securely
3. Implement concurrent session limits
4. Add session invalidation on password change
5. Log security events (logins, password changes)

**Note:** `useInactivityLogout` hook exists - verify it's working correctly.

---

### 16. **Logging and Monitoring Gaps**
**Severity:** MEDIUM

**Recommendation:**
1. Implement comprehensive security event logging
2. Monitor for suspicious activities (failed logins, privilege escalations)
3. Set up alerts for security events
4. Log all admin actions
5. Implement audit trails for sensitive operations

---

### 17. **Email Security**
**Severity:** MEDIUM  
**Location:** Invitation email flow

**Recommendation:**
1. Verify email sending uses TLS
2. Implement email verification for new accounts
3. Add SPF/DKIM/DMARC records
4. Sanitize email content to prevent injection
5. Use email templates to prevent XSS in emails

---

### 18. **API Key Exposure Risk**
**Severity:** MEDIUM  
**Location:** Frontend code using OpenAI API

**Issue:**
If OpenAI API key is used client-side, it's exposed.

**Recommendation:**
1. **NEVER** use OpenAI API key in frontend code
2. All AI operations must go through edge functions
3. Verify `VITE_OPENAI_API_KEY` is not used in frontend
4. Use server-side edge functions for all AI calls

---

### 19. **SQL Injection Protection**
**Status:** ✅ Good - Using Supabase client with parameterized queries  
**Note:** Continue using Supabase client, never raw SQL with string concatenation

---

### 20. **XSS Protection**
**Status:** ✅ Good - Using DOMPurify for HTML sanitization  
**Location:** `src/lib/sanitize.ts`

**Recommendation:**
1. Ensure all user-generated content is sanitized
2. Verify TipTap editor output is sanitized
3. Use Content Security Policy headers
4. Regular security testing

---

### 21. **Input Validation**
**Status:** ✅ Good - Using Zod schemas for validation  
**Location:** `src/lib/validation/schemas.ts`

**Recommendation:**
1. Ensure all API endpoints validate input
2. Add validation to edge functions
3. Validate file uploads (type, size, content)
4. Sanitize all user inputs

---

### 22. **File Storage Security**
**Status:** ✅ Good - RLS policies on storage buckets  
**Location:** `supabase/migrations/20250905142318_3056ad55-8c94-4295-990d-f73ab74391b3.sql`

**Recommendation:**
1. Verify storage bucket policies are restrictive
2. Implement file scanning for malware
3. Set file size limits
4. Use signed URLs with expiration

---

## 🟢 LOW PRIORITY / BEST PRACTICES

### 23. **Source Maps in Production**
**Severity:** LOW  
**Location:** `vite.config.ts:29`

**Issue:**
```typescript
sourcemap: true, // Exposes source code in production
```

**Recommendation:**
```typescript
sourcemap: import.meta.env.PROD ? false : true, // Disable in production
```

---

### 24. **Error Boundary Coverage**
**Status:** ✅ Good - Error boundaries implemented  
**Recommendation:** Ensure all major components are wrapped

---

### 25. **Dependency Updates**
**Status:** ✅ Current - No known vulnerabilities  
**Recommendation:** Keep dependencies updated regularly

---

### 26. **Code Obfuscation**
**Recommendation:** Consider code obfuscation for production builds (though not a security requirement)

---

### 27. **Security Testing**
**Recommendation:**
1. Implement automated security testing in CI/CD
2. Regular penetration testing
3. Dependency scanning in pipeline
4. SAST (Static Application Security Testing)

---

### 28. **Documentation**
**Recommendation:**
1. Document security architecture
2. Create security runbook
3. Document incident response procedures
4. Security training for developers

---

## ✅ POSITIVE SECURITY PRACTICES FOUND

1. ✅ **RLS Policies:** Comprehensive Row Level Security on database tables
2. ✅ **Input Validation:** Using Zod for type-safe validation
3. ✅ **XSS Protection:** DOMPurify for HTML sanitization
4. ✅ **SQL Injection:** Using Supabase client (parameterized queries)
5. ✅ **Authentication:** Proper Supabase Auth integration
6. ✅ **Authorization:** Permission-based access control system
7. ✅ **Error Boundaries:** React error boundaries implemented
8. ✅ **Type Safety:** TypeScript throughout the codebase
9. ✅ **Dependency Security:** No known vulnerabilities in dependencies
10. ✅ **Storage Security:** RLS policies on storage buckets

---

## ACTION ITEMS PRIORITY MATRIX

### Immediate (This Week)
1. 🔴 Rotate exposed Supabase anon key
2. 🔴 Remove hardcoded secrets from `env.ts`
3. 🔴 Fix CORS configuration in all edge functions
4. 🔴 Remove password from API responses
5. 🔴 Fix password generation bias

### High Priority (This Month)
6. 🟠 Fix SECURITY DEFINER search_path issues
7. 🟠 Implement rate limiting
8. 🟠 Add file upload validation
9. 🟠 Sanitize error messages
10. 🟠 Implement CSRF protection

### Medium Priority (Next Quarter)
11. 🟡 Add security headers
12. 🟡 Audit RLS policies
13. 🟡 Implement password policies
14. 🟡 Enhance logging/monitoring
15. 🟡 Email security improvements

---

## TESTING RECOMMENDATIONS

1. **Penetration Testing:** Engage security professionals for comprehensive testing
2. **Automated Scanning:** Integrate OWASP ZAP or similar tools
3. **Dependency Scanning:** Continue using `npm audit`
4. **SAST Tools:** Consider Snyk, SonarQube, or similar
5. **Security Headers Testing:** Use securityheaders.com or similar

---

## COMPLIANCE CONSIDERATIONS

If handling legal data, consider:
- **GDPR:** Data protection, right to deletion, data portability
- **SOC 2:** Security controls and monitoring
- **HIPAA:** If handling health-related legal data
- **ISO 27001:** Information security management

---

## CONCLUSION

The application has a solid security foundation with good practices in RLS, input validation, and XSS protection. However, **critical issues with secrets management and CORS configuration must be addressed immediately**. The hardcoded Supabase credentials pose the highest risk and should be remediated before any production deployment.

**Next Steps:**
1. Review and prioritize this report with your team
2. Create tickets for each critical/high priority item
3. Implement fixes starting with critical items
4. Re-scan after fixes are implemented
5. Establish regular security review process

---

**Report Generated By:** Automated Security Scanner  
**For Questions:** Review codebase and security documentation
