-- Create indexes concurrently (run this separately, not in migration)
-- This script should be run manually in Supabase SQL Editor when no active transactions
-- and minimal load on the database

-- Safe concurrent index creation (no table locks)
-- Note: Partial index with WHERE clause removed due to now() being STABLE, not IMMUTABLE
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invitations_email_status_expires_active
ON public.invitations(email, status, expires_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_user_id_email
ON public.profiles(user_id, email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_organization_id
ON public.profiles(organization_id);

-- Verify indexes were created
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;