# Event Reminders Cron Job Setup - Quick Guide

## ✅ Step 1: Function Deployed
The `process-event-reminders` function has been successfully deployed to your Supabase project.

**Project Reference**: `zjbvnvydgsxqmmrrmvif`

---

## 📋 Step 2: Run Migration (SQL Editor)

Since `supabase db push` had issues with earlier migrations, run this migration manually:

1. Go to **Supabase Dashboard** > **SQL Editor**
2. Copy and paste the SQL from: `supabase/migrations/20260110000000_setup_event_reminders_cron.sql`
3. Click **Run**

This will:
- Enable `pg_net` and `pg_cron` extensions
- Create the `call_process_event_reminders()` helper function
- Create the `event_reminders_status` monitoring view
- Attempt to schedule the cron job (may need manual setup)

---

## ⚙️ Step 3: Set Up Cron Job (Dashboard - Option A)

### Method 1: Using the Helper Function (Easier)

1. Go to **Supabase Dashboard** > **Database** > **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: `process-event-reminders`
   - **Schedule**: `* * * * *` (every minute)
   - **Command**: 
     ```sql
     SELECT call_process_event_reminders();
     ```
   - **Enabled**: ✅
   - Click **Create**

### Method 2: Direct HTTP Call (If helper function doesn't work)

1. Go to **Supabase Dashboard** > **Database** > **Cron Jobs**
2. Click **Create a new cron job**
3. Configure:
   - **Name**: `process-event-reminders`
   - **Schedule**: `* * * * *` (every minute)
   - **Command**: 
     ```sql
     SELECT net.http_post(
       url := 'https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/process-event-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
       ),
       body := '{}'::jsonb
     );
     ```
   - **Enabled**: ✅
   - Click **Create**

**Note**: You may need to set the service role key as a database setting first:
```sql
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### Method 3: Using Environment Variable (Alternative)

If the above doesn't work, you can hardcode the service role key (less secure but works):

```sql
SELECT net.http_post(
  url := 'https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/process-event-reminders',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
  ),
  body := '{}'::jsonb
);
```

---

## 🧪 Step 4: Test the Setup

### Test the Function Directly:
1. Go to **Edge Functions** > **process-event-reminders**
2. Click **Invoke function**
3. Body: `{}`
4. Check the response - should show `{"success": true, "processed": 0, ...}`

### Test the Cron Job:
1. Go to **Database** > **Cron Jobs**
2. Find `process-event-reminders`
3. Click the **three dots** menu
4. Select **Run now** (if available)
5. Check the logs

### Check Status:
```sql
-- View reminder status
SELECT * FROM event_reminders_status;

-- View recent reminders
SELECT 
  er.id,
  er.sent,
  er.sent_at,
  ce.title,
  ce.start_date,
  er.reminder_minutes,
  er.reminder_type
FROM event_reminders er
JOIN calendar_events ce ON ce.id = er.event_id
ORDER BY ce.start_date DESC
LIMIT 10;
```

---

## ✅ Verification

After setup, verify:
- [ ] Function is deployed (check Edge Functions list)
- [ ] Migration ran successfully (check SQL Editor history)
- [ ] Cron job is created and enabled (check Cron Jobs list)
- [ ] Test function invocation works
- [ ] Create a test event with reminder 1-2 minutes from now
- [ ] Wait and verify notification is sent

---

## 🔍 Troubleshooting

### Cron Job Not Running
- Check if `pg_cron` extension is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron';`
- Verify cron job exists: `SELECT * FROM cron.job WHERE jobname = 'process-event-reminders';`
- Check cron job history: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`

### Function Not Being Called
- Verify function URL is correct (use your project ref: `zjbvnvydgsxqmmrrmvif`)
- Check service role key is set correctly
- Test function manually via Dashboard first

### Reminders Not Sending
- Check if reminders are due: Query `event_reminders_status` view
- Check function logs in Edge Functions dashboard
- Verify email function is working separately

---

## 📝 Quick Reference

**Function URL**: `https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/process-event-reminders`

**Cron Schedule**: `* * * * *` (every minute)

**Monitoring View**: `SELECT * FROM event_reminders_status;`
