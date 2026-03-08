-- 20250816180000_create_rls_policies.sql
-- Consolidated RLS policies for all main tables
-- NOTE: run `supabase db reset && supabase db push` to apply locally or deploy via CI.

-------------------------------------------------------------------------------
-- Helper: ensure get_user_organization_id() exists
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE user_id = auth.uid();
$$;

-------------------------------------------------------------------------------
-- Helper: quick check for org admin / superadmin
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('admin','superadmin')
      AND organization_id = get_user_organization_id()
  );
$$;

-------------------------------------------------------------------------------
-- Macro to enable RLS if not already enabled
-------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations','profiles','clients','cases','documents','document_analyses',
        'contracts','calendar_events','invoices','invoice_items','invoice_templates',
        'case_activities','time_entries','settings','tasks','communication_logs',
        'dashboard_prefs','notifications','doc_templates','user_roles','invitations',
        'best_practices','openai_usage','usage_counters'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-------------------------------------------------------------------------------
-- Template generators to cut duplication
-------------------------------------------------------------------------------
-- 1. Tables with direct organization_id column --------------------------------
CREATE OR REPLACE FUNCTION public._create_org_rls(table_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "org_select" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_select" ON public.%I
    FOR SELECT USING (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_insert" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_insert" ON public.%I
    FOR INSERT WITH CHECK (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_update" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_update" ON public.%I
    FOR UPDATE USING (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_delete_admin" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_delete_admin" ON public.%I
    FOR DELETE USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());', table_name);
END;$$;

-- 2. Helper for parent-child tables with FK to parent having org column --------
CREATE OR REPLACE FUNCTION public._create_child_org_rls(child_table text, fk_col text, parent_table text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "org_select" ON public.%I', child_table);
  EXECUTE format('CREATE POLICY "org_select" ON public.%I
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()));',
     child_table, child_table, parent_table, child_table, fk_col);

  EXECUTE format('DROP POLICY IF EXISTS "org_all" ON public.%I', child_table);
  EXECUTE format('CREATE POLICY "org_all" ON public.%I
  FOR ALL USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()));',
    child_table, parent_table, child_table, fk_col, parent_table, child_table, fk_col);
END;$$;

-------------------------------------------------------------------------------
-- Apply org RLS to simple tables
-------------------------------------------------------------------------------
SELECT public._create_org_rls(t)
FROM (VALUES
  ('organizations'), ('profiles'), ('clients'), ('cases'), ('documents'),
  ('document_analyses'), ('contracts'), ('calendar_events'), ('invoices'),
  ('invoice_templates'), ('settings'), ('dashboard_prefs'), ('notifications'),
  ('doc_templates'), ('user_roles'), ('invitations'), ('best_practices')
) AS v(t);

-- openai_usage & usage_counters (user scoped) ----------------------------------
DROP POLICY IF EXISTS "own_usage" ON public.openai_usage;
CREATE POLICY "own_usage" ON public.openai_usage
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own_counters" ON public.usage_counters;
CREATE POLICY "own_counters" ON public.usage_counters
  FOR SELECT USING (user_id = auth.uid());

-------------------------------------------------------------------------------
-- Child tables policies
-------------------------------------------------------------------------------
-- invoice_items -> invoices
SELECT public._create_child_org_rls('invoice_items','invoice_id','invoices');
-- case_activities -> cases
SELECT public._create_child_org_rlS('case_activities','case_id','cases');
-- time_entries -> case_activities (needs join two levels)
DROP POLICY IF EXISTS "org_select" ON public.time_entries;
CREATE POLICY "org_select" ON public.time_entries
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
));
DROP POLICY IF EXISTS "org_all" ON public.time_entries;
CREATE POLICY "org_all" ON public.time_entries
FOR ALL USING (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
));

-------------------------------------------------------------------------------
-- Additional per-table fine-grained rules
-------------------------------------------------------------------------------
-- profiles: user can update own profile
DROP POLICY IF EXISTS "self_update" ON public.profiles;
CREATE POLICY "self_update" ON public.profiles
FOR UPDATE USING (user_id = auth.uid());

-- tasks table (depends on cases)
DROP POLICY IF EXISTS "org_select" ON public.tasks;
CREATE POLICY "org_select" ON public.tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()));
DROP POLICY IF EXISTS "org_all" ON public.tasks;
CREATE POLICY "org_all" ON public.tasks
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()));
-- tasks assignee self permissions
DROP POLICY IF EXISTS "assignee_manage" ON public.tasks;
CREATE POLICY "assignee_manage" ON public.tasks
  FOR ALL USING (assigned_to = auth.uid());

-------------------------------------------------------------------------------
-- communication_logs simple org + own row update/delete
-------------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_select" ON public.communication_logs;
CREATE POLICY "org_select" ON public.communication_logs
  FOR SELECT USING (organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "org_insert" ON public.communication_logs;
CREATE POLICY "org_insert" ON public.communication_logs
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "own_update_delete" ON public.communication_logs;
CREATE POLICY "own_update_delete" ON public.communication_logs
  FOR UPDATE USING (user_id = auth.uid() AND organization_id = get_user_organization_id())
  WITH CHECK (user_id = auth.uid() AND organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "own_delete" ON public.communication_logs;
CREATE POLICY "own_delete" ON public.communication_logs
  FOR DELETE USING (user_id = auth.uid() AND organization_id = get_user_organization_id());

-------------------------------------------------------------------------------
-- grant to authenticated
-------------------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
