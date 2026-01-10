# Process Event Reminders Function

This edge function processes calendar event reminders and sends notifications.

## What it does

1. **Queries unsent reminders** from the `event_reminders` table
2. **Calculates due reminders** by comparing reminder time (event start - reminder_minutes) with current time
3. **Sends in-app notifications** via the `notifications` table
4. **Sends email notifications** via the `send-notification-email` edge function
5. **Marks reminders as sent** by updating `sent = true` and `sent_at = now()`

## Setup Instructions

### Option 1: Supabase Dashboard (Recommended for Supabase Cloud)

1. Go to your Supabase Dashboard
2. Navigate to **Database** > **Cron Jobs**
3. Click **Create a new cron job**
4. Configure:
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

### Option 2: Using pg_cron Extension (Self-hosted)

If you have pg_cron enabled, you can use the SQL migration:

```sql
SELECT cron.schedule(
  'process-event-reminders',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/process-event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [SERVICE_ROLE_KEY]'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Option 3: External Cron Service

You can also use an external cron service (like GitHub Actions, Vercel Cron, etc.) to call:

```bash
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/process-event-reminders \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json"
```

## How it works

1. **Runs every minute** (configurable)
2. **Finds due reminders** within a 1-minute window (accounts for cron timing)
3. **Sends notifications** based on `notification_method`:
   - `in_app`: Creates notification in database
   - `email`: Calls send-notification-email function
   - `both`: Does both
4. **Updates reminder status** to prevent duplicate sends

## Testing

You can manually trigger the function:

```bash
curl -X POST https://[YOUR_PROJECT_REF].supabase.co/functions/v1/process-event-reminders \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]" \
  -H "Content-Type: application/json"
```

Or via Supabase Dashboard:
1. Go to **Edge Functions** > **process-event-reminders**
2. Click **Invoke function**
3. Use empty body: `{}`

## Response Format

```json
{
  "success": true,
  "processed": 5,
  "totalDue": 5,
  "totalChecked": 10,
  "processedIds": ["id1", "id2", ...],
  "errors": [] // Only present if errors occurred
}
```

## Notes

- Reminders are checked with a 1-minute buffer to account for cron timing
- Each reminder is only sent once (marked as `sent = true`)
- Failed notifications are logged but don't prevent marking as sent
- The function respects user notification preferences (handled by send-notification-email)
