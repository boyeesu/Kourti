import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function withRequestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
