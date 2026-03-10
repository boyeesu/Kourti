-- ============================================================================
-- Migration: Backfill user_role_assignments from profiles.role
-- Date: 2026-03-11
-- Description: Ensure every user has a user_role_assignments row so the
--              has_permission() fallback to profiles.role is never needed.
--
-- This is safe to run multiple times — ON CONFLICT DO NOTHING.
-- ============================================================================

INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
SELECT
  p.user_id,
  p.role::text,
  p.organization_id,
  p.user_id  -- self-assigned (backfill)
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
  AND p.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p.user_id
      AND ura.organization_id = p.organization_id
  )
ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

-- Report how many were backfilled
DO $$
DECLARE
  v_total integer;
  v_with_assignments integer;
  v_without integer;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.profiles WHERE organization_id IS NOT NULL;

  SELECT COUNT(DISTINCT user_id) INTO v_with_assignments
  FROM public.user_role_assignments;

  v_without := v_total - v_with_assignments;

  RAISE NOTICE '';
  RAISE NOTICE '=== user_role_assignments Backfill ===';
  RAISE NOTICE 'Total users with organizations: %', v_total;
  RAISE NOTICE 'Users with role assignments: %', v_with_assignments;
  RAISE NOTICE 'Users still missing assignments: % (should be 0)', v_without;
  RAISE NOTICE '';
END $$;
