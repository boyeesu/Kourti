CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_user_id uuid,
  key_name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_hash)
);

CREATE TABLE IF NOT EXISTS public.api_rate_limit_windows (
  api_key_id uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  organization_id uuid,
  request_path text NOT NULL,
  request_method text NOT NULL,
  request_ip inet,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  response_body jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  location text,
  created_by uuid,
  source text NOT NULL DEFAULT 'api',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_calendar_events_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON public.api_keys(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_started ON public.api_request_logs(api_key_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org_started ON public.api_request_logs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calendar_events_org_start ON public.api_calendar_events(organization_id, start_at);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_admin_select ON public.api_keys;
CREATE POLICY api_keys_admin_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_keys_owner_select ON public.api_keys;
CREATE POLICY api_keys_owner_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_admin_modify ON public.api_keys;
CREATE POLICY api_keys_admin_modify
ON public.api_keys
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_rate_limit_windows_admin_only ON public.api_rate_limit_windows;
CREATE POLICY api_rate_limit_windows_admin_only
ON public.api_rate_limit_windows
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_select ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_select
ON public.api_request_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_owner_select ON public.api_request_logs;
CREATE POLICY api_request_logs_owner_select
ON public.api_request_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.api_keys ak
    WHERE ak.id = api_request_logs.api_key_id
      AND ak.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_insert ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_insert
ON public.api_request_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_update ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_update
ON public.api_request_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_calendar_events_admin_select ON public.api_calendar_events;
CREATE POLICY api_calendar_events_admin_select
ON public.api_calendar_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_calendar_events_org_select ON public.api_calendar_events;
CREATE POLICY api_calendar_events_org_select
ON public.api_calendar_events
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = api_calendar_events.organization_id
  )
);

DROP POLICY IF EXISTS api_calendar_events_admin_modify ON public.api_calendar_events;
CREATE POLICY api_calendar_events_admin_modify
ON public.api_calendar_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.validate_api_key(
  p_api_key text,
  p_required_scope text DEFAULT NULL
)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  organization_id uuid,
  owner_user_id uuid,
  rate_limit_per_minute integer,
  scopes text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true AS is_valid,
    ak.id AS api_key_id,
    ak.organization_id,
    ak.owner_user_id,
    ak.rate_limit_per_minute,
    ak.scopes
  FROM public.api_keys ak
  WHERE ak.key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
    AND ak.is_active = true
    AND (ak.expires_at IS NULL OR ak.expires_at > now())
    AND (
      p_required_scope IS NULL
      OR p_required_scope = ''
      OR p_required_scope = ANY(ak.scopes)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_api_key_id uuid,
  p_rate_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_rate_limit_windows;
  v_limit integer;
BEGIN
  v_limit := GREATEST(COALESCE(p_rate_limit, 60), 1);

  INSERT INTO public.api_rate_limit_windows AS arlw (api_key_id, window_start, request_count, updated_at)
  VALUES (p_api_key_id, now(), 1, now())
  ON CONFLICT (api_key_id)
  DO UPDATE SET
    window_start = CASE
      WHEN arlw.window_start <= now() - interval '1 minute' THEN now()
      ELSE arlw.window_start
    END,
    request_count = CASE
      WHEN arlw.window_start <= now() - interval '1 minute' THEN 1
      ELSE arlw.request_count + 1
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row.request_count <= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_api_request(
  p_api_key_id uuid,
  p_organization_id uuid,
  p_request_path text,
  p_request_method text,
  p_request_ip inet DEFAULT NULL,
  p_request_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.api_request_logs (
    api_key_id,
    organization_id,
    request_path,
    request_method,
    request_ip,
    request_metadata,
    started_at,
    created_at
  )
  VALUES (
    p_api_key_id,
    p_organization_id,
    p_request_path,
    upper(p_request_method),
    p_request_ip,
    COALESCE(p_request_metadata, '{}'::jsonb),
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_api_request(
  p_request_log_id uuid,
  p_status_code integer,
  p_response_body jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS public.api_request_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_request_logs;
BEGIN
  UPDATE public.api_request_logs arl
  SET
    status_code = p_status_code,
    response_body = p_response_body,
    error_message = p_error_message,
    completed_at = now(),
    duration_ms = GREATEST((EXTRACT(EPOCH FROM (now() - arl.started_at)) * 1000)::integer, 0)
  WHERE arl.id = p_request_log_id
  RETURNING arl.* INTO v_row;

  UPDATE public.api_keys ak
  SET last_used_at = now(),
      updated_at = now()
  WHERE ak.id = v_row.api_key_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.api_get_calendar_events(
  p_organization_id uuid,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.api_calendar_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ace.*
  FROM public.api_calendar_events ace
  WHERE (p_organization_id IS NULL OR ace.organization_id = p_organization_id)
    AND (p_start_at IS NULL OR ace.end_at >= p_start_at)
    AND (p_end_at IS NULL OR ace.start_at <= p_end_at)
  ORDER BY ace.start_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.api_create_calendar_event(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_location text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.api_calendar_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_calendar_events;
BEGIN
  INSERT INTO public.api_calendar_events (
    organization_id,
    title,
    description,
    start_at,
    end_at,
    location,
    created_by,
    metadata,
    source,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_title,
    p_description,
    p_start_at,
    p_end_at,
    p_location,
    p_created_by,
    COALESCE(p_metadata, '{}'::jsonb),
    'api',
    now(),
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_api_key(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_api_request(uuid, uuid, text, text, inet, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_request(uuid, integer, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_get_calendar_events(uuid, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_create_calendar_event(uuid, text, text, timestamptz, timestamptz, text, uuid, jsonb) TO authenticated, service_role;
