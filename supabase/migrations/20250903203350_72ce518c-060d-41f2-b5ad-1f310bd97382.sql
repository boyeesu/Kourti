-- Fix remaining functions that may still have search path issues

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
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
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::public.user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

-- Fix disable_user function
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;