-- Fix RLS performance issues - optimize auth function calls and consolidate policies

-- 1. Drop and recreate policies with optimized auth calls to prevent re-evaluation per row

-- Fix document_analyses policies
DROP POLICY IF EXISTS "Users can view analyses for their organization" ON document_analyses;
DROP POLICY IF EXISTS "Users can create analyses for their organization" ON document_analyses;
DROP POLICY IF EXISTS "Users can update analyses in their organization" ON document_analyses;

CREATE POLICY "Users can view analyses for their organization" ON document_analyses
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Users can create analyses for their organization" ON document_analyses
FOR INSERT WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Users can update analyses in their organization" ON document_analyses
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

-- Fix dashboard_prefs policies
DROP POLICY IF EXISTS "Users can view their own dashboard prefs" ON dashboard_prefs;
DROP POLICY IF EXISTS "Users can create their own dashboard prefs" ON dashboard_prefs;
DROP POLICY IF EXISTS "Users can update their own dashboard prefs" ON dashboard_prefs;

CREATE POLICY "Users can view their own dashboard prefs" ON dashboard_prefs
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own dashboard prefs" ON dashboard_prefs
FOR INSERT WITH CHECK (
  user_id = (SELECT auth.uid()) AND 
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update their own dashboard prefs" ON dashboard_prefs
FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Fix notifications policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications" ON notifications
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own notifications" ON notifications
FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own notifications" ON notifications
FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Fix openai_usage policies
DROP POLICY IF EXISTS "Users can view their own usage" ON openai_usage;
DROP POLICY IF EXISTS "Users can create their own usage records" ON openai_usage;
DROP POLICY IF EXISTS "Admins can view organization usage" ON openai_usage;

CREATE POLICY "Users can view their own usage" ON openai_usage
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own usage records" ON openai_usage
FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view organization usage" ON openai_usage
FOR SELECT USING (
  user_id IN (
    SELECT user_id FROM profiles 
    WHERE organization_id = get_current_user_organization_id()
  ) AND (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
    )
  )
);

-- Fix profiles policies
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can update their own profile" ON profiles
FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Fix time_entries policies (optimize the ones we just created)
DROP POLICY IF EXISTS "Users can update their own time entries or admins can update all" ON time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries or admins can delete all" ON time_entries;

CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
FOR UPDATE USING (
  user_id = (SELECT auth.uid()) OR (
    organization_id = get_current_user_organization_id() AND (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
      )
    )
  )
);

CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
FOR DELETE USING (
  user_id = (SELECT auth.uid()) OR (
    organization_id = get_current_user_organization_id() AND (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
      )
    )
  )
);

-- Fix global_roles policy
DROP POLICY IF EXISTS "Authenticated users can view global roles" ON global_roles;

CREATE POLICY "Authenticated users can view global roles" ON global_roles
FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- Fix tasks policies
DROP POLICY IF EXISTS "Users can update tasks they created or are assigned to" ON tasks;
DROP POLICY IF EXISTS "Users can delete tasks they created or admins can delete" ON tasks;

CREATE POLICY "Users can update tasks they created or are assigned to" ON tasks
FOR UPDATE USING (
  (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid())) AND 
  case_id IN (
    SELECT id FROM cases WHERE organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can delete tasks they created or admins can delete" ON tasks
FOR DELETE USING (
  (
    created_by = (SELECT auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
    )
  ) AND 
  case_id IN (
    SELECT id FROM cases WHERE organization_id = get_current_user_organization_id()
  )
);