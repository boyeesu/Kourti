-- Fix remaining functions that may not have search_path set

-- Fix set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Fix update_tasks_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;

-- Fix bump_document_version function
CREATE OR REPLACE FUNCTION public.bump_document_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix invite_user_to_organization function
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    return json_build_object('error','Only superadmins can invite admin users');
  END IF;

  normalized_role := p_role::public.user_role;

  -- Does the user already exist?
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Upsert profile to this organization
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
      set organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = coalesce(first_name, p_first_name),
          last_name = coalesce(last_name, p_last_name),
          updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;