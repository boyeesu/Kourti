/**
 * Re-export ErrorCode from error-handling for centralized access
 */
export { ErrorCode } from '@/lib/error-handling';

/**
 * User-friendly error messages mapped to error codes
 * These should be used for displaying errors to end users
 */
export const ERROR_MESSAGES = {
  // Auth errors
  UNAUTHORIZED: 'You are not authorized to perform this action. Please log in.',
  INVALID_CREDENTIALS: 'Invalid email or password. Please try again.',
  ACCOUNT_NOT_FOUND: 'Account not found. Please check your credentials.',

  // API errors
  API_ERROR: 'An error occurred while processing your request. Please try again.',
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  TIMEOUT: 'The request took too long to complete. Please try again.',

  // Data errors
  NOT_FOUND: 'The requested resource was not found.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  CONFLICT: 'This operation conflicts with existing data.',

  // Application errors
  UNEXPECTED_ERROR: 'An unexpected error occurred. Our team has been notified.',
} as const;

/**
 * Rate limit error
 */
export const RATE_LIMIT_ERROR = {
  CODE: 'RATE_LIMIT',
  MESSAGE: 'Too many requests. Please try again later.',
} as const;

/**
 * Get user-friendly error message for an error code
 */
export function getUserErrorMessage(code: string): string {
  return ERROR_MESSAGES[code as keyof typeof ERROR_MESSAGES] || ERROR_MESSAGES.UNEXPECTED_ERROR;
}
