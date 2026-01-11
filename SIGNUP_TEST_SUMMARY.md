# Signup Flow Testing Summary

## Changes Made

### 1. Fixed Race Condition in Onboarding (Onboarding.tsx)
- **Issue**: Fixed potential race condition where session might not be available immediately after signup
- **Fix**: Added retry logic with up to 5 attempts (500ms intervals) to wait for session
- **Location**: `src/pages/Onboarding.tsx` lines ~394-405

### 2. Created Database Fix Script (fix-and-test-signup.sql)
- Ensures `organization_id` can be NULL in profiles table
- Sets up optimized trigger function `handle_new_user_ultra_fast()`
- Creates necessary indexes for performance
- Sets up RLS policies for trigger to work
- **Action Required**: Run this script in Supabase SQL Editor

### 3. Created Diagnostic Script (test-signup-diagnostic.sql)
- Checks current trigger state
- Verifies database schema
- Shows recent signups
- **Action Required**: Run to verify current state

### 4. Created Test Guide (TEST_SIGNUP_FLOW.md)
- Step-by-step testing instructions
- Expected behavior documentation
- Common issues and fixes

## Current Status

✅ Dev server started (running in background)
✅ Code fixes applied
✅ Database scripts created
⚠️ **Database fix needs to be applied** (run fix-and-test-signup.sql)

## Next Steps

1. **Apply Database Fix**:
   - Go to Supabase Dashboard → SQL Editor
   - Run `fix-and-test-signup.sql`
   - Verify with `test-signup-diagnostic.sql`

2. **Test Signup Flow**:
   - Navigate to `http://localhost:5173/onboarding`
   - Complete the onboarding form
   - Watch browser console for errors
   - Verify user, profile, and organization are created

3. **Verify in Database**:
   ```sql
   -- Check recent signup
   SELECT 
       u.email,
       u.created_at,
       p.first_name,
       p.last_name,
       p.organization_id,
       o.name as org_name
   FROM auth.users u
   LEFT JOIN profiles p ON u.id = p.user_id
   LEFT JOIN organizations o ON p.organization_id = o.id
   ORDER BY u.created_at DESC
   LIMIT 1;
   ```

## Expected Flow

1. User fills onboarding form → clicks "Complete Setup"
2. `signUp()` called → creates user in `auth.users` with metadata
3. Trigger `handle_new_user_ultra_fast()` fires → creates profile with:
   - `organization_id` = NULL (for new signups)
   - `first_name` and `last_name` from metadata
   - `role` = 'superadmin'
   - `is_organization_creator` = TRUE
4. Onboarding code waits for session (with retry)
5. Onboarding creates organization
6. Profile updated with `organization_id`
7. User redirected to dashboard

## Potential Issues to Watch For

1. **Session not available immediately**
   - Fixed with retry logic
   - If still occurs, check email confirmation settings

2. **Profile not created**
   - Check trigger is active
   - Check RLS policies
   - Check trigger function exists

3. **Organization creation fails**
   - Check organization type is valid
   - Check required fields are provided
   - Check RLS policies on organizations table

4. **Profile update fails**
   - Check profile exists
   - Check user has permission to update
   - Check organization_id is valid UUID

## Files Modified

- `src/pages/Onboarding.tsx` - Fixed session wait logic
- `fix-and-test-signup.sql` - Database fix script (NEW)
- `test-signup-diagnostic.sql` - Diagnostic script (NEW)
- `TEST_SIGNUP_FLOW.md` - Testing guide (NEW)

## Files to Review

- `supabase/migrations/20260113000001_optimize_signup_performance.sql` - Current trigger migration
- `src/pages/AuthCallback.tsx` - Handles redirect after auth
- `src/hooks/useAuth.tsx` - Signup function
