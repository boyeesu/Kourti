-- 20250810130000_case_activities.sql
-- Adds task/time-tracking for cases

SET search_path = auth, public;

-------------------------------------------------------------------
-- new table: case_activities
-------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  activity_type text NOT NULL,          -- 'task'|'meeting'|'court'|'research' etc.
  assigned_to uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  due_date date,
  status text DEFAULT 'pending',        -- 'pending'|'in_progress'|'completed'
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_case_activities_case_id ON public.case_activities(case_id);

-------------------------------------------------------------------
-- new table: time_entries (logs billable time per activity)
-------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.case_activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  minutes integer NOT NULL CHECK (minutes > 0),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_activity_id ON public.time_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);

-------------------------------------------------------------------
-- augment cases with current_status, progress helpers
-------------------------------------------------------------------
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'in_progress';

-------------------------------------------------------------------
-- RLS stubs ( tighten later )
-------------------------------------------------------------------
-- Only members of same org can interact
-- Assumes get_user_organization_id() helper already exists

ALTER TABLE public.case_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members select activities" ON public.case_activities
  FOR SELECT USING (exists(select 1 from public.cases c where c.id = case_id and c.organization_id = get_user_organization_id()));
CREATE POLICY "org members modify activities" ON public.case_activities
  FOR ALL USING (true) WITH CHECK (exists(select 1 from public.cases c where c.id = case_id and c.organization_id = get_user_organization_id()));

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members select time" ON public.time_entries
  FOR SELECT USING (exists(select 1 from public.case_activities a join public.cases c on a.case_id=c.id where a.id = activity_id and c.organization_id = get_user_organization_id()));
CREATE POLICY "org members modify time" ON public.time_entries
  FOR ALL USING (true) WITH CHECK (exists(select 1 from public.case_activities a join public.cases c on a.case_id=c.id where a.id = activity_id and c.organization_id = get_user_organization_id()));

-------------------------------------------------------------------
-- Grant execute/select
-------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activities, public.time_entries TO authenticated;
