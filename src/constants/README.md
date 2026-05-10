# Constants

This directory contains all application-wide constants to avoid magic strings and improve code maintainability.

## Usage

Import constants from the barrel export:

```typescript
import { USER_ROLES, TABLES, ROUTES, CASE_STATUS } from '@/constants';

// Check user role
if (user.role === USER_ROLES.ADMIN) {
  // ...
}

// Reference a backend table name (e.g. when constructing search params)
const tableName = TABLES.CASES;

// Navigate
navigate(ROUTES.CASES);

// Check status
if (case.status === CASE_STATUS.OPEN) {
  // ...
}
```

## Files

### `roles.ts`

User roles and role-related utility functions:

- `USER_ROLES` - All user role constants
- `isAdminRole()` - Check if role has admin privileges
- `canManageUsers()` - Check if role can manage users
- `canInviteUsers()` - Check if role can invite users

### `tables.ts`

Database table name constants. The frontend talks to the Node backend
over `invokeNodeApi`; these names are useful for things like search
filters and audit logs that reference a table by name.

- `TABLES` - All database table name constants

### `routes.ts`

Application route paths:

- `ROUTES` - All route path constants
- `buildRoute()` - Build dynamic routes with parameters

### `statuses.ts`

Status and type constants for various entities:

- `CASE_STATUS` - Case status values
- `CASE_PRIORITY` - Case priority values
- `CLIENT_STATUS` - Client status values
- `TASK_STATUS` - Task status values
- `INVOICE_STATUS` - Invoice status values
- `DOCUMENT_STATUS` - Document status values
- `COMMUNICATION_TYPE` - Communication log types

### `errors.ts`

Error codes and user-friendly error messages:

- `ErrorCode` - Error code enum (re-exported from error-handling)
- `ERROR_MESSAGES` - User-friendly error messages
- `getUserErrorMessage()` - Get message for error code

## Benefits

1. **Type Safety**: TypeScript can autocomplete and validate constant usage
2. **Refactoring**: Change a value in one place instead of searching/replacing across files
3. **Consistency**: Ensures same values used everywhere
4. **Documentation**: Constants serve as documentation of valid values
5. **Testing**: Easy to mock and test with known constant values

## Adding New Constants

When adding new constants:

1. Add to appropriate file (or create new file if needed)
2. Export from `index.ts`
3. Add TypeScript types using `as const` pattern
4. Document in this README
5. Update existing code to use new constants
