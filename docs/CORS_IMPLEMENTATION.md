# CORS Implementation Guide

This document describes how CORS (Cross-Origin Resource Sharing) is implemented in the Node backend.

## Overview

The Node backend uses the `cors` middleware (via the `cors` npm package) configured in `backend-node/src/app.ts`. CORS is configured to:

1. Allow legitimate requests from frontend applications
2. Block requests from unauthorized origins
3. Support credentials (cookies, auth headers) securely
4. Include security headers via Helmet

## Configuration

### Allowed Origins

CORS origins are configured via the `CORS_ORIGINS` environment variable (comma-separated) and the `APP_URL` variable:

```typescript
// backend-node/src/app.ts
const allowedOrigins = [env.APP_URL, ...env.CORS_ORIGINS.split(',')].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
```

### Security Headers

Helmet middleware automatically includes:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security` (HSTS, in production)
- Content Security Policy headers

## Best Practices

1. **Never Use Wildcard with Credentials**: The `cors` package handles this automatically
2. **Set CORS_ORIGINS in production**: Include your frontend domain(s)
3. **Include APP_URL**: Used as fallback origin for CORS and email links
4. **Test Both Preflight and Actual**: Test OPTIONS and POST/GET separately

## Troubleshooting

### Issue: CORS errors in production

**Cause**: `CORS_ORIGINS` or `APP_URL` not set correctly.

**Solution**:

```bash
CORS_ORIGINS="https://app.kourti.com"
APP_URL="https://app.kourti.com"
# Ensure https:// protocol included, no trailing slash
```

### Issue: Preflight OPTIONS returns 404

**Cause**: Middleware not applied before route handlers.

**Solution**: Ensure `app.use(cors(...))` is called before route registration in `app.ts`.

## References

- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Express CORS Middleware](https://expressjs.com/en/resources/middleware/cors.html)
- [OWASP CORS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
