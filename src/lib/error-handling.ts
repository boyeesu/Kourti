/* eslint-disable @typescript-eslint/no-explicit-any */
import { logError } from '@/lib/logger';
import { PostgrestError } from '@supabase/supabase-js';

/**
 * Error codes used in the application
 */
export enum ErrorCode {
  // Auth errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  ACCOUNT_NOT_FOUND = 'ACCOUNT_NOT_FOUND',

  // API errors
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Data errors
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',

  // Application errors
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}

/**
 * Base application error type with consistent structure
 */
export class AppError extends Error {
  code: ErrorCode;
  details?: Record<string, any>;
  originalError?: Error | unknown;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNEXPECTED_ERROR,
    details?: Record<string, any>,
    originalError?: Error | unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.originalError = originalError;

    // Log all errors for debugging purposes
    logError(message, {
      code,
      details,
      originalError: originalError instanceof Error ? originalError.message : originalError,
    });
  }

  /**
   * Get user-friendly error message for display
   */
  getUserMessage(): string {
    // Default user message is the error message
    return this.message;
  }
}

/**
 * Error handler for Supabase PostgrestError
 */
export function handleSupabaseError(
  error: PostgrestError | Error | unknown,
  defaultMessage = 'An error occurred while communicating with the server'
): AppError {
  // Handle PostgrestError from Supabase
  if (isPostgrestError(error)) {
    return new AppError(
      error.message || defaultMessage,
      mapPostgrestCodeToErrorCode(error.code),
      { details: error.details, hint: error.hint },
      error
    );
  }

  // Handle regular Error objects
  if (error instanceof Error) {
    return new AppError(error.message || defaultMessage, ErrorCode.UNEXPECTED_ERROR, {}, error);
  }

  // Handle unknown error types
  return new AppError(defaultMessage, ErrorCode.UNEXPECTED_ERROR, { unknownError: error }, error);
}

/**
 * Type guard for PostgrestError
 */
function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'details' in error
  );
}

/**
 * Map PostgrestError codes to our application error codes
 */
function mapPostgrestCodeToErrorCode(pgErrorCode?: string): ErrorCode {
  if (!pgErrorCode) return ErrorCode.UNEXPECTED_ERROR;

  switch (pgErrorCode) {
    case '23505': // unique_violation
      return ErrorCode.CONFLICT;
    case '23503': // foreign_key_violation
      return ErrorCode.VALIDATION_ERROR;
    case '22P02': // invalid_text_representation
      return ErrorCode.VALIDATION_ERROR;
    case '42P01': // undefined_table
      return ErrorCode.NOT_FOUND;
    case '42501': // insufficient_privilege
    case '28000': // invalid_authorization_specification
      return ErrorCode.UNAUTHORIZED;
    default:
      return ErrorCode.API_ERROR;
  }
}

/**
 * Try to execute an async function and handle any errors
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => AppError
): Promise<[T | null, AppError | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const appError = errorMapper ? errorMapper(error) : handleSupabaseError(error);

    return [null, appError];
  }
}
