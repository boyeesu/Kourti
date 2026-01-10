// File validation utilities for uploads

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB default
export const MAX_CONTRACT_FILE_SIZE = 25 * 1024 * 1024; // 25MB for contracts
export const MAX_CHAT_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB for chat

// Allowed MIME types for chat attachments
export const ALLOWED_CHAT_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
] as const;

// File extensions for display
export const ALLOWED_CHAT_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'
];

interface ValidationOptions {
  maxSize?: number;
  allowedTypes?: readonly string[];
}

interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a file for upload
 */
export function validateFile(
  file: File,
  options: ValidationOptions = {}
): ValidationResult {
  const {
    maxSize = MAX_FILE_SIZE,
    allowedTypes = ALLOWED_CHAT_MIME_TYPES,
  } = options;

  // Check file size
  if (file.size > maxSize) {
    const sizeMB = (maxSize / 1024 / 1024).toFixed(0);
    return {
      valid: false,
      error: `File size exceeds ${sizeMB}MB limit. Your file is ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
    };
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type || 'unknown'}" is not allowed. Allowed types: ${ALLOWED_CHAT_EXTENSIONS.join(', ')}`,
    };
  }

  // Check for empty files
  if (file.size === 0) {
    return {
      valid: false,
      error: 'File is empty.',
    };
  }

  return { valid: true };
}

/**
 * Get human-readable file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file icon type based on MIME type
 */
export function getFileIconType(mimeType: string): 'image' | 'pdf' | 'doc' | 'spreadsheet' | 'text' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv') return 'spreadsheet';
  if (mimeType.startsWith('text/')) return 'text';
  return 'file';
}

/**
 * Check if file is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
