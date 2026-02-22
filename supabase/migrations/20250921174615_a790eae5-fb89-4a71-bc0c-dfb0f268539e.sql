-- Fix and improve RLS policies - targeted approach to avoid conflicts

-- 1. Complete time_entries table setup
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Enable RLS on time_entries if not already enabled
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for time_entries (with IF NOT EXISTS where possible)
DO $$
BEGIN
  -- Create policies only if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can create time entries in their organization') THEN
    CREATE POLICY "Users can create time entries in their organization" ON time_entries
    FOR INSERT WITH CHECK (organization_id = get_current_user_organization_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can view time entries in their organization') THEN
    CREATE POLICY "Users can view time entries in their organization" ON time_entries
    FOR SELECT USING (organization_id = get_current_user_organization_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can update their own time entries or admins can update all') THEN
    CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
    FOR UPDATE USING (
      user_id = auth.uid() OR (
        organization_id = get_current_user_organization_id() AND is_user_admin()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can delete their own time entries or admins can delete all') THEN
    CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
    FOR DELETE USING (
      user_id = auth.uid() OR (
        organization_id = get_current_user_organization_id() AND is_user_admin()
      )
    );
  END IF;
END
$$;

-- 2. Add missing INSERT policy for profiles (for user registration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Service role can insert profiles') THEN
    CREATE POLICY "Service role can insert profiles" ON profiles
    FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- 3. Add policy for organizations INSERT (for new user registration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Service role can insert organizations') THEN
    CREATE POLICY "Service role can insert organizations" ON organizations
    FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- 4. Improve communication_logs policies - add missing UPDATE/DELETE for admins
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communication_logs' AND policyname = 'Admins can update comm logs in their organization') THEN
    CREATE POLICY "Admins can update comm logs in their organization" ON communication_logs
    FOR UPDATE USING (
      organization_id = get_current_user_organization_id() AND is_user_admin()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communication_logs' AND policyname = 'Admins can delete comm logs in their organization') THEN
    CREATE POLICY "Admins can delete comm logs in their organization" ON communication_logs
    FOR DELETE USING (
      organization_id = get_current_user_organization_id() AND is_user_admin()
    );
  END IF;
END
$$;

-- 5. Add missing policies for openai_usage table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'openai_usage' AND policyname = 'Admins can view organization usage') THEN
    CREATE POLICY "Admins can view organization usage" ON openai_usage
    FOR SELECT USING (
      user_id IN (
        SELECT user_id FROM profiles 
        WHERE organization_id = get_current_user_organization_id()
      ) AND is_user_admin()
    );
  END IF;
END
$$;

-- 6. Improve document_analyses policies - add UPDATE for status changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analyses' AND policyname = 'Users can update analyses in their organization') THEN
    CREATE POLICY "Users can update analyses in their organization" ON document_analyses
    FOR UPDATE USING (
      organization_id = get_current_user_organization_id()
    );
  END IF;
END
$$;

-- 7. Add trigger for time_entries updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_time_entries_updated_at') THEN
    CREATE TRIGGER update_time_entries_updated_at
      BEFORE UPDATE ON time_entries
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;