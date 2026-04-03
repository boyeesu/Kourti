import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { ApiError, getErrorMessage } from '../lib/http.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    errorCode: 'NOT_FOUND',
    requestId: req.requestId,
  });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      errorCode: 'VALIDATION_ERROR',
      details: error.issues,
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({
      success: false,
      error: error.message,
      errorCode: error.code,
      requestId: req.requestId,
    });
    return;
  }

  console.error('Unhandled backend error', {
    requestId: req.requestId,
    path: req.path,
    message: getErrorMessage(error),
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    errorCode: 'INTERNAL_ERROR',
    requestId: req.requestId,
  });
}
