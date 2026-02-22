-- Fix and improve RLS policies across all tables

-- 1. Fix time_entries table - add missing columns and RLS policies
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Enable RLS on time_entries if not already enabled
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for time_entries
CREATE POLICY "Users can create time entries in their organization" ON time_entries
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can view time entries in their organization" ON time_entries
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
FOR UPDATE USING (
  user_id = auth.uid() OR (
    organization_id = get_current_user_organization_id() AND is_user_admin()
  )
);

CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
FOR DELETE USING (
  user_id = auth.uid() OR (
    organization_id = get_current_user_organization_id() AND is_user_admin()
  )
);

-- 2. Clean up duplicate/overlapping policies on case_types
DROP POLICY IF EXISTS "Case types can be created by organization members" ON case_types;
DROP POLICY IF EXISTS "Case types can be updated by organization members" ON case_types;
DROP POLICY IF EXISTS "Case types visible to organization" ON case_types;

-- Keep the more comprehensive policies that handle both global and org-specific types
-- The existing "Users can view case types" and "Only superadmins can manage case types" policies are sufficient

-- 3. Simplify cases table policies - remove redundant user-based policies since org-based covers it
DROP POLICY IF EXISTS "Users can create their own cases" ON cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON cases;
DROP POLICY IF EXISTS "Users can view their own cases" ON cases;

-- 4. Simplify clients table policies - same logic
DROP POLICY IF EXISTS "Users can create their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;

-- 5. Add missing INSERT policy for profiles (for user registration)
CREATE POLICY "Service role can insert profiles" ON profiles
FOR INSERT WITH CHECK (true);
-- This allows the trigger function to insert new profiles when users sign up

-- 6. Add policy for organizations INSERT (for new user registration)
CREATE POLICY "Service role can insert organizations" ON organizations
FOR INSERT WITH CHECK (true);
-- This allows the trigger function to create organizations for new users

-- 7. Improve communication_logs policies - add missing UPDATE/DELETE for admins
CREATE POLICY "Admins can update comm logs in their organization" ON communication_logs
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() AND is_user_admin()
);

CREATE POLICY "Admins can delete comm logs in their organization" ON communication_logs
FOR DELETE USING (
  organization_id = get_current_user_organization_id() AND is_user_admin()
);

-- 8. Add missing policies for openai_usage table
CREATE POLICY "Admins can view organization usage" ON openai_usage
FOR SELECT USING (
  user_id IN (
    SELECT user_id FROM profiles 
    WHERE organization_id = get_current_user_organization_id()
  ) AND is_user_admin()
);

-- 9. Improve document_analyses policies - add UPDATE for status changes
CREATE POLICY "Users can update analyses in their organization" ON document_analyses
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

-- 10. Add trigger for time_entries updated_at
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();