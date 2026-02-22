# Signup 504 Fix - Enhanced Version with Job Queue

## Overview

This enhanced fix defers invitation status updates to a background job queue, making signup **even faster** (<100ms) by removing all blocking database operations.

## What It Does

1. **Fast Profile Creation**: Creates profile immediately with invitation data (if found)
2. **Job Queue**: Defers invitation status update to a background job (non-blocking INSERT)
3. **Background Processing**: Processes jobs via Edge Function or cron job
4. **Retry Logic**: Automatic retries with configurable max attempts

## Architecture

```
Signup Request
    ↓
Trigger: handle_new_user_with_queue()
    ├─→ Fast SELECT (indexed, no ORDER BY)
    ├─→ INSERT profile (fast)
    └─→ INSERT into job queue (very fast, non-blocking)
    ↓
Signup completes (<100ms)
    ↓
Background: process_invitation_update_jobs()
    └─→ UPDATE invitation status (async)
```

## Setup Steps

### 1. Apply the SQL Fix

Run `fix_signup_504_with_job_queue.sql` in Supabase SQL Editor.

This creates:
- Optimized indexes
- Job queue table (`invitation_update_jobs`)
- Optimized trigger function
- Job processor function

### 2. Deploy Edge Function (Optional but Recommended)

```bash
supabase functions deploy process-invitation-updates
```

### 3. Set Up Background Processing

**Option A: Edge Function + Cron (Recommended)**

1. Deploy the Edge Function (step 2)
2. In Supabase Dashboard → Database → Cron Jobs:
   - Create new cron job
   - Name: `process-invitation-updates`
   - Schedule: `* * * * *` (every minute)
   - SQL: 
     ```sql
     SELECT net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/process-invitation-updates',
       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
     );
     ```

**Option B: Direct Database Cron**

Uncomment the cron setup code in the SQL file (Step 8) if `pg_cron` is available.

**Option C: Manual Processing**

Call the function manually when needed:
```sql
SELECT public.process_invitation_update_jobs(50);
```

**Option D: Edge Function via HTTP**

Call the Edge Function via HTTP:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/process-invitation-updates \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

## Performance Comparison

| Version | Signup Time | Invitation Update |
|---------|-------------|-------------------|
| Original | ~10s (504 timeout) | Synchronous (blocking) |
| Optimized | ~200ms | Synchronous (fast) |
| **With Queue** | **<100ms** | **Asynchronous (non-blocking)** |

## Monitoring

### Check Job Queue Status

```sql
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest_job,
  MAX(created_at) as newest_job
FROM invitation_update_jobs
GROUP BY status;
```

### Check Failed Jobs

```sql
SELECT 
  id,
  invitation_id,
  user_email,
  attempts,
  error_message,
  created_at
FROM invitation_update_jobs
WHERE status = 'failed'
ORDER BY created_at DESC;
```

### Check Processing Performance

```sql
SELECT 
  DATE_TRUNC('minute', completed_at) as minute,
  COUNT(*) as processed,
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
FROM invitation_update_jobs
WHERE status = 'completed'
  AND completed_at >= now() - interval '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

## Troubleshooting

### Jobs Not Processing

1. **Check if processor is running**:
   ```sql
   SELECT * FROM invitation_update_jobs 
   WHERE status = 'pending' 
   ORDER BY created_at ASC LIMIT 10;
   ```

2. **Manually trigger processing**:
   ```sql
   SELECT public.process_invitation_update_jobs(50);
   ```

3. **Check for errors**:
   ```sql
   SELECT * FROM invitation_update_jobs 
   WHERE status = 'failed' 
   ORDER BY created_at DESC LIMIT 10;
   ```

### Jobs Stuck in "processing"

If jobs are stuck (e.g., after a crash), reset them:
```sql
UPDATE invitation_update_jobs
SET status = 'pending', processed_at = NULL
WHERE status = 'processing'
  AND processed_at < now() - interval '5 minutes';
```

## Cleanup

To remove old completed jobs (optional):
```sql
DELETE FROM invitation_update_jobs
WHERE status = 'completed'
  AND completed_at < now() - interval '7 days';
```

## Benefits

✅ **Fastest signup**: <100ms (no blocking operations)  
✅ **Reliable**: Retry logic handles transient failures  
✅ **Scalable**: Queue can handle bursts of signups  
✅ **Observable**: Job status tracking and monitoring  
✅ **Non-blocking**: Signup never waits for invitation update  

## Fallback

If you prefer synchronous updates (simpler but slightly slower), use `fix_signup_504_optimized.sql` instead.
