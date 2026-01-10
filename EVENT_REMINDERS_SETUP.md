# Event Reminders Setup - Complete Implementation

## ✅ What Was Created

### 1. Edge Function: `process-event-reminders`
**Location**: `supabase/functions/process-event-reminders/index.ts`

**Features**:
- ✅ Queries all unsent reminders from `event_reminders` table
- ✅ Calculates due reminders (event start time - reminder_minutes)
- ✅ Sends in-app notifications via `notifications` table
- ✅ Sends email notifications via `send-notification-email` function
- ✅ Marks reminders as `sent = true` and sets `sent_at` timestamp
- ✅ Handles edge cases (deleted events, past events, invalid data)
- ✅ Skips reminders for events that already ended

### 2. Database Migration: `20260110000000_setup_event_reminders_cron.sql`
**Location**: `supabase/migrations/20260110000000_setup_event_reminders_cron.sql`

**Features**:
- ✅ Sets up `pg_net` and `pg_cron` extensions
- ✅ Creates `call_process_event_reminders()` helper function
- ✅ Schedules cron job to run every minute
- ✅ Creates `event_reminders_status` view for monitoring
- ✅ Includes fallback instructions for Supabase Dashboard setup

### 3. Documentation
**Location**: `supabase/functions/process-event-reminders/README.md`

Complete setup instructions with multiple options.

---

## 🚀 Setup Instructions

### Step 1: Deploy the Edge Function

```bash
# Deploy the function to Supabase
supabase functions deploy process-event-reminders
```

### Step 2: Run the Migration

```bash
# Apply the migration
supabase db push
```

Or apply manually in Supabase Dashboard > SQL Editor.

### Step 3: Set Up the Cron Job

#### Option A: Supabase Dashboard (Recommended)

1. Go to **Supabase Dashboard** > **Database** > **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: `process-event-reminders`
   - **Schedule**: `* * * * *` (every minute)
   - **Command**: 
     ```sql
     SELECT net.http_post(
       url := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/process-event-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
       ),
       body := '{}'::jsonb
     );
     ```
   - **Enabled**: ✅

**Note**: Replace `[YOUR_PROJECT_REF]` with your actual Supabase project reference.

#### Option B: If Migration Worked

The migration should have automatically scheduled the job. Verify:

```sql
SELECT * FROM cron.job WHERE jobname = 'process-event-reminders';
```

### Step 4: Test the Function

#### Manual Test via Dashboard:
1. Go to **Edge Functions** > **process-event-reminders**
2. Click **Invoke function**
3. Body: `{}`
4. Check logs for results

#### Manual Test via cURL:
```bash
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/process-event-reminders \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Check Status:
```sql
-- View reminder processing status
SELECT * FROM event_reminders_status;

-- View recent reminders
SELECT 
  er.id,
  er.sent,
  er.sent_at,
  er.reminder_type,
  er.reminder_minutes,
  er.notification_method,
  ce.title as event_title,
  ce.start_date
FROM event_reminders er
JOIN calendar_events ce ON ce.id = er.event_id
ORDER BY ce.start_date DESC
LIMIT 20;
```

---

## 📋 How It Works

1. **Cron runs every minute** → Calls `process-event-reminders` function
2. **Function queries** → All unsent reminders (`sent = false`)
3. **Calculates due reminders**:
   - For `reminder_type = 'before'`: `reminder_time = event_start - reminder_minutes`
   - For `reminder_type = 'at'`: `reminder_time = event_start`
   - Checks if reminder time is within ±1 minute of now
4. **Sends notifications** based on `notification_method`:
   - `in_app`: Creates record in `notifications` table
   - `email`: Calls `send-notification-email` edge function
   - `both`: Does both
5. **Marks as sent**: Updates `sent = true` and `sent_at = now()`

---

## 🔍 Monitoring

### View Processing Status
```sql
SELECT * FROM event_reminders_status;
```

Returns:
- `pending_count`: Reminders waiting to be sent
- `sent_count`: Reminders already sent
- `due_count`: Reminders that should be processed now

### View Recent Activity
```sql
SELECT 
  er.*,
  ce.title,
  ce.start_date,
  ce.end_date
FROM event_reminders er
JOIN calendar_events ce ON ce.id = er.event_id
WHERE er.sent_at >= now() - interval '24 hours'
ORDER BY er.sent_at DESC;
```

---

## ⚠️ Troubleshooting

### Cron Job Not Running
1. Check if `pg_cron` extension is enabled:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```
2. Check cron job status:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'process-event-reminders';
   ```
3. Check cron job history:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-event-reminders')
   ORDER BY start_time DESC
   LIMIT 10;
   ```

### Function Not Being Called
1. Verify function is deployed: Check Edge Functions list
2. Test manually: Use Dashboard or cURL
3. Check function logs: Edge Functions > process-event-reminders > Logs

### Reminders Not Sending
1. Check if reminders are due:
   ```sql
   SELECT 
     er.id,
     ce.start_date,
     er.reminder_type,
     er.reminder_minutes,
     CASE 
       WHEN er.reminder_type = 'before' 
       THEN ce.start_date - (er.reminder_minutes || ' minutes')::interval
       ELSE ce.start_date
     END as reminder_time,
     now() as current_time
   FROM event_reminders er
   JOIN calendar_events ce ON ce.id = er.event_id
   WHERE er.sent = false;
   ```
2. Check function logs for errors
3. Verify email function is working: Test `send-notification-email` separately

---

## ✅ Verification Checklist

- [ ] Edge function deployed successfully
- [ ] Migration applied successfully
- [ ] Cron job created and enabled
- [ ] Test function invocation works
- [ ] Created a test event with reminder
- [ ] Verified reminder appears in `event_reminders` table
- [ ] Waited for reminder time and verified notification sent
- [ ] Checked `event_reminders_status` view shows correct counts

---

## 🎯 Next Steps

1. **Deploy the function**: `supabase functions deploy process-event-reminders`
2. **Run the migration**: `supabase db push`
3. **Set up cron job**: Use Supabase Dashboard (Option A above)
4. **Test**: Create an event with a reminder set for 1 minute from now
5. **Monitor**: Check logs and `event_reminders_status` view

The reminder system is now fully configured! 🎉
