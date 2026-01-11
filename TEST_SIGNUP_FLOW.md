# Testing Signup Flow - Step by Step Guide

## Prerequisites
1. ✅ .env file exists with Supabase credentials
2. Supabase project linked: `zjbvnvydgsxqmmrrmvif`

## Step 1: Apply Database Fixes

Run the SQL script in Supabase SQL Editor:
```sql
-- Run: fix-and-test-signup.sql
```

This ensures:
- ✅ `organization_id` can be NULL in profiles
- ✅ Trigger function `handle_new_user_ultra_fast()` is active
- ✅ Trigger saves first_name and last_name from metadata
- ✅ RLS policies allow trigger to work

## Step 2: Start Dev Server

```powershell
npm run dev
```

Server should start on `http://localhost:5173`

## Step 3: Test Signup Flow

1. Navigate to: `http://localhost:5173/onboarding`

2. **Step 0: Create Account**
   - Fill in:
     - First Name: `Test`
     - Last Name: `User`
     - Email: `test.user.$(Get-Random)@example.com` (use unique email)
     - Password: `TestPassword123!`
     - Confirm Password: `TestPassword123!`
   - Click "Continue"

3. **Step 1: Organization Setup**
   - Fill in organization details:
     - Name: `Test Law Firm`
     - Type: Select any type
     - Size: Select any size
     - Description: `Test organization`
     - Address, State, Country, Phone, Email (optional)
   - Click "Continue"

4. **Step 2: Team Configuration**
   - Skip or add team members
   - Click "Continue"

5. **Step 3: Practice Areas**
   - Select practice areas or skip
   - Click "Continue"

6. **Step 4: Finish**
   - Click "Complete Setup"
   - **Watch for errors in browser console**

## Step 4: Verify in Database

Run in Supabase SQL Editor:
```sql
-- Check the user was created
SELECT 
    u.id,
    u.email,
    u.created_at,
    u.raw_user_meta_data->>'first_name' as meta_first_name,
    u.raw_user_meta_data->>'last_name' as meta_last_name
FROM auth.users u
WHERE u.email LIKE 'test.user%@example.com'
ORDER BY u.created_at DESC
LIMIT 1;

-- Check the profile was created
SELECT 
    p.id,
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.organization_id,
    p.role,
    p.is_organization_creator
FROM profiles p
WHERE p.email LIKE 'test.user%@example.com'
ORDER BY p.created_at DESC
LIMIT 1;

-- Check the organization was created
SELECT 
    o.id,
    o.name,
    o.type,
    o.email
FROM organizations o
WHERE o.name = 'Test Law Firm'
ORDER BY o.created_at DESC
LIMIT 1;
```

## Expected Behavior

1. ✅ User created in `auth.users` with metadata (first_name, last_name)
2. ✅ Profile created in `profiles` with:
   - `organization_id` = NULL (initially)
   - `first_name` and `last_name` from metadata
   - `role` = 'superadmin'
   - `is_organization_creator` = TRUE
3. ✅ After onboarding completes:
   - Organization created in `organizations`
   - Profile updated with `organization_id`
4. ✅ User redirected to dashboard

## Common Issues to Check

### Issue 1: Profile not created
- **Symptom**: User exists in auth.users but no profile
- **Fix**: Check trigger is active, check RLS policies

### Issue 2: organization_id is NULL after onboarding
- **Symptom**: Profile exists but organization_id is still NULL
- **Fix**: Check onboarding code updates profile correctly

### Issue 3: first_name/last_name not saved
- **Symptom**: Profile exists but names are empty
- **Fix**: Check trigger saves from raw_user_meta_data

### Issue 4: 504 Timeout during signup
- **Symptom**: Signup takes too long, times out
- **Fix**: Check trigger performance, ensure indexes exist

## Debug Commands

```powershell
# Check Supabase status (if local)
npx supabase status

# Check recent signups
# Run in Supabase SQL Editor:
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
LIMIT 10;
```
