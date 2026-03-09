-- Migration: Add Flutterwave subscription integration tables
-- Description: Extends user_plans with pricing, creates subscriptions, payment_transactions,
--              and webhook_events tables for Flutterwave payment integration.
-- Dependencies: 20260117000001_create_user_plans.sql, 20260307000008_security_audit_logs.sql

-- =============================================================================
-- 1. ALTER user_plans: Add Flutterwave pricing columns
-- =============================================================================
ALTER TABLE public.user_plans
  ADD COLUMN IF NOT EXISTS price_monthly numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_yearly numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency varchar(3) DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS flutterwave_plan_id_monthly varchar(50),
  ADD COLUMN IF NOT EXISTS flutterwave_plan_id_yearly varchar(50);

COMMENT ON COLUMN public.user_plans.price_monthly IS 'Monthly subscription price';
COMMENT ON COLUMN public.user_plans.price_yearly IS 'Yearly subscription price (typically discounted)';
COMMENT ON COLUMN public.user_plans.currency IS 'ISO 4217 currency code for pricing';
COMMENT ON COLUMN public.user_plans.flutterwave_plan_id_monthly IS 'Flutterwave payment plan ID for monthly billing';
COMMENT ON COLUMN public.user_plans.flutterwave_plan_id_yearly IS 'Flutterwave payment plan ID for yearly billing';

-- =============================================================================
-- 2. CREATE subscriptions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.user_plans(id) ON DELETE RESTRICT,
  flutterwave_subscription_id varchar(50),
  flutterwave_customer_email varchar(255) NOT NULL,
  billing_interval varchar(10) CHECK (billing_interval IN ('monthly', 'yearly')),
  status varchar(20) DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'paused', 'past_due', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.subscriptions IS 'Tracks Flutterwave subscriptions linked to organizations and user plans';

