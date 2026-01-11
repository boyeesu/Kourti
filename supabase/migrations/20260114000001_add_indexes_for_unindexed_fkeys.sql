-- Migration: Add indexes for unindexed foreign keys
-- Generated from Supabase database linter results
--
-- These foreign keys were identified as missing covering indexes:
--   1. invitation_update_jobs.invitation_id (FK: invitation_update_jobs_invitation_id_fkey)
--   2. profiles.approved_by (FK: profiles_approved_by_fkey)
--
-- FK indexes are essential for:
--   - Efficient JOIN operations
--   - Fast CASCADE DELETE/UPDATE operations
--   - Avoiding sequential scans on FK constraint checks

-- Add index for invitation_update_jobs.invitation_id
-- This FK references invitations(id) with ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_invitation_update_jobs_invitation_id
  ON public.invitation_update_jobs(invitation_id);

-- Add index for profiles.approved_by
-- This FK references auth.users(id)
CREATE INDEX IF NOT EXISTS idx_profiles_approved_by
  ON public.profiles(approved_by);
