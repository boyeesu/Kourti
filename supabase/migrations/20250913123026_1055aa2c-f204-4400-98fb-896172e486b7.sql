-- Clear and recreate global roles with proper hierarchy
DELETE FROM global_roles;

INSERT INTO global_roles (role, display_name, description) VALUES 
  ('superadmin', 'Super Admin', 'Organization Administrator with full system access and role management'),
  ('admin', 'Admin', 'Organization Administrator with full CRUD access'),
  ('user', 'User', 'Standard user with Create, Read, Update access (no delete)');

-- Set up default permissions for each role
-- Clear existing default permissions first
DELETE FROM role_permissions WHERE organization_id IS NULL;

-- Super Admin gets all permissions (but we'll handle this in code since they have full access)
-- Admin gets full CRUD on all resources
INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'admin' as role_name,
  org.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings']) as resource,
  unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
  true as granted,
  '00000000-0000-0000-0000-000000000000'::uuid as created_by
FROM organizations org
ON CONFLICT (role_name, organization_id, resource, action) DO UPDATE SET granted = EXCLUDED.granted;

-- User gets CRU (no delete) on most resources, read-only on settings and users
INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'user' as role_name,
  org.id as organization_id,
  resource,
  action,
  CASE 
    WHEN resource IN ('settings', 'users') AND action != 'read' THEN false
    WHEN action = 'delete' THEN false
    ELSE true
  END as granted,
  '00000000-0000-0000-0000-000000000000'::uuid as created_by
FROM organizations org
CROSS JOIN (
  SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
         unnest(ARRAY['create', 'read', 'update', 'delete']) as action
) perms
ON CONFLICT (role_name, organization_id, resource, action) DO UPDATE SET granted = EXCLUDED.granted;

-- Update the RLS policies for role management
DROP POLICY IF EXISTS "Admins can manage r" ON user_roles;
DROP POLICY IF EXISTS "Superadmins can manage custom roles" ON user_roles;

CREATE POLICY "Only superadmins can manage custom roles"
ON user_roles FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS(
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

-- Update permissions management policy
DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON role_permissions;

CREATE POLICY "Superadmins can manage all role permissions"
ON role_permissions FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS(
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

-- Create a function to initialize default permissions for new organizations
CREATE OR REPLACE FUNCTION public.initialize_organization_permissions(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin permissions (full CRUD)
  INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
  SELECT 
    'admin' as role_name,
    org_id,
    unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
    unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
    true as granted,
    '00000000-0000-0000-0000-000000000000'::uuid as created_by
  ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

  -- User permissions (CRU, no delete)
  INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
  SELECT 
    'user' as role_name,
    org_id,
    resource,
    action,
    CASE 
      WHEN resource IN ('settings', 'users') AND action != 'read' THEN false
      WHEN action = 'delete' THEN false
      ELSE true
    END as granted,
    '00000000-0000-0000-0000-000000000000'::uuid as created_by
  FROM (
    SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
           unnest(ARRAY['create', 'read', 'update', 'delete']) as action
  ) perms
  ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
END;
$$;

-- Add trigger to initialize permissions for new organizations
CREATE OR REPLACE FUNCTION public.handle_new_organization_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM initialize_organization_permissions(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_initialize_organization_permissions ON organizations;

-- Create trigger for new organizations
CREATE TRIGGER trigger_initialize_organization_permissions
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_organization_permissions();