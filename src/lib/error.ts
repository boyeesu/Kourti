/**
 * Custom error class for API errors
 */
export class APIError extends Error {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number, code?: string) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Custom error class for validation errors
 */
export class ValidationError extends Error {
  errors: Record<string, string[]>;

  constructor(message: string, errors: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Common error messages used throughout the application
 */
export const ERROR_MESSAGES = {
  fetch: 'Failed to load data. Please try again.',
  create: 'Failed to create item. Please try again.',
  update: 'Failed to update item. Please try again.',
  delete: 'Failed to delete item. Please try again.',
  notFound: 'The requested resource was not found.',
  unauthorized: 'You do not have permission to perform this action.',
  unauthenticated: 'Please log in to continue.',
  server: 'A server error occurred. Please try again later.',
  network: 'Network error. Please check your connection and try again.',
  validation: 'Please check your input and try again.',
  unknown: 'An unexpected error occurred. Please try again.',
  timeout: 'The request timed out. Please try again.',
  rateLimited: 'Too many requests. Please try again later.',
  maintenance: 'The system is under maintenance. Please try again later.',
  badRequest: 'Invalid request. Please check your input.',
};

/**
 * Helper function to parse an error and return a user-friendly message
 */
export function parseError(error: unknown): string {
  if (error instanceof APIError) {
    return error.message;
  }

  if (error instanceof ValidationError) {
    // Return the first validation error message
    const firstField = Object.keys(error.errors)[0];
    return error.errors[firstField]?.[0] || error.message;
  }

  if (error instanceof Error) {
    // Handle network errors
    if (error.name === 'NetworkError' || error.message.includes('network')) {
      return ERROR_MESSAGES.network;
    }

    // Handle timeout errors
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return ERROR_MESSAGES.timeout;
    }

    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return ERROR_MESSAGES.unknown;
}

/**
 * Helper function to determine if an error is a specific type
 */
export function isErrorType(
  error: unknown,
  type: 'api' | 'validation' | 'network' | 'timeout'
): boolean {
  switch (type) {
    case 'api':
      return error instanceof APIError;
    case 'validation':
      return error instanceof ValidationError;
    case 'network':
      return (
        error instanceof Error &&
        (error.name === 'NetworkError' || error.message.includes('network'))
      );
    case 'timeout':
      return (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.message.includes('timeout'))
      );
    default:
      return false;
  }
}

/**
 * Helper function to check if a response has an error
 */
export function hasErrorResponse(
  response: { error?: unknown; statusCode?: number; errors?: unknown } | null | undefined
): boolean {
  return (
    response?.error !== undefined ||
    (response?.statusCode !== undefined && response.statusCode >= 400) ||
    (typeof response === 'object' && response !== null && 'errors' in response)
  );
}

/**
 * Remove sensitive information from error logs
 */
export function sanitizeErrorForLogging(error: unknown): Record<string, unknown> | unknown {
  if (!error) return error;

  // Create a copy to avoid mutating the original error
  const sanitized: Record<string, unknown> = { ...(error as Record<string, unknown>) };

  // Remove sensitive fields
  const sensitiveFields = [
    'password',
    'token',
    'authorization',
    'auth',
    'key',
    'secret',
    'apiKey',
    'accessToken',
    'refreshToken',
    'sessionToken',
    'jwt',
    'bearer',
    'cookie',
    'credentials',
  ];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }

    // Check headers
    const headers = sanitized.headers as Record<string, unknown> | undefined;
    if (headers && typeof headers === 'object') {
      for (const headerKey in headers) {
        if (headerKey.toLowerCase().includes(field)) {
          headers[headerKey] = '[REDACTED]';
        }
      }
    }

    // Check request/config object (for axios errors)
    const config = sanitized.config as Record<string, unknown> | undefined;
    if (config) {
      const configHeaders = config.headers as Record<string, unknown> | undefined;
      if (configHeaders) {
        for (const headerKey in configHeaders) {
          if (headerKey.toLowerCase().includes(field)) {
            configHeaders[headerKey] = '[REDACTED]';
          }
        }
      }
      if (config.auth) {
        config.auth = '[REDACTED]';
      }
    }
  }

  // Sanitize query parameters
  if (sanitized.url && typeof sanitized.url === 'string') {
    try {
      const url = new URL(sanitized.url);
      sensitiveFields.forEach((field) => {
        if (url.searchParams.has(field)) {
          url.searchParams.set(field, '[REDACTED]');
        }
      });
      sanitized.url = url.toString();
    } catch {
      // Invalid URL, just continue
    }
  }

  // Sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeErrorForLogging(sanitized[key]);
    }
  }

  // If it's an Error object, preserve the message (and stack in dev only)
  if (error instanceof Error) {
    sanitized.message = error.message;
    sanitized.name = error.name;
    // Only include stack traces in development to avoid leaking internal paths
    if (import.meta.env.DEV) {
      sanitized.stack = error.stack;
    }
  }

  return sanitized;
}

/**
 * Format error for display to users
 */
export function formatErrorMessage(error: unknown): string {
  // First try to parse the error
  const message = parseError(error);

  // If we have a specific message, return it
  if (message !== ERROR_MESSAGES.unknown) {
    return message;
  }

  // Otherwise, try to format the error in a user-friendly way
  if (error instanceof Error) {
    // Remove any technical details from the message
    let userMessage = error.message
      .replace(/^Error:\s/, '')
      .replace(/\s\(.+\)$/, '')
      .replace(/[a-f0-9]{24}/g, 'ID') // Remove MongoDB IDs
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, 'timestamp'); // Remove timestamps

    // Capitalize first letter
    userMessage = userMessage.charAt(0).toUpperCase() + userMessage.slice(1);

    // Add a period if needed
    if (!/[.!?]$/.test(userMessage)) {
      userMessage += '.';
    }

    return userMessage;
  }

  return ERROR_MESSAGES.unknown;
}
