-- Add platform_admin role to existing user
-- This grants access to /thanos dashboard

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  -- Get user ID and organization ID
  SELECT p.user_id, p.organization_id INTO v_user_id, v_org_id
  FROM public.profiles p
  WHERE p.email = 'daniel@kourti.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User daniel@kourti.com not found in profiles';
  END IF;

  -- Assign platform_admin role
  INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at, updated_at)
  VALUES (v_user_id, 'platform_admin', v_org_id, v_user_id, now(), now())
  ON CONFLICT (user_id, role_name, organization_id) DO UPDATE
  SET updated_at = now();

  RAISE NOTICE 'Added platform_admin role to user. User ID: %, Organization ID: %', v_user_id, v_org_id;
END $$;

-- Verify the role was added
SELECT 
  ura.user_id,
  ura.role_name,
  ura.organization_id,
  p.email,
  o.name as organization_name
FROM public.user_role_assignments ura
JOIN public.profiles p ON p.user_id = ura.user_id
LEFT JOIN public.organizations o ON o.id = ura.organization_id
WHERE p.email = 'daniel@kourti.com'
ORDER BY ura.role_name;
