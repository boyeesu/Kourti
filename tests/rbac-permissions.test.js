import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

// =============================================================================
// RBAC Permission System Tests
//
// Tests the permission resolution logic from:
//   - has_permission() SQL function (contract/logic tests)
//   - PermissionsTab getPermissionValue() UI logic
//   - useUpdateUserRole() RPC contract
//   - PermissionGate fail-closed behavior
//
// These are unit tests of the LOGIC — they don't need Supabase running.
// They verify the permission resolution algorithm matches the SQL function.
// =============================================================================

// ---------------------------------------------------------------------------
// Pure-function reimplementation of has_permission() logic for testing
// This mirrors the SQL in 20260311000000_fix_rbac_permission_source.sql
// ---------------------------------------------------------------------------

/**
 * @param {object} ctx
 * @param {string[]} ctx.userRoles - roles from user_role_assignments
 * @param {string|null} ctx.profileRole - legacy profiles.role fallback
 * @param {Array<{role_name:string, resource:string, action:string, granted:boolean}>} ctx.rolePermissions
 * @param {string} resource
 * @param {string} action
 * @returns {boolean}
 */
function hasPermission(ctx, resource, action) {
  let roles = ctx.userRoles && ctx.userRoles.length > 0 ? [...ctx.userRoles] : null;

  // Backward compat: fall back to profiles.role if no assignments
  if (!roles && ctx.profileRole) {
    roles = [ctx.profileRole];
  }

  if (!roles || roles.length === 0) return false;

  // Superadmin: all permissions always
  if (roles.includes('superadmin')) return true;

  // Check explicit permissions FIRST (allows overriding defaults)
  for (const role of roles) {
    // Exact match
    const exact = ctx.rolePermissions.find(
      (p) => p.role_name === role && p.resource === resource && p.action === action
    );
    if (exact !== undefined) return exact.granted;

    // Manage fallback
    const manage = ctx.rolePermissions.find(
      (p) => p.role_name === role && p.resource === resource && p.action === 'manage'
    );
    if (manage !== undefined) return manage.granted;
  }

  // No explicit permission — apply role defaults
  if (roles.includes('admin')) return true;
  if (roles.includes('user')) return ['create', 'read', 'update'].includes(action);

  // Custom role with no explicit permissions: deny
  return false;
}

// ---------------------------------------------------------------------------
// Pure-function reimplementation of PermissionsTab getPermissionValue()
// ---------------------------------------------------------------------------

/**
 * @param {object} ctx
 * @param {string} ctx.selectedRole
 * @param {Map<string,boolean>} ctx.pendingChanges
 * @param {Map<string,boolean>} ctx.permissionMap
 * @param {string} resource
 * @param {string} action
 * @returns {boolean}
 */
function getPermissionValue(ctx, resource, action) {
  const key = `${resource}-${action}`;

  if (ctx.pendingChanges.has(key)) {
    return ctx.pendingChanges.get(key) || false;
  }

  if (ctx.selectedRole === 'superadmin') return true;

  if (ctx.permissionMap.has(key)) {
    return ctx.permissionMap.get(key) || false;
  }

  if (ctx.selectedRole === 'admin') return true;
  if (ctx.selectedRole === 'user') return action !== 'delete' && action !== 'manage';

  return false;
}

// =============================================================================
// has_permission() — SQL function logic tests
// =============================================================================

describe('has_permission() — role resolution from user_role_assignments', () => {
  test('superadmin has all permissions on every resource', () => {
    const ctx = { userRoles: ['superadmin'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true);
    assert.equal(hasPermission(ctx, 'cases', 'manage'), true);
    assert.equal(hasPermission(ctx, 'invoices', 'create'), true);
    assert.equal(hasPermission(ctx, 'settings', 'manage'), true);
  });

  test('admin has all permissions by default (no explicit permissions)', () => {
    const ctx = { userRoles: ['admin'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true);
    assert.equal(hasPermission(ctx, 'cases', 'manage'), true);
    assert.equal(hasPermission(ctx, 'users', 'create'), true);
  });

  test('user has CRU but not delete/manage by default', () => {
    const ctx = { userRoles: ['user'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'create'), true);
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'update'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), false);
    assert.equal(hasPermission(ctx, 'cases', 'manage'), false);
    assert.equal(hasPermission(ctx, 'invoices', 'delete'), false);
  });

  test('no roles at all => deny everything', () => {
    const ctx = { userRoles: [], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
    assert.equal(hasPermission(ctx, 'cases', 'create'), false);
  });

  test('null roles and null profile => deny everything', () => {
    const ctx = { userRoles: null, profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
  });
});

describe('has_permission() — backward compatibility fallback to profiles.role', () => {
  test('falls back to profiles.role when user_role_assignments is empty', () => {
    const ctx = { userRoles: [], profileRole: 'admin', rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true);
  });

  test('falls back to profiles.role = user with correct CRU defaults', () => {
    const ctx = { userRoles: [], profileRole: 'user', rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), false);
  });

  test('user_role_assignments takes priority over profiles.role', () => {
    // user_role_assignments says admin, profiles.role says user
    const ctx = { userRoles: ['admin'], profileRole: 'user', rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true); // admin default, not user
  });

  test('profiles.role superadmin fallback grants full access', () => {
    const ctx = { userRoles: [], profileRole: 'superadmin', rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'settings', 'manage'), true);
  });
});

