-- Fix user_roles RLS policy with OR true vulnerability
-- Drop ALL existing policies on user_roles
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'user_roles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_roles', pol.policyname);
    END LOOP;
END $$;

-- Create separate read and write policies
CREATE POLICY "Users can view roles in their organization"
ON user_roles FOR SELECT
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Only admins can manage roles"
ON user_roles FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Only admins can update roles"
ON user_roles FOR UPDATE
USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Only admins can delete roles"
ON user_roles FOR DELETE
USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);