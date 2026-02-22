-- CRITICAL FIX: Add RLS policies for tasks table
-- Enable RLS on tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tasks in their organization (via case)
CREATE POLICY "Users can view tasks in their organization" 
ON public.tasks 
FOR SELECT 
USING (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Users can create tasks in their organization
CREATE POLICY "Users can create tasks in their organization" 
ON public.tasks 
FOR INSERT 
WITH CHECK (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Task creators and assignees can update tasks
CREATE POLICY "Users can update tasks they created or are assigned to" 
ON public.tasks 
FOR UPDATE 
USING (
  (created_by = auth.uid() OR assigned_to = auth.uid()) AND
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Task creators and admins can delete tasks
CREATE POLICY "Users can delete tasks they created or admins can delete" 
ON public.tasks 
FOR DELETE 
USING (
  (created_by = auth.uid() OR is_user_admin()) AND
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- HIGH PRIORITY FIX: Secure database functions with proper search paths
-- Fix get_current_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$function$;

-- Fix is_user_admin function
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$function$;

-- Fix get_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
    
    IF org_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN org_id;
END;
$function$;

-- Fix current_user_is_org_admin function
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;