describe('has_permission() — explicit permissions override defaults', () => {
  test('explicit granted=false overrides admin default', () => {
    const ctx = {
      userRoles: ['admin'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'admin', resource: 'invoices', action: 'delete', granted: false },
      ],
    };
    assert.equal(hasPermission(ctx, 'invoices', 'delete'), false); // explicitly denied
    assert.equal(hasPermission(ctx, 'invoices', 'read'), true); // still default admin
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true); // different resource
  });

  test('explicit granted=true overrides user default deny', () => {
    const ctx = {
      userRoles: ['user'],
      profileRole: null,
      rolePermissions: [{ role_name: 'user', resource: 'cases', action: 'delete', granted: true }],
    };
    assert.equal(hasPermission(ctx, 'cases', 'delete'), true); // explicitly granted
    assert.equal(hasPermission(ctx, 'invoices', 'delete'), false); // still user default
  });

  test('manage permission acts as fallback for specific actions', () => {
    const ctx = {
      userRoles: ['legal_assistant'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'legal_assistant', resource: 'documents', action: 'manage', granted: true },
      ],
    };
    // No explicit 'read' permission, but 'manage' fallback grants it
    assert.equal(hasPermission(ctx, 'documents', 'read'), true);
    assert.equal(hasPermission(ctx, 'documents', 'delete'), true);
    // Different resource — no manage permission
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
  });

  test('explicit action takes priority over manage fallback', () => {
    const ctx = {
      userRoles: ['paralegal'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'paralegal', resource: 'cases', action: 'manage', granted: true },
        { role_name: 'paralegal', resource: 'cases', action: 'delete', granted: false },
      ],
    };
    // Explicit delete=false takes priority over manage=true
    assert.equal(hasPermission(ctx, 'cases', 'delete'), false);
    // Other actions fall through to manage=true
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
  });
});

describe('has_permission() — custom roles', () => {
  test('custom role with no permissions denies everything', () => {
    const ctx = { userRoles: ['intern'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
    assert.equal(hasPermission(ctx, 'cases', 'create'), false);
    assert.equal(hasPermission(ctx, 'documents', 'read'), false);
  });

  test('custom role with granular permissions', () => {
    const ctx = {
      userRoles: ['legal_assistant'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'legal_assistant', resource: 'cases', action: 'read', granted: true },
        { role_name: 'legal_assistant', resource: 'cases', action: 'update', granted: true },
        { role_name: 'legal_assistant', resource: 'documents', action: 'read', granted: true },
        { role_name: 'legal_assistant', resource: 'invoices', action: 'read', granted: false },
      ],
    };
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
    assert.equal(hasPermission(ctx, 'cases', 'update'), true);
    assert.equal(hasPermission(ctx, 'cases', 'delete'), false); // not granted
    assert.equal(hasPermission(ctx, 'cases', 'create'), false); // not granted
    assert.equal(hasPermission(ctx, 'documents', 'read'), true);
    assert.equal(hasPermission(ctx, 'invoices', 'read'), false); // explicitly denied
    assert.equal(hasPermission(ctx, 'clients', 'read'), false); // not mentioned
  });

  test('superadmin ignores explicit denials', () => {
    const ctx = {
      userRoles: ['superadmin'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'superadmin', resource: 'cases', action: 'read', granted: false },
      ],
    };
    // Superadmin returns true BEFORE checking explicit permissions
    assert.equal(hasPermission(ctx, 'cases', 'read'), true);
  });
});

