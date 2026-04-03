import type { NextFunction, Request, Response } from 'express';

import { authenticateRequest } from '../services/auth.js';

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.auth = await authenticateRequest(req.headers);
    next();
  } catch (error) {
    next(error);
  }
}
