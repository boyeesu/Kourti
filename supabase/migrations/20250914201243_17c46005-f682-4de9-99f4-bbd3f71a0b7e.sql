-- Fix security warnings by setting proper search_path for the new functions
CREATE OR REPLACE FUNCTION public.initialize_custom_role_permissions(p_role_name text, p_organization_id uuid, p_created_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  resource_name text;
BEGIN
  -- Set default read permissions for all resources for new custom roles
  FOREACH resource_name IN ARRAY ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']
  LOOP
    INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by)
    VALUES (p_role_name, p_organization_id, resource_name, 'read', true, p_created_by)
    ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_initialize_custom_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Initialize default permissions for new custom role
  PERFORM initialize_custom_role_permissions(NEW.role_name, NEW.organization_id, NEW.created_by);
  RETURN NEW;
END;
$$;

-- Initialize permissions for existing custom roles that have no permissions
DO $$
DECLARE
  role_record RECORD;
BEGIN
  FOR role_record IN 
    SELECT DISTINCT ur.role_name, ur.organization_id, ur.created_by
    FROM user_roles ur
    LEFT JOIN role_permissions rp ON ur.role_name = rp.role_name AND ur.organization_id = rp.organization_id
    WHERE rp.id IS NULL
  LOOP
    PERFORM initialize_custom_role_permissions(role_record.role_name, role_record.organization_id, role_record.created_by);
  END LOOP;
END;
$$;