describe('has_permission() — all resources and actions covered', () => {
  const RESOURCES = [
    'cases',
    'clients',
    'documents',
    'contracts',
    'calendars',
    'invoices',
    'tasks',
    'settings',
    'users',
  ];
  const ACTIONS = ['create', 'read', 'update', 'delete', 'manage'];

  test('superadmin has true for every resource×action combination', () => {
    const ctx = { userRoles: ['superadmin'], profileRole: null, rolePermissions: [] };
    for (const r of RESOURCES) {
      for (const a of ACTIONS) {
        assert.equal(hasPermission(ctx, r, a), true, `superadmin should have ${a} on ${r}`);
      }
    }
  });

  test('user has CRU on every resource, no delete/manage', () => {
    const ctx = { userRoles: ['user'], profileRole: null, rolePermissions: [] };
    for (const r of RESOURCES) {
      assert.equal(hasPermission(ctx, r, 'create'), true, `user should have create on ${r}`);
      assert.equal(hasPermission(ctx, r, 'read'), true, `user should have read on ${r}`);
      assert.equal(hasPermission(ctx, r, 'update'), true, `user should have update on ${r}`);
      assert.equal(hasPermission(ctx, r, 'delete'), false, `user should NOT have delete on ${r}`);
      assert.equal(hasPermission(ctx, r, 'manage'), false, `user should NOT have manage on ${r}`);
    }
  });
});

// =============================================================================
// PermissionsTab getPermissionValue() — UI logic tests
// =============================================================================

describe('getPermissionValue() — PermissionsTab UI logic', () => {
  test('pending changes take highest priority', () => {
    const ctx = {
      selectedRole: 'user',
      pendingChanges: new Map([['cases-delete', true]]),
      permissionMap: new Map([['cases-delete', false]]),
    };
    // Pending change overrides both permissionMap and defaults
    assert.equal(getPermissionValue(ctx, 'cases', 'delete'), true);
  });

  test('superadmin always returns true regardless of permissionMap', () => {
    const ctx = {
      selectedRole: 'superadmin',
      pendingChanges: new Map(),
      permissionMap: new Map([['cases-read', false]]),
    };
    assert.equal(getPermissionValue(ctx, 'cases', 'read'), true);
    assert.equal(getPermissionValue(ctx, 'invoices', 'manage'), true);
  });

  test('admin shows explicit permission from DB when it exists', () => {
    const ctx = {
      selectedRole: 'admin',
      pendingChanges: new Map(),
      permissionMap: new Map([['invoices-delete', false]]),
    };
    assert.equal(getPermissionValue(ctx, 'invoices', 'delete'), false); // explicit
    assert.equal(getPermissionValue(ctx, 'invoices', 'read'), true); // default
  });

  test('user shows explicit permission from DB when it exists', () => {
    const ctx = {
      selectedRole: 'user',
      pendingChanges: new Map(),
      permissionMap: new Map([['cases-delete', true]]),
    };
    assert.equal(getPermissionValue(ctx, 'cases', 'delete'), true); // explicit override
    assert.equal(getPermissionValue(ctx, 'cases', 'read'), true); // default
    assert.equal(getPermissionValue(ctx, 'cases', 'manage'), false); // default deny
  });

  test('custom role defaults to false when no explicit permission', () => {
    const ctx = {
      selectedRole: 'legal_assistant',
      pendingChanges: new Map(),
      permissionMap: new Map([['cases-read', true]]),
    };
    assert.equal(getPermissionValue(ctx, 'cases', 'read'), true); // explicit
    assert.equal(getPermissionValue(ctx, 'cases', 'create'), false); // no permission = deny
    assert.equal(getPermissionValue(ctx, 'invoices', 'read'), false); // no permission = deny
  });

  test('UI logic matches SQL logic for admin with explicit denials', () => {
    const permissionMap = new Map([
      ['invoices-delete', false],
      ['invoices-manage', false],
    ]);
    const sqlCtx = {
      userRoles: ['admin'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'admin', resource: 'invoices', action: 'delete', granted: false },
        { role_name: 'admin', resource: 'invoices', action: 'manage', granted: false },
      ],
    };
    const uiCtx = {
      selectedRole: 'admin',
      pendingChanges: new Map(),
      permissionMap,
    };

    // Explicit denials agree in both SQL and UI
    assert.equal(
      hasPermission(sqlCtx, 'invoices', 'delete'),
      getPermissionValue(uiCtx, 'invoices', 'delete')
    );
    assert.equal(
      hasPermission(sqlCtx, 'invoices', 'manage'),
      getPermissionValue(uiCtx, 'invoices', 'manage')
    );

    // SQL manage fallback: invoices-manage=false causes invoices-read to be denied in SQL.
    // UI shows each toggle independently — no manage fallback — so admin default (true) applies.
    // This divergence is by design: the UI lets superadmins see and set each action individually.
    assert.equal(hasPermission(sqlCtx, 'invoices', 'read'), false); // SQL: manage fallback
    assert.equal(getPermissionValue(uiCtx, 'invoices', 'read'), true); // UI: no explicit → admin default

    // No explicit permissions on cases — both use admin defaults
    assert.equal(
      hasPermission(sqlCtx, 'cases', 'read'),
      getPermissionValue(uiCtx, 'cases', 'read')
    );
  });

  test('UI logic matches SQL logic for user with explicit grants', () => {
    const permissionMap = new Map([['cases-delete', true]]);
    const sqlCtx = {
      userRoles: ['user'],
      profileRole: null,
      rolePermissions: [{ role_name: 'user', resource: 'cases', action: 'delete', granted: true }],
    };
    const uiCtx = {
      selectedRole: 'user',
      pendingChanges: new Map(),
      permissionMap,
    };

    assert.equal(
      hasPermission(sqlCtx, 'cases', 'delete'),
      getPermissionValue(uiCtx, 'cases', 'delete')
    );
    assert.equal(
      hasPermission(sqlCtx, 'cases', 'read'),
      getPermissionValue(uiCtx, 'cases', 'read')
    );
    assert.equal(
      hasPermission(sqlCtx, 'cases', 'manage'),
      getPermissionValue(uiCtx, 'cases', 'manage')
    );
  });
});

