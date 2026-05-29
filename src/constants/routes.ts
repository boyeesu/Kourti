/**
 * Application route paths
 */
export const ROUTES = {
  // Public routes
  HOME: '/',
  LOGIN: '/login',
  SIGNUP: '/signup',
  ACCEPT_INVITATION: '/accept-invitation',

  // Dashboard
  DASHBOARD: '/dashboard',

  // Cases
  CASES: '/cases',
  CASE_DETAIL: '/cases/:id',

  // Clients
  CLIENTS: '/clients',
  CLIENT_DETAIL: '/clients/:id',

  // Documents
  DOCUMENTS: '/documents',
  DOCUMENT_TEMPLATES: '/document-templates',

  // Contracts
  CONTRACTS: '/contracts',

  // Tasks
  TASKS: '/tasks',

  // Calendar
  CALENDAR: '/calendar',

  // Invoices
  INVOICES: '/invoices',

  // Analytics
  ANALYTICS: '/analytics',

  // Communication
  MESSAGES: '/messages',
  NOTIFICATIONS: '/notifications',

  // User management
  USER_MANAGEMENT: '/user-management',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_ORGANIZATION: '/settings/organization',
  SETTINGS_SECURITY: '/settings/security',
  SETTINGS_BILLING: '/settings?tab=billing',

  // Pricing (public)
  PRICING: '/pricing',

  // Help
  HELP_CENTER: '/help',
} as const;

/**
 * Type for route paths
 */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];

/**
 * Build a route with parameters
 * @example buildRoute(ROUTES.CASE_DETAIL, { id: '123' }) // '/cases/123'
 */
export function buildRoute(route: string, params: Record<string, string>): string {
  let result = route;
  Object.entries(params).forEach(([key, value]) => {
    result = result.replace(`:${key}`, value);
  });
  return result;
}
