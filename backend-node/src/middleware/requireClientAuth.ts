import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/http.js';
import { verifyClientAccessToken } from '../services/clientPortalAuth.js';

/**
 * Authenticates a client-portal request. Unlike the staff `requireAuth`,
 * there is NO dev-header escape hatch — a real client access token is always
 * required. Sets `req.clientAuth = { clientUserId, email }`.
 */
export async function requireClientAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorizationHeader = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization || null;

    if (!authorizationHeader) {
      throw new ApiError('Authentication required', 401, 'CLIENT_AUTH_UNAUTHORIZED');
    }

    // Strict Bearer scheme check so a non-Bearer credential can't be
    // reflected through verifyClientAccessToken.
    const bearerMatch = authorizationHeader.match(/^Bearer\s+(\S+)$/);
    if (!bearerMatch) {
      throw new ApiError('Invalid authentication scheme', 401, 'CLIENT_AUTH_UNAUTHORIZED');
    }

    const { clientUserId, email } = verifyClientAccessToken(bearerMatch[1]);
    req.clientAuth = { clientUserId, email };
    next();
  } catch (error) {
    next(error);
  }
}