-- =============================================================================
-- 3. CREATE payment_transactions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  flutterwave_tx_ref varchar(100) UNIQUE NOT NULL,
  flutterwave_tx_id varchar(50),
  amount numeric(10,2) NOT NULL,
  currency varchar(3) DEFAULT 'NGN',
  status varchar(20) DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'refunded')),
  payment_type varchar(20) DEFAULT 'subscription' CHECK (payment_type IN ('subscription', 'one_time', 'upgrade')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.payment_transactions IS 'Records all payment transactions processed through Flutterwave';

-- =============================================================================
-- 4. CREATE webhook_events table (idempotency + debugging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type varchar(50) NOT NULL,
  flutterwave_ref varchar(100),
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.webhook_events IS 'Stores Flutterwave webhook events for idempotent processing and debugging';

-- =============================================================================
-- 5. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_org_status
  ON public.subscriptions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
  ON public.subscriptions(user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_flutterwave_sub_id
  ON public.subscriptions(flutterwave_subscription_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_org_created
  ON public.payment_transactions(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_subscription_id
  ON public.payment_transactions(subscription_id);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_flutterwave_tx_ref
  ON public.payment_transactions(flutterwave_tx_ref);

CREATE INDEX IF NOT EXISTS idx_webhook_events_flutterwave_ref
  ON public.webhook_events(flutterwave_ref);

CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_created
  ON public.webhook_events(processed, created_at);

-- =============================================================================
-- 6. ENABLE RLS
-- =============================================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 7. RLS POLICIES — subscriptions
-- =============================================================================

-- Users can view their own organization's subscriptions
DROP POLICY IF EXISTS subscriptions_select_own_org ON public.subscriptions;
CREATE POLICY subscriptions_select_own_org
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- Service role has full access (used by webhook handlers / server-side code)
DROP POLICY IF EXISTS subscriptions_service_role_all ON public.subscriptions;
CREATE POLICY subscriptions_service_role_all
  ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 8. RLS POLICIES — payment_transactions
-- =============================================================================

-- Users can view their own organization's transactions
DROP POLICY IF EXISTS payment_transactions_select_own_org ON public.payment_transactions;
CREATE POLICY payment_transactions_select_own_org
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id());

-- Service role has full access
DROP POLICY IF EXISTS payment_transactions_service_role_all ON public.payment_transactions;
CREATE POLICY payment_transactions_service_role_all
  ON public.payment_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 9. RLS POLICIES — webhook_events (service role only, no public access)
-- =============================================================================

DROP POLICY IF EXISTS webhook_events_service_role_all ON public.webhook_events;
CREATE POLICY webhook_events_service_role_all
  ON public.webhook_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 10. UPDATED_AT TRIGGERS
-- =============================================================================

-- Reuse the existing trigger function if available, otherwise create one
CREATE OR REPLACE FUNCTION public.update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

DROP TRIGGER IF EXISTS payment_transactions_updated_at ON public.payment_transactions;
CREATE TRIGGER payment_transactions_updated_at
  BEFORE UPDATE ON public.payment_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_subscription_updated_at();

-- =============================================================================
-- 11. RPC: handle_subscription_change
--     Atomically updates subscription + user_plan_assignments + audit log
--     to keep billing state and plan access in sync (architecture finding #6).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_subscription_change(
  p_subscription_id uuid,
  p_new_status varchar(20),
  p_plan_id uuid DEFAULT NULL,
  p_current_period_start timestamptz DEFAULT NULL,
  p_current_period_end timestamptz DEFAULT NULL,
  p_cancel_at_period_end boolean DEFAULT NULL,
  p_cancelled_at timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_old_status varchar(20);
  v_effective_plan_id uuid;
  v_assignment_id uuid;
BEGIN
  -- Lock the subscription row to prevent concurrent modifications
  SELECT *
    INTO v_sub
    FROM public.subscriptions
   WHERE id = p_subscription_id
     FOR UPDATE;

  IF v_sub IS NULL THEN
    RAISE EXCEPTION 'Subscription not found: %', p_subscription_id;
  END IF;

  v_old_status := v_sub.status;
  v_effective_plan_id := COALESCE(p_plan_id, v_sub.plan_id);

  -- Update the subscription record
  UPDATE public.subscriptions
     SET status                = COALESCE(p_new_status, status),
         plan_id               = v_effective_plan_id,
         current_period_start  = COALESCE(p_current_period_start, current_period_start),
         current_period_end    = COALESCE(p_current_period_end, current_period_end),
         cancel_at_period_end  = COALESCE(p_cancel_at_period_end, cancel_at_period_end),
         cancelled_at          = COALESCE(p_cancelled_at, cancelled_at),
         updated_at            = now()
   WHERE id = p_subscription_id;

  -- Sync user_plan_assignments based on the new status
  IF p_new_status IN ('active', 'trialing') THEN
    -- Revoke any existing active assignments for this user
    UPDATE public.user_plan_assignments
       SET status     = 'revoked',
           notes      = 'Replaced by subscription change at ' || now()::text,
           updated_at = now()
     WHERE user_id = v_sub.user_id
       AND status = 'active';

    -- Create new active assignment
    INSERT INTO public.user_plan_assignments (
      user_id,
      plan_id,
      assigned_by,
      starts_at,
      expires_at,
      notes,
      status
    )
    VALUES (
      v_sub.user_id,
      v_effective_plan_id,
      v_sub.user_id, -- self-assigned via subscription
      COALESCE(p_current_period_start, now()),
      p_current_period_end,
      'Auto-assigned via Flutterwave subscription ' || v_sub.flutterwave_subscription_id,
      'active'
    )
    RETURNING id INTO v_assignment_id;

  ELSIF p_new_status IN ('cancelled', 'past_due') THEN
    -- Revoke current plan assignment when subscription is cancelled or past due
    UPDATE public.user_plan_assignments
       SET status     = 'revoked',
           notes      = COALESCE(notes || E'\n', '') || 'Revoked: subscription ' || p_new_status || ' at ' || now()::text,
           updated_at = now()
     WHERE user_id = v_sub.user_id
       AND status = 'active';

    -- If cancelled but cancel_at_period_end is true, keep the plan until period ends
    IF p_new_status = 'cancelled' AND COALESCE(p_cancel_at_period_end, v_sub.cancel_at_period_end) = true
       AND v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() THEN
      INSERT INTO public.user_plan_assignments (
        user_id,
        plan_id,
        assigned_by,
        starts_at,
        expires_at,
        notes,
        status
      )
      VALUES (
        v_sub.user_id,
        v_effective_plan_id,
        v_sub.user_id,
        now(),
        COALESCE(p_current_period_end, v_sub.current_period_end),
        'Grace period: subscription cancelled, access until ' || COALESCE(p_current_period_end, v_sub.current_period_end)::text,
        'active'
      )
      RETURNING id INTO v_assignment_id;
    END IF;
  END IF;
  -- 'paused' status: leave existing assignment as-is (can be handled by cron/edge function)

  -- Insert audit log entry
  PERFORM public.log_security_event(
    p_organization_id := v_sub.organization_id,
    p_actor_user_id   := v_sub.user_id,
    p_event_type      := 'subscription.status_changed',
    p_severity        := 'info',
    p_source          := 'billing',
    p_target_type     := 'subscription',
    p_target_id       := p_subscription_id::text,
    p_event_data      := jsonb_build_object(
      'old_status', v_old_status,
      'new_status', p_new_status,
      'plan_id', v_effective_plan_id,
      'flutterwave_subscription_id', v_sub.flutterwave_subscription_id,
      'assignment_id', v_assignment_id,
      'cancel_at_period_end', COALESCE(p_cancel_at_period_end, v_sub.cancel_at_period_end)
    )
  );

  RETURN json_build_object(
    'success', true,
    'subscription_id', p_subscription_id,
    'old_status', v_old_status,
    'new_status', p_new_status,
    'plan_id', v_effective_plan_id,
    'assignment_id', v_assignment_id,
    'message', 'Subscription and plan assignment updated successfully'
  );
END;
$$;

COMMENT ON FUNCTION public.handle_subscription_change IS
  'Atomically updates subscription status and syncs user_plan_assignments + audit log';

-- Grant to service_role only (called from server-side webhook handler)
GRANT EXECUTE ON FUNCTION public.handle_subscription_change(uuid, varchar, uuid, timestamptz, timestamptz, boolean, timestamptz)
  TO service_role;

-- =============================================================================
-- 12. RPC: get_organization_billing
--     Returns current subscription, plan details, and recent transactions.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_organization_billing(
  p_organization_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_subscription json;
  v_plan json;
  v_transactions json;
BEGIN
  -- Resolve organization: use parameter or fall back to user's org
  v_org_id := COALESCE(p_organization_id, public.get_user_organization_id());

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization not found for current user';
  END IF;

  -- Verify the caller belongs to this organization (or is platform admin)
  IF v_org_id != public.get_user_organization_id() AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: you do not belong to this organization';
  END IF;

  -- Current subscription (most recent active or trialing)
  SELECT json_build_object(
    'id', s.id,
    'plan_id', s.plan_id,
    'flutterwave_subscription_id', s.flutterwave_subscription_id,
    'flutterwave_customer_email', s.flutterwave_customer_email,
    'billing_interval', s.billing_interval,
    'status', s.status,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end,
    'cancelled_at', s.cancelled_at,
    'created_at', s.created_at,
    'updated_at', s.updated_at
  )
  INTO v_subscription
  FROM public.subscriptions s
  WHERE s.organization_id = v_org_id
    AND s.status IN ('active', 'trialing', 'past_due')
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Plan details for the current subscription
  IF v_subscription IS NOT NULL THEN
    SELECT json_build_object(
      'id', up.id,
      'name', up.name,
      'display_name', up.display_name,
      'description', up.description,
      'plan_type', up.plan_type,
      'features', up.features,
      'price_monthly', up.price_monthly,
      'price_yearly', up.price_yearly,
      'currency', up.currency
    )
    INTO v_plan
    FROM public.user_plans up
    WHERE up.id = (v_subscription->>'plan_id')::uuid;
  END IF;

  -- Recent 20 payment transactions
  SELECT COALESCE(json_agg(t ORDER BY t.created_at DESC), '[]'::json)
  INTO v_transactions
  FROM (
    SELECT
      pt.id,
      pt.subscription_id,
      pt.flutterwave_tx_ref,
      pt.flutterwave_tx_id,
      pt.amount,
      pt.currency,
      pt.status,
      pt.payment_type,
      pt.metadata,
      pt.created_at
    FROM public.payment_transactions pt
    WHERE pt.organization_id = v_org_id
    ORDER BY pt.created_at DESC
    LIMIT 20
  ) t;

  RETURN json_build_object(
    'organization_id', v_org_id,
    'subscription', v_subscription,
    'plan', v_plan,
    'recent_transactions', v_transactions
  );
END;
$$;

COMMENT ON FUNCTION public.get_organization_billing IS
  'Returns current subscription, plan details, and recent payment transactions for an organization';

GRANT EXECUTE ON FUNCTION public.get_organization_billing(uuid)
  TO authenticated, service_role;
