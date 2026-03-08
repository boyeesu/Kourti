CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'user',
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'api',
  ip_address inet,
  user_agent text,
  target_type text,
  target_id text,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_audit_logs_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_org_created ON public.security_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_actor_created ON public.security_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type_created ON public.security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_severity_created ON public.security_audit_logs(severity, created_at DESC);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_logs_admin_select ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_select
ON public.security_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS security_audit_logs_actor_select ON public.security_audit_logs;
CREATE POLICY security_audit_logs_actor_select
ON public.security_audit_logs
FOR SELECT
TO authenticated
USING (actor_user_id = auth.uid());

DROP POLICY IF EXISTS security_audit_logs_admin_insert ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_insert
ON public.security_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_source text DEFAULT 'api',
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_audit_logs (
    organization_id,
    actor_user_id,
    actor_type,
    event_type,
    severity,
    source,
    ip_address,
    user_agent,
    target_type,
    target_id,
    event_data,
    created_at
  )
  VALUES (
    p_organization_id,
    p_actor_user_id,
    CASE WHEN p_actor_user_id IS NULL THEN 'system' ELSE 'user' END,
    p_event_type,
    CASE
      WHEN p_severity IN ('info', 'warning', 'error', 'critical') THEN p_severity
      ELSE 'info'
    END,
    COALESCE(NULLIF(p_source, ''), 'api'),
    p_ip_address,
    p_user_agent,
    p_target_type,
    p_target_id,
    COALESCE(p_event_data, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_event(uuid, uuid, text, text, text, inet, text, text, text, jsonb) TO authenticated, service_role;
