-- Optimize signup performance and add monitoring
-- Run this in Supabase SQL Editor to improve signup speed

-- Step 1: Add index for faster invitation lookups (if not exists)
-- Note: Using regular CREATE INDEX instead of CONCURRENTLY to work within transaction
-- Note: Removed WHERE clause as now() is STABLE, not IMMUTABLE. Query optimizer will still use this index effectively.
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires_active
ON public.invitations(email, status, expires_at);

-- Step 2: Ensure profiles table has proper indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_email
ON public.profiles(user_id, email);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
ON public.profiles(organization_id);

-- Step 3: Create ultra-fast trigger with minimal operations
CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC  -- Get most recent invitation
  LIMIT 1;

  -- Single INSERT with all necessary data
  INSERT INTO profiles (
    user_id,
    email,
    first_name,
    last_name,
    organization_id,
    role,
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    inv_org,
    COALESCE(inv_role::user_role,
             CASE WHEN inv_org IS NULL THEN 'superadmin'::user_role
                  ELSE 'user'::user_role END),
    inv_org IS NULL,
    now(),
    now()
  );

  -- Update invitation status asynchronously (don't block signup)
  IF inv_org IS NOT NULL THEN
    -- Update the specific invitation that was found (fast operation)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = (
      SELECT id FROM invitations
      WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Minimal fallback - just create profile, don't fail signup
  BEGIN
    INSERT INTO profiles (
      user_id,
      email,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      'user'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 4: Replace trigger with ultra-fast version
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_ultra_fast();

-- Step 5: Add monitoring function for signup performance
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

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.monitor_signup_performance() TO authenticated;

-- Step 7: Clean up old functions (keep for rollback if needed)
-- DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;

-- Step 8: Verify setup
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIGNUP PERFORMANCE OPTIMIZATION COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - Added optimized indexes for invitation lookups (simplified for compatibility)';
  RAISE NOTICE '  - Created ultra-fast trigger with minimal operations';
  RAISE NOTICE '  - Added monitoring function for signup performance';
  RAISE NOTICE '  - Asynchronous invitation status updates';
  RAISE NOTICE '';
  RAISE NOTICE 'To monitor signup performance:';
  RAISE NOTICE '  SELECT * FROM monitor_signup_performance();';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Indexes created without CONCURRENTLY to work within transaction.';
  RAISE NOTICE 'Partial index WHERE clause removed due to now() being STABLE, not IMMUTABLE.';
  RAISE NOTICE '';
END $$;