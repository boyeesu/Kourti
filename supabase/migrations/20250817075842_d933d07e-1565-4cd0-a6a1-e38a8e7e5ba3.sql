-- Fix search path issues for security functions

-- Set search path for existing functions
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$$;

-- Add RLS policies for case_activities
CREATE POLICY "Users can view activities in their organization" ON public.case_activities
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create activities in their organization" ON public.case_activities
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update activities in their organization" ON public.case_activities
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete activities in their organization" ON public.case_activities
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());