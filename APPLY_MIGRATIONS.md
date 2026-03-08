# Apply Calendar Migrations to Supabase

## Project ID

`zjbvnvydgsxqmmrrmvif`

## Method 1: Supabase Dashboard (Easiest)

1. Go to: https://app.supabase.com/project/zjbvnvydgsxqmmrrmvif/editor/sql

2. Run each migration file in order:
   - Go to "New Query"
   - Copy SQL from each migration file
   - Paste and click "Run"

### Migration Order:

1. ✅ `20260307000001_add_calendar_sharing.sql` - Team sharing, calendar colors
2. ✅ `20260307000002_add_recurring_event_instances.sql` - Recurring events
3. ✅ `20260307000003_add_event_invitations.sql` - RSVP system
4. ✅ `20260307000004_enhanced_reminders.sql` - Multi-channel notifications
5. ✅ `20260307000005_calendar_digest_emails.sql` - Digest system
6. ✅ `20260307000006_webhook_system.sql` - Webhooks with HMAC
7. ✅ `20260307000007_rest_api.sql` - API keys and request logs
8. ✅ `20260307000008_security_audit_logs.sql` - Security audit trail

## Method 2: Combined SQL File

A combined file has been created at:
`supabase/all_migrations_combined.sql`

**WARNING**: This is 21,740 lines. Run in chunks if needed.

## Method 3: Supabase CLI

```bash
# Login
npx supabase login

# Push migrations
npx supabase db push

# Or push specific migrations
npx supabase db push --include-all
```

## After Migrations

### 1. Regenerate TypeScript Types

```bash
npx supabase gen types typescript --project-id zjbvnvydgsxqmmrrmvif --schema public > src/integrations/supabase/types.ts
```

### 2. Deploy Edge Functions

```bash
npx supabase functions deploy
```

### 3. Set Environment Variables

Add to your `.env`:

```bash
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
```

### 4. Setup Cron Jobs

Run these SQL commands in Supabase SQL Editor:

```sql
-- Process reminders every minute
SELECT cron.schedule('process-reminders', '* * * * *', $$
  SELECT net.http_get('https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/process-multi-channel-reminders');
$$);

-- Send digests every hour
SELECT cron.schedule('send-digests', '0 * * * *', $$
  SELECT net.http_get('https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/send-calendar-digest');
$$);

-- Deliver webhooks every minute
SELECT cron.schedule('deliver-webhooks', '* * * * *', $$
  SELECT net.http_get('https://zjbvnvydgsxqmmrrmvif.supabase.co/functions/v1/deliver-webhooks');
$$);
```

## Verification

After applying migrations, verify tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'calendar_shares',
  'calendar_event_instances',
  'event_invitations',
  'user_notification_preferences',
  'reminder_templates',
  'reminder_queue',
  'calendar_digest_logs',
  'webhook_subscriptions',
  'webhook_deliveries',
  'api_keys',
  'api_request_logs',
  'security_audit_logs'
);
```

## Troubleshooting

**Error: "relation already exists"**

- Migration already applied, skip it

**Error: "permission denied"**

- Make sure you're using the `postgres` role or service role key

**Error: "function does not exist"**

- Run migrations in correct order (01 → 08)

## Need Help?

If you get stuck, you can:

1. Run migrations one at a time
2. Check Supabase logs in Dashboard → Database → Logs
3. Ask me for specific migration SQL
