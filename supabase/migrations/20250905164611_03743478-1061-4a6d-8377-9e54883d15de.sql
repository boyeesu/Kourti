-- Fix remaining database functions with missing search_path settings (excluding vector function)

-- Fix analyze_document function
CREATE OR REPLACE FUNCTION public.analyze_document(p_document_id uuid, p_content text, p_document_type text DEFAULT 'document'::text, p_analysis_type text DEFAULT 'general'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Return a placeholder response
  v_result := jsonb_build_object(
    'status', 'success',
    'content', 'Document analysis is being processed. Please check back later.'
  );

  -- Update analysis record
  UPDATE document_analyses
  SET 
    content = v_result->>'content',
    status = 'completed',
    updated_at = now()
  WHERE id = v_analysis_id;

  RETURN v_result;
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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

-- Fix get_document_analysis function
CREATE OR REPLACE FUNCTION public.get_document_analysis(p_document_id uuid, p_analysis_type text DEFAULT 'general'::text)
 RETURNS TABLE(id uuid, content text, status text, created_at timestamp with time zone, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix invite_user_to_organization function
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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
 SET search_path = 'public'
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

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;