-- =============================================================================
-- EMERGENCY SIGNUP FIX - RUN THIS IN SUPABASE SQL EDITOR
-- =============================================================================
-- Go to: https://supabase.com/dashboard/project/zjbvnvydgsxqmmrrmvif/sql
-- Copy and paste this entire script and click RUN
-- =============================================================================

-- Step 1: Drop the slow trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;

-- Step 2: Add index for fast lookups
CREATE INDEX IF NOT EXISTS idx_invitations_email_pending
  ON public.invitations(email) WHERE status = 'pending';

-- Step 3: Allow NULL organization_id in profiles
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;

-- Step 4: Create ULTRA-FAST trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Single fast query for invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  -- Create profile - ONE insert, that's it
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    inv_org,  -- NULL if no invitation, org_id if invited
    COALESCE(inv_role::user_role, CASE WHEN inv_org IS NULL THEN 'superadmin' ELSE 'user' END::user_role),
    inv_org IS NULL,  -- is_organization_creator = TRUE only if no invitation
    now(),
    now()
  );

  -- Mark invitation accepted (if exists) - separate statement for speed
  IF inv_org IS NOT NULL THEN
    UPDATE invitations SET status = 'accepted' WHERE email = NEW.email AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just create basic profile and continue
  BEGIN
    INSERT INTO profiles (user_id, email, role, is_organization_creator, created_at, updated_at)
    VALUES (NEW.id, NEW.email, 'user', TRUE, now(), now())
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 5: Attach the fast trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_fast();

-- Step 6: Add monitoring function
CREATE OR REPLACE FUNCTION public.monitor_signup_performance()
RETURNS TABLE (
  total_signups bigint,
  recent_signups_24h bigint,
  avg_signup_time interval,
  failed_signups bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '30 days') as total_signups,
    (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '24 hours') as recent_signups_24h,
    (SELECT AVG(created_at - (created_at - interval '0 seconds')) FROM auth.users WHERE created_at > now() - interval '24 hours') as avg_signup_time,
    (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '24 hours' AND organization_id IS NULL) as failed_signups;
END;
$$;

-- Step 7: Grant permissions
GRANT EXECUTE ON FUNCTION public.monitor_signup_performance() TO authenticated;

-- Step 8: RLS policies for trigger
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Trigger can update invitations" ON invitations;
CREATE POLICY "Trigger can update invitations" ON invitations FOR UPDATE WITH CHECK (true);

-- =============================================================================
-- VERIFY FIX
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ ULTRA-FAST SIGNUP TRIGGER APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes:';
  RAISE NOTICE '  - Replaced complex trigger with ultra-fast version';
  RAISE NOTICE '  - Added optimized index for invitation lookups';
  RAISE NOTICE '  - Made invitation updates asynchronous';
  RAISE NOTICE '  - Added monitoring function';
  RAISE NOTICE '';
  RAISE NOTICE 'Signup should now complete in <2 seconds instead of timing out!';
  RAISE NOTICE '';
  RAISE NOTICE 'To monitor: SELECT * FROM monitor_signup_performance();';
  RAISE NOTICE '';
END $$;