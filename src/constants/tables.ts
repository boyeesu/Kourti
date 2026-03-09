/**
 * Database table names used in Supabase queries
 */
export const TABLES = {
  // Core entities
  CASES: 'cases',
  CLIENTS: 'clients',
  DOCUMENTS: 'documents',
  CONTRACTS: 'contracts',
  INVOICES: 'invoices',

  // User management
  USERS: 'users',
  PROFILES: 'profiles',
  USER_ROLES: 'user_roles',
  INVITATIONS: 'invitations',

  // Organization
  ORGANIZATIONS: 'organizations',

  // Tasks and activities
  TASKS: 'tasks',
  ACTIVITIES: 'activities',
  CALENDAR_EVENTS: 'calendar_events',

  // Communication
  COMMUNICATION_LOGS: 'communication_logs',
  NOTIFICATIONS: 'notifications',
  MESSAGES: 'messages',

  // Case management
  CASE_TYPES: 'case_types',
  CASE_ISSUES: 'case_issues',

  // Document management
  DOCUMENT_TEMPLATES: 'document_templates',

  // Chat and AI
  CHAT_MESSAGES: 'chat_messages',
  CHAT_SESSIONS: 'chat_sessions',

  // Billing
  BILLING_RATES: 'billing_rates',
  TIME_ENTRIES: 'time_entries',

  // Permissions
  PERMISSIONS: 'permissions',
  ROLE_PERMISSIONS: 'role_permissions',

  // Subscriptions & Payments
  SUBSCRIPTIONS: 'subscriptions',
  PAYMENT_TRANSACTIONS: 'payment_transactions',
  WEBHOOK_EVENTS: 'webhook_events',
} as const;

/**
 * Type for table names
 */
export type TableName = (typeof TABLES)[keyof typeof TABLES];
