-- Security fixes for Kouti Legal application

-- 1. Fix global_roles table RLS policy
DROP POLICY IF EXISTS "Public read global roles" ON public.global_roles;
CREATE POLICY "Authenticated users can view global roles" 
ON public.global_roles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 2. Add organization_id to best_practices table and update RLS policy
ALTER TABLE public.best_practices 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Update best_practices RLS policy to be organization-scoped
DROP POLICY IF EXISTS "Authenticated users can view best practices" ON public.best_practices;
CREATE POLICY "Users can view best practices in their organization" 
ON public.best_practices 
FOR SELECT 
USING (organization_id = get_current_user_organization_id() OR organization_id IS NULL);

-- 3. Fix database functions by adding proper search_path settings

-- Fix get_current_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
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
 SET search_path = 'public'
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
 SET search_path = 'public'
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
 SET search_path = 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;

-- Fix set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Fix update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- Fix update_tasks_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;