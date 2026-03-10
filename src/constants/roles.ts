/**
 * User roles used throughout the application
 */
export const USER_ROLES = {
  ADMIN: 'admin',
  LAWYER: 'lawyer',
  PARALEGAL: 'paralegal',
  CLIENT: 'client',
  SUPERADMIN: 'superadmin',
  STAFF: 'staff',
  PLATFORM_ADMIN: 'platform_admin',
} as const;

/**
 * Type for user role values
 */
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/**
 * Roles that cannot be assigned through the application UI.
 * Platform admin can only be set via direct database access.
 */
export const PROTECTED_ROLES = [USER_ROLES.PLATFORM_ADMIN] as const;

/**
 * Check if a role has organization-level admin privileges.
 * Note: platform_admin is NOT included — it's a separate, DB-only role
 * checked via the is_platform_admin() database function.
 */
export function isAdminRole(role?: string): boolean {
  return role === USER_ROLES.ADMIN || role === USER_ROLES.SUPERADMIN;
}

/**
 * Check if a role can manage other users
 */
export function canManageUsers(role?: string): boolean {
  return isAdminRole(role);
}

/**
 * Check if a role can invite users
 */
export function canInviteUsers(role?: string): boolean {
  return isAdminRole(role);
}
