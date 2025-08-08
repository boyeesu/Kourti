-- Create user_roles table for managing custom roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  role_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, role_name)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for user_roles
CREATE POLICY "Users can view roles in their organization" 
ON public.user_roles 
FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Superadmins can create roles in their organization" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

CREATE POLICY "Superadmins can update roles in their organization" 
ON public.user_roles 
FOR UPDATE 
USING (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

CREATE POLICY "Superadmins can delete roles in their organization" 
ON public.user_roles 
FOR DELETE 
USING (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();