import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '../lib/http.js';
import { authenticateRequest } from '../services/auth.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.auth = await authenticateRequest(req.headers);

    // Read-only "View as" sessions may only issue safe requests. Blocking
    // mutations here — at the single choke point every authed router shares —
    // means an admin observing a user's experience can never accidentally
    // (or maliciously) change that user's data.
    if (req.auth.impersonation?.scope === 'read' && !SAFE_METHODS.has(req.method.toUpperCase())) {
      throw new ApiError(
        'This is a read-only impersonation session.',
        403,
        'IMPERSONATION_READ_ONLY'
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
