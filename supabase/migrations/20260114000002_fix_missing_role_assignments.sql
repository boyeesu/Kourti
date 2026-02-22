-- Fix missing role assignments for superadmins
-- This migration finds users who have 'superadmin' in their profile but are missing
-- the corresponding entry in user_role_assignments, and fixes them.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.user_id, p.organization_id
    FROM public.profiles p
    WHERE p.role = 'superadmin'::user_role
    AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura 
      WHERE ura.user_id = p.user_id 
      AND ura.organization_id = p.organization_id 
      AND ura.role_name = 'superadmin'
    )
  LOOP
    -- Insert missing assignment
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (r.user_id, 'superadmin', r.organization_id, r.user_id)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    RAISE NOTICE 'Fixed missing superadmin role assignment for user % in org %', r.user_id, r.organization_id;
  END LOOP;
END $$;
