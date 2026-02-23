-- Security fix: Tighten RLS policies
-- M1: profiles INSERT - ensure user_id matches auth.uid()
-- M2: invitation_update_jobs - restrict to service_role only
-- M3: organizations UPDATE - restrict to org admins

-- M1: Fix profiles INSERT policy to prevent impersonation
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- M2: Restrict invitation_update_jobs to service_role
-- Drop any existing authenticated policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'invitation_update_jobs'
      AND roles @> ARRAY['authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON invitation_update_jobs', pol.policyname);
  END LOOP;
END $$;

-- M3: Fix organizations UPDATE to require admin role
DROP POLICY IF EXISTS "Organization members can update their org" ON organizations;
CREATE POLICY "Organization admins can update their org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );
