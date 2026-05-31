import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/http.js';
import { checkRateLimit } from '../lib/rateLimit.js';

/**
 * Per-admin rate limit for sensitive platform-admin endpoints (impersonation,
 * bulk mutations, billing overrides). Keyed by the acting admin's user id so one
 * compromised/runaway admin session can't hammer destructive actions, while
 * other admins are unaffected. Runs after requireAuth.
 */
export function adminRateLimit(name: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const who = req.auth?.userId ?? req.ip ?? 'unknown';
    const result = checkRateLimit(`admin:${name}:${who}`, maxRequests, windowMs);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return next(
        new ApiError(
          'Too many requests on this admin action. Slow down.',
          429,
          'ADMIN_RATE_LIMITED'
        )
      );
    }
    next();
  };
}
