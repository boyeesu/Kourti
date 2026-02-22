/**
 * Case status values
 */
export const CASE_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  PENDING: 'pending',
} as const;

export type CaseStatus = (typeof CASE_STATUS)[keyof typeof CASE_STATUS];

/**
 * Case priority values
 */
export const CASE_PRIORITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export type CasePriority = (typeof CASE_PRIORITY)[keyof typeof CASE_PRIORITY];

/**
 * Client status values
 */
export const CLIENT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const;

export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];

/**
 * Task status values
 */
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/**
 * Invoice status values
 */
export const INVOICE_STATUS = {
  DRAFT: 'draft',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

/**
 * Document status values
 */
export const DOCUMENT_STATUS = {
  DRAFT: 'draft',
  FINAL: 'final',
  ARCHIVED: 'archived',
} as const;

export type DocumentStatus = (typeof DOCUMENT_STATUS)[keyof typeof DOCUMENT_STATUS];

/**
 * Communication log types
 */
export const COMMUNICATION_TYPE = {
  CALL: 'call',
  PHONE: 'phone',
  EMAIL: 'email',
  MEETING: 'meeting',
  NOTE: 'note',
  OTHER: 'other',
} as const;

export type CommunicationType = (typeof COMMUNICATION_TYPE)[keyof typeof COMMUNICATION_TYPE];