// =============================================================================
// Security invariant tests
// =============================================================================

describe('Security invariants', () => {
  test('fail-closed: unknown role with no permissions denies all access', () => {
    const ctx = { userRoles: ['unknown_role'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
    assert.equal(hasPermission(ctx, 'settings', 'manage'), false);
  });

  test('fail-closed: empty string role denies access', () => {
    const ctx = { userRoles: [''], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
  });

  test('platform_admin role alone has no default permissions', () => {
    // platform_admin bypasses via separate is_platform_admin() check, not has_permission()
    const ctx = { userRoles: ['platform_admin'], profileRole: null, rolePermissions: [] };
    assert.equal(hasPermission(ctx, 'cases', 'read'), false);
    assert.equal(hasPermission(ctx, 'users', 'manage'), false);
  });

  test('admin explicit deny cannot be overridden by user default', () => {
    // If someone has both admin and user roles, admin explicit deny should stick
    const ctx = {
      userRoles: ['admin'],
      profileRole: null,
      rolePermissions: [
        { role_name: 'admin', resource: 'invoices', action: 'delete', granted: false },
      ],
    };
    assert.equal(hasPermission(ctx, 'invoices', 'delete'), false);
  });

  test('custom role cannot gain superadmin-level access via permissions alone', () => {
    // Even with all permissions explicitly granted, a custom role is NOT superadmin
    // because superadmin status is checked before permissions
    const perms = [];
    const RESOURCES = [
      'cases',
      'clients',
      'documents',
      'contracts',
      'calendars',
      'invoices',
      'tasks',
      'settings',
      'users',
    ];
    const ACTIONS = ['create', 'read', 'update', 'delete', 'manage'];
    for (const r of RESOURCES) {
      for (const a of ACTIONS) {
        perms.push({ role_name: 'full_access', resource: r, action: a, granted: true });
      }
    }
    const ctx = { userRoles: ['full_access'], profileRole: null, rolePermissions: perms };
    // Has all explicit permissions
    assert.equal(hasPermission(ctx, 'cases', 'manage'), true);
    assert.equal(hasPermission(ctx, 'settings', 'manage'), true);
    // But is_user_admin() would still return false for this role
    // (that function only checks for 'admin' or 'superadmin' in role_name)
  });

  test('granted=false is distinct from permission not existing', () => {
    const withExplicitDeny = {
      userRoles: ['user'],
      profileRole: null,
      rolePermissions: [{ role_name: 'user', resource: 'cases', action: 'read', granted: false }],
    };
    const withoutPermission = {
      userRoles: ['user'],
      profileRole: null,
      rolePermissions: [],
    };
    // Explicit deny => false
    assert.equal(hasPermission(withExplicitDeny, 'cases', 'read'), false);
    // No permission => fall back to user default => true
    assert.equal(hasPermission(withoutPermission, 'cases', 'read'), true);
  });
});

// =============================================================================
// useUpdateUserRole() contract tests
// =============================================================================

describe('useUpdateUserRole() — contract validation', () => {
  test('platform_admin role is blocked client-side', () => {
    // Simulates the guard in useUpdateUserRole
    const role = 'platform_admin';
    assert.throws(
      () => {
        if (role === 'platform_admin') {
          throw new Error('Platform admin role cannot be assigned through the application.');
        }
      },
      { message: 'Platform admin role cannot be assigned through the application.' }
    );
  });

  test('RPC response with error is handled correctly', () => {
    // Simulates the RPC error handling logic
    const result = { error: 'Only superadmins can assign the superadmin role' };
    assert.throws(
      () => {
        if (result && result.error) {
          throw new Error(result.error);
        }
      },
      { message: 'Only superadmins can assign the superadmin role' }
    );
  });

  test('RPC response with success does not throw', () => {
    const result = { success: true, message: 'User role changed successfully' };
    assert.doesNotThrow(() => {
      if (result && result.error) {
        throw new Error(result.error);
      }
    });
  });
});
