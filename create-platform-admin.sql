-- Create Platform Admin User
-- This script creates a user with email daniel@kourti.com and assigns them as superadmin
-- The user MUST be added to an organization (organization_id is NOT NULL in profiles table)

-- Step 1: Create the auth user (you'll need to set a password)
-- Note: You can create the user via Supabase Auth dashboard or use the admin API
-- For now, this assumes the user already exists in auth.users
-- If not, create them first via Supabase Dashboard > Authentication > Add User

DO $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_profile_exists boolean;
BEGIN
  -- Check if user exists in auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'daniel@kourti.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User daniel@kourti.com does not exist in auth.users. Please create the user first via Supabase Dashboard > Authentication > Add User';
  END IF;

  -- Check if profile already exists
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id = v_user_id) INTO v_profile_exists;

  IF v_profile_exists THEN
    -- Update existing profile to superadmin
    UPDATE public.profiles
    SET 
      role = 'superadmin'::user_role,
      is_organization_creator = TRUE,
      updated_at = now()
    WHERE user_id = v_user_id
    RETURNING organization_id INTO v_org_id;

    -- Also ensure they have superadmin role in user_role_assignments
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at, updated_at)
    VALUES (v_user_id, 'superadmin', v_org_id, v_user_id, now(), now())
    ON CONFLICT (user_id, role_name, organization_id) DO UPDATE
    SET updated_at = now();

    -- Assign platform_admin role (required for /thanos dashboard access)
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at, updated_at)
    VALUES (v_user_id, 'platform_admin', v_org_id, v_user_id, now(), now())
    ON CONFLICT (user_id, role_name, organization_id) DO UPDATE
    SET updated_at = now();

    RAISE NOTICE 'Updated existing user to superadmin and platform_admin. Organization ID: %', v_org_id;
  ELSE
    -- Create new organization for the user
    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES ('Kouti Platform Admin', 'daniel@kourti.com', now(), now())
    RETURNING id INTO v_org_id;

    -- Create profile with superadmin role
    INSERT INTO public.profiles (
      user_id,
      first_name,
      last_name,
      email,
      organization_id,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      v_user_id,
      'Daniel',
      'Kouti',
      'daniel@kourti.com',
      v_org_id,
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    );

    -- Assign superadmin role via user_role_assignments
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at, updated_at)
    VALUES (v_user_id, 'superadmin', v_org_id, v_user_id, now(), now());

    -- Assign platform_admin role (required for /thanos dashboard access)
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by, created_at, updated_at)
    VALUES (v_user_id, 'platform_admin', v_org_id, v_user_id, now(), now());

    RAISE NOTICE 'Created platform admin user. User ID: %, Organization ID: %', v_user_id, v_org_id;
  END IF;

END $$;

-- Verify the user was created correctly
SELECT 
  p.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.role,
  p.organization_id,
  o.name as organization_name,
  p.is_organization_creator,
  p.created_at
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id
WHERE p.email = 'daniel@kourti.com';

-- Verify platform_admin role assignment
SELECT 
  ura.user_id,
  ura.role_name,
  ura.organization_id,
  ura.created_at
FROM public.user_role_assignments ura
JOIN public.profiles p ON p.user_id = ura.user_id
WHERE p.email = 'daniel@kourti.com'
ORDER BY ura.role_name;
