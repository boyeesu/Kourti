SET search_path = public;

-- Ensure pgcrypto is available for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table to store organization SSO configurations
CREATE TABLE IF NOT EXISTS public.organization_sso_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  client_id text NOT NULL,
  client_secret bytea,
  tenant_id text,
  domain_hint text,
  redirect_uri text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sso_configs_org_provider_idx
  ON public.organization_sso_configs (organization_id, provider);

-- Trigger to update the timestamp automatically
DROP TRIGGER IF EXISTS trg_organization_sso_configs_set_updated_at ON public.organization_sso_configs;
CREATE TRIGGER trg_organization_sso_configs_set_updated_at
  BEFORE UPDATE ON public.organization_sso_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce row level security
ALTER TABLE public.organization_sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sso_configs FORCE ROW LEVEL SECURITY;

-- Policies restricting access to members of the same organization
DROP POLICY IF EXISTS "org members read sso configs" ON public.organization_sso_configs;
CREATE POLICY "org members read sso configs" ON public.organization_sso_configs
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "org admins manage sso configs" ON public.organization_sso_configs;
CREATE POLICY "org admins manage sso configs" ON public.organization_sso_configs
  FOR ALL
  USING (
    organization_id = public.get_user_organization_id()
    AND public.current_user_is_org_admin()
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.current_user_is_org_admin()
  );

-- Restrict direct table access; consumers should use the sanitized view or RPC helpers
REVOKE ALL ON public.organization_sso_configs FROM PUBLIC;
REVOKE ALL ON public.organization_sso_configs FROM authenticated;
REVOKE ALL ON public.organization_sso_configs FROM anon;
GRANT ALL ON public.organization_sso_configs TO service_role;

-- View that exposes sanitized data and masks the client secret for non-service role callers
CREATE OR REPLACE VIEW public.organization_sso_configs_view
WITH (security_barrier=true) AS
SELECT
  c.id,
  c.organization_id,
  c.provider,
  c.client_id,
  c.tenant_id,
  c.domain_hint,
  c.redirect_uri,
  c.is_enabled,
  c.created_by,
  c.updated_by,
  c.created_at,
  c.updated_at,
  c.client_secret IS NOT NULL AS has_client_secret,
  CASE
    WHEN c.client_secret IS NOT NULL
    THEN '••••••••'
    ELSE NULL
  END AS client_secret_masked,
  CASE
    WHEN c.client_secret IS NOT NULL
      AND current_setting('request.jwt.claim.role', true) = 'service_role'
      AND coalesce(
        nullif(current_setting('app.settings.sso_secret_key', true), ''),
        nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
      ) IS NOT NULL
    THEN convert_from(
      pgp_sym_decrypt(
        c.client_secret,
        coalesce(
          nullif(current_setting('app.settings.sso_secret_key', true), ''),
          nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
        )::text
      ),
      'utf8'
    )
    ELSE NULL
  END AS client_secret
FROM public.organization_sso_configs c;

GRANT SELECT ON public.organization_sso_configs_view TO authenticated;
GRANT SELECT ON public.organization_sso_configs_view TO service_role;

-- Helper function to upsert configurations with encryption handled server-side
CREATE OR REPLACE FUNCTION public.upsert_organization_sso_config(
  p_id uuid DEFAULT NULL,
  p_provider text,
  p_client_id text,
  p_client_secret text DEFAULT NULL,
  p_tenant_id text DEFAULT NULL,
  p_domain_hint text DEFAULT NULL,
  p_redirect_uri text DEFAULT NULL,
  p_is_enabled boolean DEFAULT false
)
RETURNS public.organization_sso_configs_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_key text;
  v_org_id uuid;
  v_is_admin boolean;
  v_target_id uuid;
  v_row public.organization_sso_configs%ROWTYPE;
  v_result public.organization_sso_configs_view;
BEGIN
  SELECT organization_id, role IN ('admin', 'superadmin')
    INTO v_org_id, v_is_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not associated with an organization.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only organization admins can manage SSO configurations.' USING ERRCODE = '42501';
  END IF;

  v_secret_key := coalesce(
    nullif(current_setting('app.settings.sso_secret_key', true), ''),
    nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
  );

  IF v_secret_key IS NULL THEN
    RAISE EXCEPTION 'SSO secret key is not configured.';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT id
      INTO v_target_id
    FROM public.organization_sso_configs
    WHERE id = p_id
      AND organization_id = v_org_id;

    IF v_target_id IS NULL THEN
      RAISE EXCEPTION 'SSO configuration not found for this organization.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT id
      INTO v_target_id
    FROM public.organization_sso_configs
    WHERE organization_id = v_org_id
      AND provider = p_provider;
  END IF;

  IF v_target_id IS NULL THEN
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
    )
    VALUES (
      v_org_id,
      p_provider,
      p_client_id,
      CASE
        WHEN p_client_secret IS NOT NULL THEN pgp_sym_encrypt(p_client_secret, v_secret_key)
        ELSE NULL
      END,
      p_tenant_id,
      p_domain_hint,
      p_redirect_uri,
      coalesce(p_is_enabled, false),
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.organization_sso_configs
    SET
      client_id = p_client_id,
      client_secret = CASE
        WHEN p_client_secret IS NOT NULL THEN pgp_sym_encrypt(p_client_secret, v_secret_key)
        ELSE client_secret
      END,
      tenant_id = p_tenant_id,
      domain_hint = p_domain_hint,
      redirect_uri = p_redirect_uri,
      is_enabled = coalesce(p_is_enabled, false),
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
    WHERE id = v_target_id
    RETURNING * INTO v_row;
  END IF;

  SELECT *
    INTO v_result
  FROM public.organization_sso_configs_view
  WHERE id = v_row.id;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.upsert_organization_sso_config(uuid, text, text, text, text, text, text, boolean)
  OWNER TO postgres;

-- Helper to delete configurations with appropriate authorization checks
CREATE OR REPLACE FUNCTION public.delete_organization_sso_config(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_is_admin boolean;
  v_deleted boolean := false;
BEGIN
  SELECT organization_id, role IN ('admin', 'superadmin')
    INTO v_org_id, v_is_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not associated with an organization.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only organization admins can manage SSO configurations.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.organization_sso_configs
  WHERE id = p_id
    AND organization_id = v_org_id
  RETURNING TRUE INTO v_deleted;

  RETURN coalesce(v_deleted, false);
END;
$$;

ALTER FUNCTION public.delete_organization_sso_config(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.upsert_organization_sso_config(uuid, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_sso_config(uuid) TO authenticated;
