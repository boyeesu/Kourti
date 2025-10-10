-- Create view that masks secrets
CREATE OR REPLACE VIEW public.organization_sso_configs_view AS
SELECT 
  id,
  organization_id,
  provider,
  client_id,
  CASE 
    WHEN client_secret IS NOT NULL THEN '••••••••'
    ELSE NULL
  END as client_secret_masked,
  client_secret IS NOT NULL as has_client_secret,
  tenant_id,
  domain_hint,
  redirect_uri,
  is_enabled,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM public.organization_sso_configs;

-- Create upsert function
CREATE OR REPLACE FUNCTION public.upsert_organization_sso_config(
  p_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_client_id TEXT DEFAULT NULL,
  p_client_secret TEXT DEFAULT NULL,
  p_tenant_id TEXT DEFAULT NULL,
  p_domain_hint TEXT DEFAULT NULL,
  p_redirect_uri TEXT DEFAULT NULL,
  p_is_enabled BOOLEAN DEFAULT true
)
RETURNS public.organization_sso_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result public.organization_sso_configs;
  v_user_role TEXT;
BEGIN
  SELECT organization_id, role::TEXT INTO v_org_id, v_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmins can manage SSO configurations';
  END IF;
  
  IF p_id IS NULL AND (p_provider IS NULL OR p_provider NOT IN ('google', 'microsoft')) THEN
    RAISE EXCEPTION 'Invalid provider. Must be google or microsoft';
  END IF;
  
  IF p_id IS NOT NULL THEN
    UPDATE public.organization_sso_configs
    SET 
      client_id = COALESCE(p_client_id, client_id),
      client_secret = COALESCE(p_client_secret, client_secret),
      tenant_id = COALESCE(p_tenant_id, tenant_id),
      domain_hint = p_domain_hint,
      redirect_uri = p_redirect_uri,
      is_enabled = COALESCE(p_is_enabled, is_enabled),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = p_id AND organization_id = v_org_id
    RETURNING * INTO v_result;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SSO configuration not found';
    END IF;
  ELSE
    INSERT INTO public.organization_sso_configs (
      organization_id,
      provider,
      client_id,
      client_secret,
      tenant_id,
      domain_hint,
      redirect_uri,
      is_enabled,
      created_by,
      updated_by
    ) VALUES (
      v_org_id,
      p_provider,
      p_client_id,
      p_client_secret,
      p_tenant_id,
      p_domain_hint,
      p_redirect_uri,
      p_is_enabled,
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Create delete function
CREATE OR REPLACE FUNCTION public.delete_organization_sso_config(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_role TEXT;
BEGIN
  SELECT organization_id, role::TEXT INTO v_org_id, v_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmins can delete SSO configurations';
  END IF;
  
  DELETE FROM public.organization_sso_configs
  WHERE id = p_id AND organization_id = v_org_id;
  
  RETURN FOUND;
END;
$$;