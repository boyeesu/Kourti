-- Create permissions table for fine-grained role permissions
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL,
  organization_id UUID NOT NULL,
  resource TEXT NOT NULL, -- cases, clients, documents, contracts, calendars, etc.
  action TEXT NOT NULL, -- create, read, update, delete, manage
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(role_name, organization_id, resource, action)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for role_permissions
CREATE POLICY "Superadmins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

CREATE POLICY "Users can view role permissions in their organization"
ON public.role_permissions
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Create function to check user permissions
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Check role permissions
  SELECT COALESCE(granted, false)
  INTO has_permission
  FROM role_permissions
  WHERE role_name = user_role
    AND organization_id = org_id
    AND resource = p_resource
    AND action = p_action;
  
  -- Default permissions for system roles if not explicitly set
  IF has_permission IS NULL THEN
    -- Admins get most permissions by default
    IF user_role = 'admin' AND p_action IN ('create', 'read', 'update', 'delete') THEN
      has_permission := true;
    -- Regular users get read permissions by default
    ELSIF user_role = 'user' AND p_action = 'read' THEN
      has_permission := true;
    END IF;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;

-- Insert default permissions for system roles
INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'admin' as role_name,
  o.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) as resource,
  unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
  true as granted,
  o.id as created_by -- Using org id as placeholder, will be updated
FROM organizations o
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'user' as role_name,
  o.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) as resource,
  'read' as action,
  true as granted,
  o.id as created_by
FROM organizations o
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();