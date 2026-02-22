# Signup 504 Timeout - Diagnosis & Fix Guide

## Root Cause Analysis

Based on the logs and codebase analysis, the 504 Gateway Timeout on `/auth/v1/signup` is likely caused by:

1. **Database Trigger Performance**: The `on_auth_user_created` trigger performs:
   - A SELECT query on `invitations` table with `ORDER BY created_at DESC`
   - An UPDATE query using a subquery (inefficient)
   - These operations can take >10 seconds if the invitations table is large or indexes are suboptimal

2. **Email Provider (Resend)**: While configured, email confirmations are disabled (`enable_confirmations = false`), so this is NOT the issue.

3. **No Auth Webhooks**: No Edge Functions are configured to run during signup, so that's not the issue.

## Solution Options

### Option 1: Enhanced with Job Queue (Best Performance - Recommended)

**File**: `fix_signup_504_with_job_queue.sql`

**What it does**:
- All optimizations from Option 2
- **Plus**: Defers invitation updates to background job queue (non-blocking)
- Processes jobs via Edge Function or cron job
- Includes retry logic and error handling

**Expected performance**: <100ms for signups

**Steps**:
1. Run `fix_signup_504_with_job_queue.sql` in Supabase SQL Editor
2. Deploy Edge Function: `supabase functions deploy process-invitation-updates`
3. Set up cron job or call Edge Function periodically
4. Test signup

**See**: `fix_signup_504_with_job_queue_README.md` for full setup instructions

### Option 2: Optimized Trigger (Fast Synchronous)

**File**: `fix_signup_504_optimized.sql`

**What it does**:
- Removes `ORDER BY` (index handles ordering)
- Fetches invitation `id` in SELECT to enable direct PK update
- Uses single-row UPDATE by primary key (fastest)
- Comprehensive error handling

**Expected performance**: <200ms for most signups

**Steps**:
1. Run `diagnose_signup_504.sql` first to see current state
2. Run `fix_signup_504_optimized.sql` in Supabase SQL Editor
3. Test signup
4. If still timing out, proceed to Option 2

### Option 3: Minimal Trigger (Fallback)

**File**: `fix_signup_504_minimal.sql`

**What it does**:
- Creates ONLY the profile during signup (no invitation lookup)
- Defers invitation handling to onboarding flow
- Provides `accept_invitation_on_signup()` function to call from onboarding

**Expected performance**: <50ms

**Steps**:
1. Run `fix_signup_504_minimal.sql` in Supabase SQL Editor
2. Update your onboarding flow to call `accept_invitation_on_signup(user_id, email)` if needed
3. Test signup

## Quick Test

After applying either fix:

1. **Test signup** from your app
2. **Check logs** in Supabase Dashboard → Logs → Auth
3. **Verify profile creation**: 
   ```sql
   SELECT * FROM profiles ORDER BY created_at DESC LIMIT 1;
   ```

## Verification Queries

```sql
-- Check current trigger
SELECT tgname, proname, pg_get_triggerdef(oid) 
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid = 'auth.users'::regclass;

-- Check invitation table size
SELECT COUNT(*) as total, 
       COUNT(*) FILTER (WHERE status = 'pending' AND expires_at > now()) as pending
FROM invitations;

-- Test trigger performance (simulated)
EXPLAIN ANALYZE
SELECT id, organization_id, role::text
FROM invitations
WHERE email = 'test@example.com'
  AND status = 'pending'
  AND expires_at > now()
LIMIT 1;
```

## If Issues Persist

1. **Check Resend dashboard** for email delivery latency/errors
2. **Monitor database performance** in Supabase Dashboard
3. **Check for RLS policy issues** that might slow down inserts
4. **Consider database connection pooling** if you have many concurrent signups

## Files Created

- `diagnose_signup_504.sql` - Diagnostic queries
- `fix_signup_504_with_job_queue.sql` - Enhanced with job queue (best performance)
- `fix_signup_504_optimized.sql` - Optimized trigger (fast synchronous)
- `fix_signup_504_minimal.sql` - Minimal trigger (fallback)
- `supabase/functions/process-invitation-updates/index.ts` - Edge Function for job processing
- `fix_signup_504_with_job_queue_README.md` - Full setup guide for job queue version
