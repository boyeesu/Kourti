import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind CSS optimizations
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date consistently across the application
 */
export function formatDate(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return 'N/A';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options
  };
  
  return new Date(date).toLocaleDateString(undefined, defaultOptions);
}

/**
 * Format currency values consistently
 */
export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount === null || amount === undefined) return 'N/A';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/**
 * Get status color for badges
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return 'bg-muted text-muted-foreground';
  
  switch (status.toLowerCase()) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'approved':
      return 'bg-success text-success-foreground';
    case 'pending':
    case 'in_progress':
    case 'review':
    case 'draft':
      return 'bg-warning text-warning-foreground';
    case 'inactive':
    case 'closed':
    case 'expired':
    case 'rejected':
    case 'overdue':
      return 'bg-destructive text-destructive-foreground';
    case 'open':
    case 'signed':
      return 'bg-primary text-primary-foreground';
    default:
      return 'bg-secondary text-secondary-foreground';
  }
}

/**
 * Remove sensitive information from error logs
 */
export function sanitizeErrorForLogging(error: any): any {
  if (!error) return error;
  
  // Create a copy to avoid mutating the original error
  const sanitized = { ...error };
  
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
    'sessionToken'
  ];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
    
    // Also check headers if they exist
    if (sanitized.headers && typeof sanitized.headers === 'object') {
      for (const headerKey in sanitized.headers) {
        if (headerKey.toLowerCase().includes(field)) {
          sanitized.headers[headerKey] = '[REDACTED]';
        }
      }
    }
  }
  
  // Sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeErrorForLogging(sanitized[key]);
    }
  }
  
  // If it's an Error object, preserve the message and stack
  if (error instanceof Error) {
    sanitized.message = error.message;
    sanitized.stack = error.stack;
    sanitized.name = error.name;
  }
  
  return sanitized;
}

/**
 * Format file size in human readable format
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'Unknown';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Get file icon based on file type
 */
export function getFileTypeIcon(fileType: string | null | undefined): string {
  if (!fileType) return 'file';
  
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'file-text';
    case 'doc':
    case 'docx':
      return 'file-text';
    case 'xls':
    case 'xlsx':
      return 'file-spreadsheet';
    case 'ppt':
    case 'pptx':
      return 'file-presentation';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
      return 'file-image';
    default:
      return 'file';
  }
}

/**
 * Generate initials from a name
 */
export function getInitials(name: string): string {
  if (!name) return '';
  
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Delay for a specified time (in ms)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function call
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}

/**
 * Generate a UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
