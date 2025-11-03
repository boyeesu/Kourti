import { createJsonResponse, createCorsSecurityHeaders, CorsSecurityHeadersOptions } from './responseHeaders.ts';

export type ErrorDetails = Record<string, unknown> | undefined;

export class HttpError extends Error {
  status: number;
  code: string;
  details?: ErrorDetails;

  constructor(message: string, status = 500, code = 'INTERNAL_ERROR', details?: ErrorDetails) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createErrorResponse(
  error: unknown,
  corsOptions: CorsSecurityHeadersOptions = {},
  fallbackMessage = 'Internal Server Error',
) {
  if (error instanceof HttpError) {
    const payload: Record<string, unknown> = {
      success: false,
      error: error.message || fallbackMessage,
      errorCode: error.code,
    };

    if (error.details && Object.keys(error.details).length > 0) {
      payload.details = error.details;
    }

    return createJsonResponse(payload, {
      status: error.status,
      cors: corsOptions,
    });
  }

  const message = error instanceof Error ? error.message : fallbackMessage;

  return createJsonResponse(
    {
      success: false,
      error: message || fallbackMessage,
      errorCode: 'INTERNAL_ERROR',
    },
    {
      status: 500,
      cors: corsOptions,
    },
  );
}

export function createCorsHeaders(options: CorsSecurityHeadersOptions = {}): Record<string, string> {
  return createCorsSecurityHeaders(options);
}
