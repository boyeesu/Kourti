-- This migration ensures the user_roles table exists

-- Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, role_name)
);

-- Enable RLS if not already enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Users can view roles in their organization'
  ) THEN
    CREATE POLICY "Users can view roles in their organization" 
    ON public.user_roles 
    FOR SELECT 
    USING (organization_id = get_user_organization_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can create roles in their organization'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can update roles in their organization'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can delete roles in their organization'
  ) THEN
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
  END IF;
END $$;

-- Create trigger for automatic timestamp updates if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_roles_updated_at'
  ) THEN
    CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;