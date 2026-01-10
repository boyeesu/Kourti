/**
 * Rate limiting utility for Supabase Edge Functions
 * Uses in-memory storage (for single-instance) or can be extended to use Redis
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number; // Time window in milliseconds
  identifier: string; // User ID, IP, or function name
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

// In-memory store (for single-instance deployments)
// For production with multiple instances, use Redis or Supabase KV
const rateLimitStore: RateLimitStore = {};

/**
 * Check if request should be rate limited
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(config: RateLimitConfig): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
} {
  const { maxRequests, windowMs, identifier } = config;
  const key = `rate_limit:${identifier}`;
  const now = Date.now();

  // Clean up expired entries periodically (every 1000 checks)
  if (Math.random() < 0.001) {
    Object.keys(rateLimitStore).forEach((k) => {
      if (rateLimitStore[k].resetAt < now) {
        delete rateLimitStore[k];
      }
    });
  }

  const entry = rateLimitStore[key];

  // No entry or expired
  if (!entry || entry.resetAt < now) {
    rateLimitStore[key] = {
      count: 1,
      resetAt: now + windowMs,
    };
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  // Entry exists and is valid
  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter,
    };
  }

  // Increment count
  entry.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get rate limit identifier from request
 * Prioritizes user ID, falls back to IP address
 */
export function getRateLimitIdentifier(req: Request, userId?: string): string {
  if (userId) {
    return userId;
  }

  // Try to get IP from various headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback to a generic identifier
  return 'unknown';
}

/**
 * Rate limit configuration presets
 */
export const RATE_LIMIT_PRESETS = {
  // Strict limits for authentication/user creation
  AUTH: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  // Moderate limits for email sending
  EMAIL: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
  },
  // Generous limits for AI operations (but still limited)
  AI: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
  },
  // Standard API limits
  API: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },
  // Very strict for sensitive operations
  SENSITIVE: {
    maxRequests: 3,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;

/**
 * Create rate limit headers for response
 */
export function createRateLimitHeaders(result: {
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
  };

  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}
