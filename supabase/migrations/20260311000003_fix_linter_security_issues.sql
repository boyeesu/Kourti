-- Migration: Fix 8 security issues from Supabase database linter
--
-- 1. auth_users_exposed: calendar_shares_with_users exposes auth.users to anon
-- 2. auth_users_exposed: event_invitations_with_details exposes auth.users to anon
-- 3. policy_exists_rls_disabled: reminder_templates has policies but RLS disabled
-- 4. security_definer_view: event_invitations_with_details
-- 5. security_definer_view: event_reminders_status
-- 6. security_definer_view: calendar_shares_with_users
-- 7. rls_disabled_in_public: reminder_templates
-- 8. rls_disabled_in_public: reminder_queue

-- =============================================================================
-- FIX 1, 6: calendar_shares_with_users
-- - Replace auth.users JOINs with profiles (has email synced via trigger)
-- - Add security_invoker = true
-- - Revoke anon access
-- NOTE: DROP + CREATE required because profiles.email is text while
--       auth.users.email is varchar(255) — CREATE OR REPLACE cannot change
--       column data types on an existing view.
-- =============================================================================

DROP VIEW IF EXISTS public.calendar_shares_with_users;
CREATE VIEW public.calendar_shares_with_users
WITH (security_invoker = true)
AS
SELECT
    cs.*,
    owner_p.email as owner_email,
    COALESCE(owner_p.first_name || ' ' || owner_p.last_name, owner_p.email) as owner_name,
    COALESCE(owner_p.calendar_color, '#3b82f6') as owner_color,
    shared_p.email as shared_with_email,
    COALESCE(shared_p.first_name || ' ' || shared_p.last_name, shared_p.email) as shared_with_name
FROM calendar_shares cs
JOIN profiles owner_p ON owner_p.user_id = cs.calendar_owner_id
JOIN profiles shared_p ON shared_p.user_id = cs.shared_with_user_id;

REVOKE ALL ON public.calendar_shares_with_users FROM anon;
GRANT SELECT ON public.calendar_shares_with_users TO authenticated;

-- =============================================================================
-- FIX 2, 4: event_invitations_with_details
-- - Replace auth.users JOIN with profiles
-- - Add security_invoker = true
-- - Revoke anon access
-- NOTE: DROP + CREATE required for same varchar->text type change reason.
-- =============================================================================

DROP VIEW IF EXISTS public.event_invitations_with_details;
CREATE VIEW public.event_invitations_with_details
WITH (security_invoker = true)
AS
SELECT
    ei.*,
    ce.title as event_title,
    ce.start_date as event_start,
    ce.end_date as event_end,
    ce.location as event_location,
    ce.description as event_description,
    ce.event_type,
    p.email as inviter_email,
    COALESCE(p.first_name || ' ' || p.last_name, p.email) as inviter_name
FROM event_invitations ei
JOIN calendar_events ce ON ce.id = ei.event_id
JOIN profiles p ON p.user_id = ei.invited_by;

REVOKE ALL ON public.event_invitations_with_details FROM anon;
GRANT SELECT ON public.event_invitations_with_details TO authenticated;

-- =============================================================================
-- FIX 5: event_reminders_status
-- - Add security_invoker = true (previous fix in 20260111000020 was overwritten
--   by the later 20260308000001 migration which recreated without it)
-- - Revoke anon access
-- NOTE: DROP + CREATE required to change view options (security_invoker).
-- =============================================================================

DROP VIEW IF EXISTS public.event_reminders_status;
CREATE VIEW public.event_reminders_status
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE sent = false) as pending_count,
  COUNT(*) FILTER (WHERE sent = true) as sent_count,
  COUNT(*) FILTER (WHERE sent = false AND
    (reminder_type = 'before' AND
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) -
     (reminder_minutes || ' minutes')::interval <= now() + interval '1 minute') OR
    (reminder_type = 'at' AND
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) <= now() + interval '1 minute')
  ) as due_count
FROM event_reminders;

REVOKE ALL ON public.event_reminders_status FROM anon;
GRANT SELECT ON public.event_reminders_status TO authenticated;

-- =============================================================================
-- FIX 3, 7: Enable RLS on reminder_templates
-- RLS policies already exist from 20260310100000 and 20260311000000 but
-- the ENABLE may not have been applied yet.
-- =============================================================================

ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- FIX 8: Enable RLS on reminder_queue
-- This is an internal processing table used only by cron jobs/edge functions
-- via service_role. The previous fix (20260310100000) had a broken policy
-- referencing a non-existent user_id column. Fix: service_role only access.
-- =============================================================================

ALTER TABLE public.reminder_queue ENABLE ROW LEVEL SECURITY;

-- Drop the broken policy that references non-existent user_id column
DROP POLICY IF EXISTS "reminder_queue_select_own" ON public.reminder_queue;

-- Service role has full access (used by cron jobs and edge functions)
DROP POLICY IF EXISTS "reminder_queue_service_role" ON public.reminder_queue;
CREATE POLICY "reminder_queue_service_role" ON public.reminder_queue
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
