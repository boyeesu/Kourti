# CSRF Protection Integration Guide

## Overview

The CSRF protection helper is ready in `supabase/functions/_shared/csrfProtection.ts`. This guide explains the integration decisions you need to make.

---

## Integration Decision Points

### 1. **Scope of Protection**

#### Option A: Full CSRF Protection (All Mutations)
**Protection:** All POST/PUT/DELETE requests require CSRF tokens
**Pros:**
- Maximum security
- Consistent protection across all endpoints
- Prevents all CSRF attacks

**Cons:**
- Requires frontend changes for all API calls
- More complex implementation
- May impact user experience

**Best For:** High-security applications, financial systems, admin operations

#### Option B: Selective CSRF Protection (Sensitive Operations Only) ⭐ RECOMMENDED
**Protection:** Only sensitive operations require CSRF tokens
**Pros:**
- Easier to implement
- Less frontend changes needed
- Focuses protection where it matters most

**Cons:**
- Need to identify sensitive operations
- Some endpoints remain unprotected

**Best For:** Most applications, balanced security/UX

#### Option C: No CSRF Protection (Rely on CORS + SameSite Cookies)
**Protection:** None (current state)
**Pros:**
- No implementation needed
- Simpler architecture

**Cons:**
- Vulnerable to CSRF if CORS is misconfigured
- Not following security best practices

**Best For:** Internal-only APIs, read-only applications

---

### 2. **Token Storage Strategy**

#### Option A: Session-Based Tokens (Recommended)
**How it works:**
- Generate token on login/session creation
- Store in Supabase session or database
- Validate on each request

**Implementation:**
```typescript
// On login/session creation
const csrfToken = generateCsrfToken();
await supabase.from('user_sessions').insert({
  user_id: userId,
  csrf_token: csrfToken,
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
});

// On request validation
const session = await getSession(userId);
if (session.csrf_token !== requestToken) {
  throw new HttpError('Invalid CSRF token', 403, 'CSRF_ERROR');
}
```

**Pros:**
- Secure (tokens stored server-side)
- Can revoke tokens
- Works with stateless auth

**Cons:**
- Requires database storage
- Need session management

#### Option B: Signed Tokens (Stateless)
**How it works:**
- Generate signed token with user ID + secret
- Include in response, validate on request

**Implementation:**
```typescript
// Generate signed token
function generateSignedCsrfToken(userId: string): string {
  const payload = { userId, timestamp: Date.now() };
  const signature = await signPayload(payload, CSRF_SECRET);
  return `${base64Encode(payload)}.${signature}`;
}

// Validate
async function validateSignedToken(token: string, userId: string): Promise<boolean> {
  const [payloadPart, signature] = token.split('.');
  const payload = JSON.parse(base64Decode(payloadPart));
  return payload.userId === userId && await verifySignature(payload, signature);
}
```

**Pros:**
- No database storage needed
- Stateless
- Can include expiration

**Cons:**
- More complex implementation
- Need to handle token rotation

#### Option C: Double Submit Cookie Pattern
**How it works:**
- Set CSRF token in cookie (SameSite=Strict)
- Require same token in header/body
- Validate they match

**Implementation:**
```typescript
// Set cookie on login
response.headers.set('Set-Cookie', `csrf_token=${token}; SameSite=Strict; HttpOnly=false; Secure`);

// Validate
const cookieToken = req.headers.get('Cookie')?.match(/csrf_token=([^;]+)/)?.[1];
const headerToken = req.headers.get('X-CSRF-Token');
if (cookieToken !== headerToken) {
  throw new HttpError('CSRF token mismatch', 403, 'CSRF_ERROR');
}
```

**Pros:**
- Simple implementation
- No database needed
- Works with existing auth

**Cons:**
- Requires cookie support
- Vulnerable if XSS exists

---

### 3. **Token Generation & Rotation**

#### Option A: Per-Session Token (Recommended)
- Generate one token per session
- Token valid for session lifetime
- Rotate on logout/password change

#### Option B: Per-Request Token
- Generate new token for each request
- More secure but complex
- Requires token refresh mechanism

#### Option C: Time-Based Rotation
- Token valid for X hours
- Auto-rotate after expiration
- Balance between security and UX

---

### 4. **Frontend Integration**

#### Option A: Automatic Token Injection
**How:**
- Store token in memory/localStorage
- Automatically add to all requests
- Refresh token as needed

**Implementation:**
```typescript
// Frontend: Auto-inject CSRF token
const csrfToken = await getCsrfToken(); // From login response
fetch('/api/endpoint', {
  headers: {
    'X-CSRF-Token': csrfToken
  }
});
```

#### Option B: Manual Token Management
**How:**
- Developer manually adds token to sensitive requests
- More control, more work

---

## Recommended Implementation Plan

### Phase 1: Sensitive Operations Only (Recommended Start)

**Protected Operations:**
1. User creation (`create-invited-user`)
2. Password changes (`send-password-reset-email`)
3. Organization modifications
4. Admin operations
5. Payment/billing operations

**Implementation Steps:**

