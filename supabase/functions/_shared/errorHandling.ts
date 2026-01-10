/**
 * Error handling and sanitization utilities
 * Prevents sensitive information leakage in error responses
 */

import { createJsonResponse, CorsSecurityHeadersOptions } from './responseHeaders.ts';

export interface SanitizedError {
  success: false;
  error: string;
  errorCode: string;
  requestId?: string;
}

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

/**
 * Sanitize error message - remove sensitive information
 */
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Remove potential sensitive patterns
    const sensitivePatterns = [
      /password/gi,
      /secret/gi,
      /key/gi,
      /token/gi,
      /api[_-]?key/gi,
      /connection[_-]?string/gi,
      /database[_-]?url/gi,
      /file[_-]?path/gi,
      /\/[a-z0-9\-_]+\.(env|key|pem|p12)/gi,
      /[0-9a-f]{32,}/gi, // Long hex strings (could be tokens)
    ];

    let sanitized = message;
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Remove stack traces and file paths
    sanitized = sanitized.split('\n')[0]; // Only first line
    sanitized = sanitized.replace(/at\s+.*/g, ''); // Remove stack trace lines
    sanitized = sanitized.replace(/\/[^\s]+/g, '[PATH]'); // Remove file paths

    return sanitized.trim() || 'An error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An error occurred';
}

/**
 * Determine error code from error
 */
function getErrorCode(error: unknown, defaultCode: ErrorCode = ErrorCode.INTERNAL_ERROR): ErrorCode {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('unauthorized') || message.includes('invalid token') || message.includes('expired')) {
      return ErrorCode.UNAUTHORIZED;
    }
    if (message.includes('forbidden') || message.includes('permission denied')) {
      return ErrorCode.FORBIDDEN;
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return ErrorCode.NOT_FOUND;
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return ErrorCode.VALIDATION_ERROR;
    }
    if (message.includes('rate limit')) {
      return ErrorCode.RATE_LIMIT_EXCEEDED;
    }
    if (message.includes('bad request') || message.includes('malformed')) {
      return ErrorCode.BAD_REQUEST;
    }
    if (message.includes('config') || message.includes('environment')) {
      return ErrorCode.CONFIG_ERROR;
    }
  }

  return defaultCode;
}

/**
 * Get HTTP status code from error code
 */
function getStatusCode(errorCode: ErrorCode): number {
  switch (errorCode) {
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.BAD_REQUEST:
      return 400;
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429;
    case ErrorCode.CONFIG_ERROR:
      return 503;
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}

/**
 * Generate a request ID for tracking
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Log detailed error server-side only
 */
export function logError(error: unknown, context?: Record<string, unknown>): string {
  const requestId = generateRequestId();

  // Log detailed error with context (server-side only)
  console.error('Error details (server-side only):', {
    requestId,
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
    } : error,
    context,
    timestamp: new Date().toISOString(),
  });

  return requestId;
}

/**
 * Create sanitized error response
 */
export function createErrorResponse(
  error: unknown,
  corsOptions: CorsSecurityHeadersOptions,
  context?: Record<string, unknown>
): Response {
  const requestId = logError(error, context);
  const errorCode = getErrorCode(error);
  const statusCode = getStatusCode(errorCode);
  const sanitizedMessage = sanitizeErrorMessage(error);

  // Generic user-friendly messages
  const userMessages: Record<ErrorCode, string> = {
    [ErrorCode.INTERNAL_ERROR]: 'An error occurred. Please try again.',
    [ErrorCode.UNAUTHORIZED]: 'Authentication required. Please log in.',
    [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
    [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorCode.VALIDATION_ERROR]: 'Invalid input. Please check your request.',
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
    [ErrorCode.BAD_REQUEST]: 'Invalid request. Please check your input.',
    [ErrorCode.CONFIG_ERROR]: 'Service temporarily unavailable. Please try again later.',
  };

  const response: SanitizedError = {
    success: false,
    error: userMessages[errorCode],
    errorCode,
    requestId, // Include request ID for support tracking
  };

  return createJsonResponse(response, {
    status: statusCode,
    cors: corsOptions,
  });
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
  corsOptions: CorsSecurityHeadersOptions
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      return createErrorResponse(error, corsOptions);
    }
  };
}
