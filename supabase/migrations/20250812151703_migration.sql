-- Fix database function search paths for security
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.generate_document_from_template(p_template_id uuid, p_context jsonb)
 RETURNS documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  new_doc public.documents%ROWTYPE;
BEGIN
  -- Fetch template
  PERFORM 1 FROM public.doc_templates WHERE id = p_template_id;
  -- Do your merge logic here (e.g. replace {{vars}} in content)
  -- For now, insert a placeholder doc record:
  INSERT INTO public.documents (title, file_path, organization_id, custom_fields)
  VALUES (
    (SELECT name FROM public.doc_templates WHERE id=p_template_id),
    '/generated/path/' || p_template_id || '.pdf',
    public.get_user_organization_id(),
    p_context
  )
  RETURNING * INTO new_doc;
  RETURN new_doc;
END;
$function$;

-- Drop existing conflicting policies and recreate with better security
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own basic profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can create profiles for their organization" ON public.profiles;

-- Create more secure policies for profiles table
CREATE POLICY "Users can view profiles in organization" 
ON public.profiles 
FOR SELECT 
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own profile with role restrictions" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid()) 
WITH CHECK (
  user_id = auth.uid() 
  AND organization_id = public.get_user_organization_id()
  -- Prevent users from changing their own role unless they're superadmin
  AND (
    role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    OR public.current_user_is_org_admin()
  )
);

-- Only admins can insert new profiles (for invitations)
CREATE POLICY "Admins can create profiles for organization" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  public.current_user_is_org_admin()
  AND organization_id = public.get_user_organization_id()
);