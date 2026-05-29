import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/http.js';
import { hasFeature, type FeatureKey } from '../services/entitlements.js';

/**
 * Gate a router/route on a plan feature. Returns 403 FEATURE_NOT_IN_PLAN when
 * the requesting org's plan doesn't include `feature`. Runs after requireAuth
 * (and typically requireActiveSubscription), so `req.auth` is present.
 *
 * This is the hard enforcement layer; the frontend independently hides/locks
 * the same features for UX, but the API is the authority.
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const auth = req.auth;
      if (!auth) throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED');

      if (await hasFeature(auth.organizationId, feature, auth.userId)) {
        return next();
      }
      throw new ApiError(
        'This feature is not included in your plan. Upgrade to unlock it.',
        403,
        'FEATURE_NOT_IN_PLAN'
      );
    } catch (err) {
      next(err);
    }
  };
}
