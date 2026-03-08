-- Migration: Calendar Digest Emails (FIXED)
-- Created: 2026-03-07

-- 1. DIGEST LOGS TABLE
CREATE TABLE IF NOT EXISTS calendar_digest_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    digest_type TEXT NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    email_error TEXT,
    events_included INTEGER NOT NULL DEFAULT 0,
    events_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_logs_user ON calendar_digest_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_logs_date ON calendar_digest_logs(period_start_date);
CREATE INDEX IF NOT EXISTS idx_digest_logs_sent ON calendar_digest_logs(email_sent) WHERE email_sent = false;

-- 2. FUNCTIONS
CREATE OR REPLACE FUNCTION get_users_for_digest(p_digest_type TEXT, p_current_time TIME DEFAULT CURRENT_TIME)
RETURNS TABLE (user_id UUID, email TEXT, organization_id UUID, digest_time TIME, timezone TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        unp.user_id,
        u.email,
        unp.organization_id,
        unp.digest_email_time,
        unp.quiet_hours_timezone
    FROM user_notification_preferences unp
    JOIN auth.users u ON u.id = unp.user_id
    WHERE unp.digest_email_frequency = p_digest_type
    AND unp.enable_email_notifications = true
    AND (
        (p_digest_type = 'daily' AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
        OR 
        (p_digest_type = 'weekly' AND EXTRACT(DOW FROM CURRENT_DATE) = 0 AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_upcoming_events_for_digest(p_user_id UUID, p_organization_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS TABLE (event_id UUID, title TEXT, description TEXT, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, location TEXT, event_type TEXT, is_recurring BOOLEAN, created_by_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.id as event_id,
        ce.title,
        ce.description,
        ce.start_date,
        ce.end_date,
        ce.location,
        ce.event_type,
        ce.is_recurring,
        COALESCE(p.first_name || ' ' || p.last_name, u.email) as created_by_name
    FROM calendar_events ce
    LEFT JOIN profiles p ON p.user_id = ce.created_by
    LEFT JOIN auth.users u ON u.id = ce.created_by
    WHERE ce.organization_id = p_organization_id
    AND ce.start_date >= p_start_date::timestamptz
    AND ce.start_date < (p_end_date + INTERVAL '1 day')::timestamptz
    AND (
        ce.created_by = p_user_id
        OR ce.attendees @> ARRAY[(SELECT email FROM auth.users WHERE id = p_user_id)]
        OR EXISTS (
            SELECT 1 FROM calendar_shares cs
            WHERE cs.calendar_owner_id = ce.created_by
            AND cs.shared_with_user_id = p_user_id
            AND cs.is_active = true
        )
    )
    AND NOT ce.is_recurring
    ORDER BY ce.start_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS POLICIES (FIXED)
ALTER TABLE IF EXISTS calendar_digest_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_digest_logs_select_policy ON calendar_digest_logs;
CREATE POLICY calendar_digest_logs_select_policy ON calendar_digest_logs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_digest_logs_insert_policy ON calendar_digest_logs;
CREATE POLICY calendar_digest_logs_insert_policy ON calendar_digest_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
