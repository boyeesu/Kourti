-- Migration: Enhanced Multi-Channel Reminders (FIXED)
-- Created: 2026-03-07

-- 1. UPDATE EVENT_REMINDERS TABLE
ALTER TABLE IF EXISTS event_reminders 
ADD COLUMN IF NOT EXISTS notification_channels TEXT[] DEFAULT ARRAY['in_app'],
ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 2. USER NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
    enable_sms_notifications BOOLEAN NOT NULL DEFAULT false,
    enable_slack_notifications BOOLEAN NOT NULL DEFAULT false,
    enable_push_notifications BOOLEAN NOT NULL DEFAULT true,
    phone_number TEXT,
    slack_webhook_url TEXT,
    slack_user_id TEXT,
    default_reminder_minutes INTEGER[] DEFAULT ARRAY[15, 60],
    digest_email_frequency TEXT DEFAULT 'daily' CHECK (digest_email_frequency IN ('daily', 'weekly', 'never')),
    digest_email_time TIME DEFAULT '08:00:00',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone TEXT DEFAULT 'America/New_York',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- 3. RLS POLICIES (FIXED SYNTAX)
ALTER TABLE IF EXISTS user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_prefs_select_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_select_policy ON user_notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_insert_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_insert_policy ON user_notification_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_update_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_update_policy ON user_notification_preferences
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_delete_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_delete_policy ON user_notification_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- 4. REMINDER TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS reminder_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation', 'all')),
    reminder_minutes INTEGER NOT NULL,
    notification_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
    subject_template TEXT,
    body_template TEXT,
    sms_template TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. REMINDER QUEUE TABLE
CREATE TABLE IF NOT EXISTS reminder_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id UUID NOT NULL REFERENCES event_reminders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'slack', 'push')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'retrying')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_reminder_queue_status ON reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_reminder ON reminder_queue(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_retry ON reminder_queue(next_retry_at) WHERE status IN ('pending', 'retrying');

-- 7. TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION create_reminder_queue_entries()
RETURNS TRIGGER AS $$
DECLARE
    v_channel TEXT;
BEGIN
    FOREACH v_channel IN ARRAY NEW.notification_channels
    LOOP
        INSERT INTO reminder_queue (reminder_id, channel, status)
        VALUES (NEW.id, v_channel, 'pending')
        ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_reminder_queue ON event_reminders;
CREATE TRIGGER trg_create_reminder_queue
    AFTER INSERT ON event_reminders
    FOR EACH ROW
    WHEN (NEW.sent = false)
    EXECUTE FUNCTION create_reminder_queue_entries();
