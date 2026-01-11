# Sign Up Flow Database Connection Review

## Summary
Review of the sign up flow to verify all collected data is properly saved to database tables.

## Data Collection Flow

### Step 0: Account Creation (Onboarding.tsx)
**Collected Data:**
- `firstName` (formData.account.firstName)
- `lastName` (formData.account.lastName)
- `email` (formData.account.email)
- `password` (formData.account.password)

**Where it goes:**
- `signUp()` function in `useAuth.tsx` passes:
  ```typescript
  {
    email: formData.account.email,
    first_name: formData.account.firstName,
    last_name: formData.account.lastName,
  }
  ```
- This data is stored in `auth.users.raw_user_meta_data` as metadata

### Step 1: Organization Setup (Onboarding.tsx)
**Collected Data:**
- `name` (formData.organization.name)
- `type` (formData.organization.type)
- `size` (formData.organization.size)
- `description` (formData.organization.description)
- `address` (formData.organization.address)
- `state` (formData.organization.state)
- `country` (formData.organization.country)
- `phone` (formData.organization.phone)
- `email` (formData.organization.email)

**Where it goes:**
- Saved to `organizations` table in `handleFinish()` function
- Profile is updated with `organization_id` and `role: 'superadmin'`

## Database Trigger Analysis

### Current Active Trigger
The most recent migration (`20251010204518`) uses `handle_new_user_with_invitation()` which:
- ✅ Saves `first_name` from `NEW.raw_user_meta_data ->> 'first_name'`
- ✅ Saves `last_name` from `NEW.raw_user_meta_data ->> 'last_name'`
- ✅ Saves `email` from `NEW.email`
- ✅ Creates profile with or without organization based on invitation status

### Potential Issue: FIX_SIGNUP_NOW.sql
The `FIX_SIGNUP_NOW.sql` file uses `handle_new_user_fast()` which:
- ❌ Does NOT save `first_name`
- ❌ Does NOT save `last_name`
- Only saves: `user_id`, `email`, `organization_id`, `role`, `is_organization_creator`

**This is a problem if this trigger is active!**

## Issues Found

### Issue 1: Missing first_name/last_name in handleFinish
The `handleFinish()` function in `Onboarding.tsx` only updates:
```typescript
{
  organization_id: orgData.id,
  role: 'superadmin',
}
```

It does NOT update `first_name` and `last_name` even though this data is available in `formData.account`.

### Issue 2: Trigger inconsistency
If `handle_new_user_fast()` is active (from FIX_SIGNUP_NOW.sql), then `first_name` and `last_name` are never saved to the profiles table.

## Recommendations

1. **Update handleFinish() to save first_name and last_name:**
   ```typescript
   const { error: profileError } = await supabase
     .from('profiles')
     .update({
       organization_id: orgData.id,
       role: 'superadmin',
       first_name: formData.account.firstName,
       last_name: formData.account.lastName,
     })
     .eq('user_id', user?.id || '');
   ```

2. **Verify which trigger is active:**
   - Check if `handle_new_user_with_invitation()` or `handle_new_user_fast()` is active
   - If `handle_new_user_fast()` is active, update it to save first_name/last_name

3. **Ensure data persistence:**
   - Even if trigger saves first_name/last_name, updating in handleFinish() ensures data is correct
   - This handles cases where user might have changed their name during onboarding

## Data Flow Summary

| Data Field | Collected In | Saved To | Table | Status |
|------------|--------------|----------|-------|--------|
| first_name | Step 0 | auth.users.metadata → profiles | profiles | ⚠️ Depends on trigger |
| last_name | Step 0 | auth.users.metadata → profiles | profiles | ⚠️ Depends on trigger |
| email | Step 0 | auth.users + profiles | profiles | ✅ Always saved |
| password | Step 0 | auth.users (hashed) | auth.users | ✅ Always saved |
| org.name | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.description | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.address | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.state | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.country | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.phone | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| org.email | Step 1 | organizations | organizations | ✅ Saved in handleFinish |
| organization_id | Step 1 | profiles | profiles | ✅ Updated in handleFinish |
| role | Step 1 | profiles | profiles | ✅ Updated in handleFinish |

## Conclusion

**Critical Issue:** `first_name` and `last_name` may not be saved to the `profiles` table depending on which trigger is active. The `handleFinish()` function should explicitly update these fields to ensure data persistence.

## Fixes Applied

### Fix 1: Updated handleFinish() to save first_name and last_name
✅ **Fixed:** Updated `handleFinish()` in `Onboarding.tsx` to explicitly save `first_name` and `last_name`:
```typescript
.update({
  organization_id: orgData.id,
  role: 'superadmin',
  first_name: formData.account.firstName || user?.user_metadata?.first_name || null,
  last_name: formData.account.lastName || user?.user_metadata?.last_name || null,
})
```

### Fix 2: Updated handle_new_user_fast() trigger
✅ **Fixed:** Created migration `20250120000000_fix_handle_new_user_fast_save_names.sql` to update `handle_new_user_fast()` to save `first_name` and `last_name` from user metadata. This ensures data is saved even if this trigger is used instead of `handle_new_user_with_invitation()`.

### Fix 3: Populate formData from user metadata
✅ **Fixed:** Added logic to populate `formData.account` from `user.user_metadata` when user returns after email verification. This ensures the form has the user's name even if they navigated away and came back.

## Benefits

These fixes ensure:
1. ✅ Data from form is saved even if trigger didn't capture it
2. ✅ Fallback to user metadata if form data is not available (SSO/email verification flow)
3. ✅ Data persistence regardless of which trigger is active
4. ✅ Form data is preserved when user returns after email verification
5. ✅ Both triggers now save first_name and last_name
