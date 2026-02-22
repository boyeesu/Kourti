# 🚀 EMERGENCY SIGNUP FIX

## The Problem
Signup requests are timing out with 504 Gateway Timeout errors. The database trigger is doing too much work synchronously, causing 35+ second delays.

## The Solution
Ultra-fast trigger that does minimal work during signup and handles invitation logic asynchronously.

## How to Fix (2 minutes)

### Step 1: Open Supabase SQL Editor
Go to: https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql

### Step 2: Run the Fix
1. Open the `apply_signup_fix.sql` file in your editor
2. Copy the entire contents
3. Paste it into the Supabase SQL Editor
4. Click **"RUN"**

### Step 3: Test Signup
Try signing up again. It should complete in under 2 seconds instead of timing out.

### Step 4: Monitor Performance
Run this query to check signup performance:
```sql
SELECT * FROM monitor_signup_performance();
```

## What the Fix Does
- **Replaces slow trigger** with ultra-fast version
- **Minimal synchronous work** - just one INSERT statement
- **Async invitation updates** - happen after signup completes
- **Optimized indexes** - faster database lookups
- **Fallback handling** - creates basic profile even if trigger fails

## Expected Results
- ✅ Signup completes in <2 seconds
- ✅ No more 504 timeouts
- ✅ Invited users get proper profiles
- ✅ New users can complete onboarding separately
- ✅ All existing functionality preserved

## If Still Failing
If signup still fails after applying this fix, check:
1. Browser network tab for exact error
2. Supabase dashboard logs
3. Try a different email/domain

The trigger now does the absolute minimum work needed during signup to prevent timeouts.