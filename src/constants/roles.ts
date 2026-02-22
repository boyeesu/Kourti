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
 * Check if a role has admin privileges
 */
export function isAdminRole(role?: string): boolean {
  return (
    role === USER_ROLES.ADMIN ||
    role === USER_ROLES.SUPERADMIN ||
    role === USER_ROLES.PLATFORM_ADMIN
  );
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
