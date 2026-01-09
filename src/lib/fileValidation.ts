/**
 * File validation utilities for secure file uploads
 * Enforces strict type and size validation to prevent security issues
 */

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// Allowed MIME types for document uploads
export const ALLOWED_DOCUMENT_TYPES = [
  // PDF documents
  'application/pdf',
  // Microsoft Word
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  // Plain text
  'text/plain',
  // Rich text
  'application/rtf',
  // OpenDocument
  'application/vnd.oasis.opendocument.text', // .odt
] as const;

// Allowed file extensions (for additional validation)
export const ALLOWED_DOCUMENT_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.rtf',
  '.odt',
] as const;

// Maximum file size: 10MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

// Maximum file size for contracts (may be larger)
export const MAX_CONTRACT_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

/**
 * Validates a file's type against allowed MIME types
 */
export function validateFileType(file: File, allowedTypes: readonly string[] = ALLOWED_DOCUMENT_TYPES): FileValidationResult {
  if (!file.type) {
    // Some browsers may not provide MIME type, check extension as fallback
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension as any)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${ALLOWED_DOCUMENT_EXTENSIONS.join(', ')}`,
      };
    }
    // If extension is valid but no MIME type, allow it but warn
    return { valid: true };
  }

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type}" not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates a file's size against maximum allowed size
 */
export function validateFileSize(file: File, maxSize: number = MAX_FILE_SIZE): FileValidationResult {
  if (file.size > maxSize) {
    const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeMB}MB`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty',
    };
  }

  return { valid: true };
}

/**
 * Validates file extension (additional security layer)
 */
export function validateFileExtension(file: File, allowedExtensions: readonly string[] = ALLOWED_DOCUMENT_EXTENSIONS): FileValidationResult {
  const fileName = file.name.toLowerCase();
  const extension = '.' + fileName.split('.').pop();

  if (!allowedExtensions.includes(extension as any)) {
    return {
      valid: false,
      error: `File extension "${extension}" not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Validates file name for security (prevents path traversal, etc.)
 */
export function validateFileName(fileName: string): FileValidationResult {
  // Check for path traversal attempts
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid file name: path traversal characters not allowed',
    };
  }

  // Check for null bytes
  if (fileName.includes('\0')) {
    return {
      valid: false,
      error: 'Invalid file name: null bytes not allowed',
    };
  }

  // Check length
  if (fileName.length > 255) {
    return {
      valid: false,
      error: 'File name too long (maximum 255 characters)',
    };
  }

  return { valid: true };
}

/**
 * Comprehensive file validation
 * Validates type, size, extension, and name
 */
export function validateFile(
  file: File,
  options: {
    allowedTypes?: readonly string[];
    maxSize?: number;
    allowedExtensions?: readonly string[];
    validateName?: boolean;
  } = {}
): FileValidationResult {
  const {
    allowedTypes = ALLOWED_DOCUMENT_TYPES,
    maxSize = MAX_FILE_SIZE,
    allowedExtensions = ALLOWED_DOCUMENT_EXTENSIONS,
    validateName = true,
  } = options;

  // Validate file name
  if (validateName) {
    const nameResult = validateFileName(file.name);
    if (!nameResult.valid) {
      return nameResult;
    }
  }

  // Validate file extension
  const extensionResult = validateFileExtension(file, allowedExtensions);
  if (!extensionResult.valid) {
    return extensionResult;
  }

  // Validate file type
  const typeResult = validateFileType(file, allowedTypes);
  if (!typeResult.valid) {
    return typeResult;
  }

  // Validate file size
  const sizeResult = validateFileSize(file, maxSize);
  if (!sizeResult.valid) {
    return sizeResult;
  }

  return { valid: true };
}

/**
 * Validates multiple files
 */
export function validateFiles(
  files: File[],
  options?: Parameters<typeof validateFile>[1]
): FileValidationResult {
  for (const file of files) {
    const result = validateFile(file, options);
    if (!result.valid) {
      return result;
    }
  }

  return { valid: true };
}
