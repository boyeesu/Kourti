# Signup Flow Test Guide

This guide helps you test the user invitation and signup flows.

## Prerequisites

1. Access to Supabase SQL Editor
2. An admin user account (or create one first)
3. Test email addresses (use temporary emails or your own)

## Running the Tests

### Step 1: Run Setup

Open the SQL file `20250124000001_test_signup_flows.sql` in Supabase SQL Editor and run the **SETUP** section first.

### Step 2: Run Individual Tests

Each test section can be run independently. The tests will output instructions on what to verify.

## Test Scenarios

### Test 1: Regular Signup (No Invitation)
**Purpose**: Verify users can sign up without an invitation and get their own organization.

**Steps**:
1. Run Test 1 in the SQL file
2. Note the test email generated
3. Sign up using that email
4. Verify:
   - New organization was created
   - User has `superadmin` role
   - User is organization creator

**Expected Result**: ✅ User creates new organization with superadmin role

---

### Test 2: Invitation Acceptance
**Purpose**: Verify invited users are added to the correct organization.

**Steps**:
1. Run Test 2 in the SQL file
2. Note the invitation email
3. Sign up using that email
4. Verify:
   - User is added to "Test Organization"
   - User has `user` role (as specified in invitation)
   - Invitation status changed to `accepted`

**Expected Result**: ✅ User joins existing organization with specified role

---

### Test 3: Custom Role Assignment
**Purpose**: Verify custom roles are assigned correctly.

**Steps**:
1. Run Test 3 in the SQL file
2. Sign up using the generated email
3. Verify:
   - User has base role: `user`
   - User has custom role in `user_role_assignments` table
   - Custom role cleanup completed

**Expected Result**: ✅ User has both base role and custom role

---

### Test 4: Profile Verification
**Purpose**: Automated verification of profile creation.

**Steps**:
1. After any signup, run:
```sql
SELECT * FROM test_verify_profile(
  'user@example.com',  -- email
  'org-uuid-here',     -- expected org ID (optional)
  'user'::user_role    -- expected role (optional)
);
```

**Expected Result**: ✅ All checks pass

---

### Test 5: Multiple Invitations
**Purpose**: Verify the most recent invitation is used.

**Steps**:
1. Run Test 5 in the SQL file
2. Sign up using the generated email
3. Verify:
   - Most recent invitation (admin role) is used
   - Older invitation is ignored

**Expected Result**: ✅ Most recent invitation is used

---

### Test 6: Expired Invitation
**Purpose**: Verify expired invitations don't block signup.

**Steps**:
1. Run Test 6 in the SQL file
2. Sign up using the generated email
3. Verify:
   - User creates new organization (invitation expired)
   - User has `superadmin` role

**Expected Result**: ✅ Expired invitation is ignored, new org created

---

### Test 7: Performance Test
**Purpose**: Verify trigger executes quickly.

**Steps**:
1. Run:
```sql
SELECT * FROM test_trigger_performance();
```

**Expected Result**: ✅ All operations complete in < 100ms

---

## Manual Testing Checklist

### Regular Signup Flow
- [ ] User can sign up without invitation
- [ ] New organization is created
- [ ] User is assigned superadmin role
- [ ] User is marked as organization creator
- [ ] Profile is created with correct details

### Invited User Flow
- [ ] Admin can create invitation
- [ ] Invitation email is sent (if email service configured)
- [ ] User can sign up with invited email
- [ ] User is added to correct organization
- [ ] User gets specified role from invitation
- [ ] Invitation status updates to "accepted"
- [ ] Custom roles are assigned (if any)

### Error Scenarios
- [ ] Expired invitations are ignored
- [ ] Invalid invitations don't block signup
- [ ] Missing organization_id in invitation doesn't crash
- [ ] Signup completes even if custom role processing fails

### Performance
- [ ] Signup completes in < 5 seconds
- [ ] No 504 timeout errors
- [ ] Database queries are fast (< 100ms)

## Verification Queries

### Check if user was created correctly:
```sql
SELECT 
  u.email,
  p.organization_id,
  o.name as organization_name,
  p.role,
  p.is_organization_creator,
  i.status as invitation_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
LEFT JOIN public.invitations i ON i.email = u.email
WHERE u.email = 'test@example.com';
```

### Check custom roles:
```sql
SELECT 
  u.email,
  ura.role_name,
  ura.organization_id
FROM auth.users u
JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.user_role_assignments ura ON ura.user_id = u.id
WHERE u.email = 'test@example.com';
```

### Check invitation status:
```sql
SELECT 
  email,
  status,
  organization_id,
  role,
  expires_at,
  created_at
FROM public.invitations
WHERE email = 'test@example.com'
ORDER BY created_at DESC;
```

## Cleanup

After testing, clean up test data:

```sql
SELECT cleanup_test_data();
```

Or manually:
```sql
-- Delete test invitations
DELETE FROM invitations WHERE email LIKE '%@test.com';

-- Delete test users (be careful!)
-- DELETE FROM auth.users WHERE email LIKE '%@test.com';
```

## Troubleshooting

### Signup times out (504 error)
- Check if indexes are created: `\d+ invitations`
- Verify trigger function exists: `\df handle_new_user_with_invitation`
- Check for slow queries in Supabase logs

### User not added to organization
- Verify invitation exists and is pending
- Check invitation `organization_id` is not NULL
- Verify invitation hasn't expired
- Check trigger function executed (check logs)

### Custom roles not assigned
- Verify `invitation_custom_roles` table has entries
- Check `process_invitation_custom_roles` function exists
- Verify function didn't error (check warnings in logs)

### Profile not created
- Check RLS policies allow service role to insert
- Verify trigger is attached: `\d+ auth.users` (check triggers)
- Check for errors in Supabase logs
