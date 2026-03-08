CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  target_url text NOT NULL,
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  subscribed_events text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  response_status integer,
  response_body text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON public.webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON public.webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON public.webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON public.webhook_deliveries(endpoint_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_admin_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_select
ON public.webhook_endpoints
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

DROP POLICY IF EXISTS webhook_endpoints_org_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_org_select
ON public.webhook_endpoints
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = webhook_endpoints.organization_id
  )
);

DROP POLICY IF EXISTS webhook_endpoints_admin_insert ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_insert
ON public.webhook_endpoints
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

DROP POLICY IF EXISTS webhook_endpoints_admin_update ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_update
ON public.webhook_endpoints
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_endpoints_admin_delete ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_delete
ON public.webhook_endpoints
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_deliveries_admin_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_select
ON public.webhook_deliveries
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

DROP POLICY IF EXISTS webhook_deliveries_org_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_org_select
ON public.webhook_deliveries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.webhook_endpoints we
    JOIN public.profiles p
      ON p.organization_id = we.organization_id
    WHERE we.id = webhook_deliveries.endpoint_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS webhook_deliveries_admin_insert ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_insert
ON public.webhook_deliveries
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

DROP POLICY IF EXISTS webhook_deliveries_admin_update ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_update
ON public.webhook_deliveries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.get_pending_webhook_deliveries(p_batch_size integer DEFAULT 50)
RETURNS TABLE (
  delivery_id uuid,
  endpoint_id uuid,
  target_url text,
  secret text,
  event_type text,
  payload jsonb,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wd.id AS delivery_id,
    wd.endpoint_id,
    we.target_url,
    we.secret,
    wd.event_type,
    wd.payload,
    wd.attempt_count,
    wd.max_attempts
  FROM public.webhook_deliveries wd
  JOIN public.webhook_endpoints we
    ON we.id = wd.endpoint_id
  WHERE wd.status = 'pending'
    AND wd.next_retry_at <= now()
    AND we.is_active = true
  ORDER BY wd.created_at ASC
  LIMIT GREATEST(COALESCE(p_batch_size, 50), 1);
$$;

CREATE OR REPLACE FUNCTION public.update_webhook_delivery_status(
  p_delivery_id uuid,
  p_status text,
  p_response_status integer DEFAULT NULL,
  p_response_body text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL,
  p_attempt_increment integer DEFAULT 1
)
RETURNS public.webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.webhook_deliveries;
BEGIN
  UPDATE public.webhook_deliveries wd
  SET
    status = p_status,
    response_status = COALESCE(p_response_status, wd.response_status),
    response_body = COALESCE(p_response_body, wd.response_body),
    error_message = p_error_message,
    attempt_count = wd.attempt_count + GREATEST(COALESCE(p_attempt_increment, 1), 0),
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE wd.delivered_at END,
    next_retry_at = COALESCE(p_next_retry_at, wd.next_retry_at),
    updated_at = now()
  WHERE wd.id = p_delivery_id
  RETURNING wd.* INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_webhook_deliveries(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_webhook_delivery_status(uuid, text, integer, text, text, timestamptz, integer) TO authenticated, service_role;