1. **Add CSRF token generation to login/auth:**
```typescript
// In your auth/login edge function
import { generateCsrfToken } from "../_shared/csrfProtection.ts";

const csrfToken = generateCsrfToken();
// Store in session or return to client
return createJsonResponse({
  user,
  csrfToken, // Include in response
});
```

2. **Update protected edge functions:**
```typescript
// In create-invited-user/index.ts
import { requireCsrfToken } from "../_shared/csrfProtection.ts";

// After authentication, before processing
const csrfToken = req.headers.get('X-CSRF-Token');
await requireCsrfToken(req, expectedToken); // Get from session
```

3. **Frontend integration:**
```typescript
// Store token after login
const { csrfToken } = await login(email, password);
localStorage.setItem('csrf_token', csrfToken);

// Include in sensitive requests
fetch('/functions/v1/create-invited-user', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-CSRF-Token': localStorage.getItem('csrf_token')
  }
});
```

### Phase 2: Expand to All Mutations (Optional)

After Phase 1 is stable, expand to all POST/PUT/DELETE operations.

---

## Integration Checklist

### Backend (Edge Functions)
- [ ] Decide on protection scope (sensitive ops vs all mutations)
- [ ] Choose token storage strategy (session vs signed vs cookie)
- [ ] Implement token generation in auth/login
- [ ] Add CSRF validation to protected functions
- [ ] Add token refresh mechanism
- [ ] Test token validation

### Frontend
- [ ] Store CSRF token after login
- [ ] Add token to request headers for protected operations
- [ ] Handle token refresh/rotation
- [ ] Handle CSRF errors gracefully
- [ ] Update all API calls to include token

### Database (if using session storage)
- [ ] Create `user_sessions` table (if needed)
- [ ] Add indexes for performance
- [ ] Add cleanup job for expired tokens

---

## Example: Full Implementation

### 1. Create Session Storage Table (if using Option A)
```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_id, csrf_token)
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### 2. Update Auth/Login Function
```typescript
import { generateCsrfToken } from "../_shared/csrfProtection.ts";

// After successful login
const csrfToken = generateCsrfToken();
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

await supabase.from('user_sessions').insert({
  user_id: user.id,
  csrf_token: csrfToken,
  expires_at: expiresAt.toISOString(),
});

return createJsonResponse({
  user,
  session: { access_token, refresh_token },
  csrfToken, // Return to client
});
```

### 3. Update Protected Function
```typescript
import { requireCsrfToken } from "../_shared/csrfProtection.ts";
import { getCsrfTokenFromRequest } from "../_shared/csrfProtection.ts";

// After authentication
const requestToken = getCsrfTokenFromRequest(req);

// Get expected token from session
const { data: session } = await supabase
  .from('user_sessions')
  .select('csrf_token, expires_at')
  .eq('user_id', userId)
  .eq('csrf_token', requestToken)
  .gt('expires_at', new Date().toISOString())
  .single();

if (!session) {
  throw new HttpError('Invalid or expired CSRF token', 403, 'CSRF_ERROR');
}

// Continue with operation...
```

### 4. Frontend Integration
```typescript
// After login
const response = await login(email, password);
const { csrfToken } = response;
sessionStorage.setItem('csrf_token', csrfToken);

// In API client
const apiCall = async (endpoint: string, options: RequestInit) => {
  const csrfToken = sessionStorage.getItem('csrf_token');
  
  return fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken || '',
    },
  });
};
```

---

## Security Considerations

1. **Token Length:** Use at least 32 bytes (current implementation uses 32)
2. **Token Expiration:** 24 hours is reasonable, adjust based on security needs
3. **Token Rotation:** Rotate on password change, logout, suspicious activity
4. **HTTPS Only:** Always use HTTPS in production
5. **SameSite Cookies:** If using cookies, set `SameSite=Strict`
6. **Token Storage:** Never log tokens, never expose in URLs

---

## Testing Checklist

- [ ] CSRF token required for protected operations
- [ ] Invalid token rejected
- [ ] Missing token rejected
- [ ] Expired token rejected
- [ ] Token rotation works
- [ ] Frontend correctly includes token
- [ ] Error messages don't leak information

---

## Decision Summary

**My Recommendation:**
- **Scope:** Option B (Sensitive Operations Only)
- **Storage:** Option A (Session-Based Tokens)
- **Rotation:** Option A (Per-Session Token)
- **Frontend:** Option A (Automatic Token Injection)

**Start with:**
1. Protect `create-invited-user` and `send-password-reset-email`
2. Use session-based token storage
3. Generate token on login, validate on protected operations
4. Expand to other sensitive operations after testing

---

## Questions to Answer

1. **Which operations need CSRF protection?**
   - [ ] All mutations (POST/PUT/DELETE)
   - [ ] Only sensitive operations (recommended)
   - [ ] None (rely on CORS)

2. **How to store tokens?**
   - [ ] Database session table
   - [ ] Signed tokens (stateless)
   - [ ] Cookie-based

3. **Token lifetime?**
   - [ ] Per session (until logout)
   - [ ] Time-based (X hours)
   - [ ] Per request

4. **Frontend integration approach?**
   - [ ] Automatic injection
   - [ ] Manual management

Answer these questions, and I can provide the exact implementation code for your chosen approach.
