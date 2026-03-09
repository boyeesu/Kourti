-- ============================================================================
-- Migration: Security Audit Fixes
-- Date: 2026-03-10
-- Description: Comprehensive fixes for all issues found during security audit
-- ============================================================================

-- ============================================================================
-- SECTION 1: CRITICAL — Revoke webhook function grants from authenticated
-- Issue: get_pending_webhook_deliveries exposes webhook secrets to any user
-- Issue: update_webhook_delivery_status allows any user to tamper with deliveries
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_pending_webhook_deliveries') THEN
    REVOKE EXECUTE ON FUNCTION public.get_pending_webhook_deliveries(integer) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked get_pending_webhook_deliveries from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_webhook_delivery_status') THEN
    REVOKE EXECUTE ON FUNCTION public.update_webhook_delivery_status(uuid, text, integer, text, text, timestamptz, integer) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked update_webhook_delivery_status from authenticated';
  END IF;
END $$;

-- ============================================================================
-- SECTION 2: CRITICAL — Revoke REST API function grants from authenticated
-- Issue: These SECURITY DEFINER functions have no auth checks and allow
--        cross-tenant access when called by any authenticated user
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_api_key') THEN
    REVOKE EXECUTE ON FUNCTION public.validate_api_key(text, text) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked validate_api_key from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_api_rate_limit') THEN
    REVOKE EXECUTE ON FUNCTION public.check_api_rate_limit(uuid, integer) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked check_api_rate_limit from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_api_request') THEN
    REVOKE EXECUTE ON FUNCTION public.log_api_request(uuid, uuid, text, text, inet, jsonb) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked log_api_request from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_api_request') THEN
    REVOKE EXECUTE ON FUNCTION public.complete_api_request(uuid, integer, jsonb, text) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked complete_api_request from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'api_get_calendar_events') THEN
    REVOKE EXECUTE ON FUNCTION public.api_get_calendar_events(uuid, timestamptz, timestamptz, integer, integer) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked api_get_calendar_events from authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'api_create_calendar_event') THEN
    REVOKE EXECUTE ON FUNCTION public.api_create_calendar_event(uuid, text, text, timestamptz, timestamptz, text, uuid, jsonb) FROM authenticated;
    RAISE NOTICE 'FIXED: Revoked api_create_calendar_event from authenticated';
  END IF;
END $$;

-- ============================================================================
-- SECTION 3: HIGH — Fix get_user_current_plan NULL check bypass
-- Issue: auth.uid() NULL allows unauthenticated access to any user's plan
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_current_plan(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  assignment_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  plan_type TEXT,
  features JSONB,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY: Reject unauthenticated callers
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Users can only view their own plan, platform admins can view any user's plan
  IF p_user_id != auth.uid() AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view other users plans';
  END IF;

  RETURN QUERY
  SELECT
    upa.id as assignment_id,
    up.id as plan_id,
    up.name as plan_name,
    up.display_name as plan_display_name,
    up.plan_type,
    up.features,
    upa.starts_at,
    upa.expires_at,
    upa.status
  FROM public.user_plan_assignments upa
  JOIN public.user_plans up ON up.id = upa.plan_id
  WHERE upa.user_id = p_user_id
    AND upa.status = 'active'
  ORDER BY upa.starts_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- SECTION 4: HIGH — Enable RLS on reminder_templates and reminder_queue
-- Issue: No RLS at all — full cross-org exposure
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminder_templates') THEN
    ALTER TABLE public.reminder_templates ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "reminder_templates_select" ON public.reminder_templates;
    CREATE POLICY "reminder_templates_select" ON public.reminder_templates
      FOR SELECT TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "reminder_templates_insert" ON public.reminder_templates;
    CREATE POLICY "reminder_templates_insert" ON public.reminder_templates
      FOR INSERT TO authenticated
      WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "reminder_templates_update" ON public.reminder_templates;
    CREATE POLICY "reminder_templates_update" ON public.reminder_templates
      FOR UPDATE TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
      ));

    DROP POLICY IF EXISTS "reminder_templates_delete" ON public.reminder_templates;
    CREATE POLICY "reminder_templates_delete" ON public.reminder_templates
      FOR DELETE TO authenticated
      USING (
        organization_id IN (
          SELECT organization_id FROM public.profiles
          WHERE user_id = auth.uid() AND role IN ('admin', 'superadmin')
        )
      );

    RAISE NOTICE 'FIXED: Enabled RLS on reminder_templates with org-scoped policies';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'reminder_queue') THEN
    ALTER TABLE public.reminder_queue ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "reminder_queue_service_role" ON public.reminder_queue;
    CREATE POLICY "reminder_queue_service_role" ON public.reminder_queue
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "reminder_queue_select_own" ON public.reminder_queue;
    CREATE POLICY "reminder_queue_select_own" ON public.reminder_queue
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    RAISE NOTICE 'FIXED: Enabled RLS on reminder_queue with user-scoped + service_role policies';
  END IF;
END $$;

-- ============================================================================
-- SECTION 5: HIGH — Add search_path to core SECURITY DEFINER helper functions
-- Issue: Missing search_path enables privilege escalation via schema poisoning
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE EXISTS(
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
        AND organization_id = public.get_user_organization_id()
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_granted boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT organization_id, role INTO v_org_id, v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  SELECT granted INTO v_granted
  FROM public.role_permissions
  WHERE role_name = v_role
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action;

  IF v_granted IS NULL THEN
    SELECT granted INTO v_granted
    FROM public.role_permissions
    WHERE role_name = v_role
      AND organization_id = v_org_id
      AND resource = p_resource
      AND action = 'manage';
  END IF;

  RETURN COALESCE(v_granted, FALSE);
END;
$$;

-- ============================================================================
-- SECTION 6: HIGH — Add search_path to digest email functions
-- Issue: SECURITY DEFINER without search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION get_users_for_digest(p_digest_type TEXT, p_current_time TIME DEFAULT CURRENT_TIME)
RETURNS TABLE (user_id UUID, email TEXT, organization_id UUID, digest_time TIME, timezone TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        unp.user_id,
        u.email,
        unp.organization_id,
        unp.digest_email_time,
        unp.quiet_hours_timezone
    FROM user_notification_preferences unp
    JOIN auth.users u ON u.id = unp.user_id
    WHERE unp.digest_email_frequency = p_digest_type
    AND unp.enable_email_notifications = true
    AND (
        (p_digest_type = 'daily' AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
        OR
        (p_digest_type = 'weekly' AND EXTRACT(DOW FROM CURRENT_DATE) = 0 AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
    );
END;
$$;

CREATE OR REPLACE FUNCTION get_upcoming_events_for_digest(p_user_id UUID, p_organization_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS TABLE (event_id UUID, title TEXT, description TEXT, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, location TEXT, event_type TEXT, is_recurring BOOLEAN, created_by_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.id as event_id,
        ce.title,
        ce.description,
        ce.start_date,
        ce.end_date,
        ce.location,
        ce.event_type,
        ce.is_recurring,
        COALESCE(p.first_name || ' ' || p.last_name, u.email) as created_by_name
    FROM calendar_events ce
    LEFT JOIN profiles p ON p.user_id = ce.created_by
    LEFT JOIN auth.users u ON u.id = ce.created_by
    WHERE ce.organization_id = p_organization_id
    AND ce.start_date >= p_start_date::timestamptz
    AND ce.start_date < (p_end_date + INTERVAL '1 day')::timestamptz
    AND (
        ce.created_by = p_user_id
        OR ce.attendees @> ARRAY[(SELECT email FROM auth.users WHERE id = p_user_id)]
        OR EXISTS (
            SELECT 1 FROM calendar_shares cs
            WHERE cs.calendar_owner_id = ce.created_by
            AND cs.shared_with_user_id = p_user_id
            AND cs.is_active = true
        )
    )
    AND NOT ce.is_recurring
    ORDER BY ce.start_date ASC;
END;
$$;

-- ============================================================================
-- SECTION 7: HIGH — Add search_path to respond_to_invitation
-- Issue: SECURITY DEFINER without search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION respond_to_invitation(
    p_invitation_id UUID,
    p_response TEXT,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invitation RECORD;
BEGIN
    SELECT * INTO v_invitation
    FROM event_invitations
    WHERE id = p_invitation_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Verify user is the invitee
    IF v_invitation.invitee_user_id != p_user_id AND
       v_invitation.invitee_email != (SELECT email FROM auth.users WHERE id = p_user_id) THEN
        RETURN false;
    END IF;

    UPDATE event_invitations
    SET
        status = p_response,
        responded_at = NOW(),
        invitee_user_id = COALESCE(v_invitation.invitee_user_id, p_user_id)
    WHERE id = p_invitation_id;

    -- Create notification for event creator
    INSERT INTO notifications (
        user_id,
        organization_id,
        type,
        title,
        message,
        link
    )
    SELECT
        ce.created_by,
        ce.organization_id,
        'invitation_response',
        'Invitation ' || initcap(p_response),
        (SELECT email FROM auth.users WHERE id = p_user_id) || ' has ' || p_response || ' your invitation',
        '/calendar'
    FROM calendar_events ce
    WHERE ce.id = v_invitation.event_id;

    RETURN true;
END;
$$;

-- ============================================================================
-- SECTION 8: HIGH — Restrict log_security_event (audit log pollution)
-- Issue: Any authenticated user can insert arbitrary audit log entries
--        with any actor_user_id, enabling impersonation in logs
-- ============================================================================

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
  v_caller_role text;
  v_actual_actor uuid;
BEGIN
  -- Get the caller's role
  v_caller_role := current_setting('request.jwt.claim.role', true);

  -- For authenticated callers (not service_role), enforce actor = self
  IF v_caller_role = 'authenticated' THEN
    v_actual_actor := auth.uid();
  ELSE
    v_actual_actor := p_actor_user_id;
  END IF;

  INSERT INTO public.security_audit_logs (
    organization_id, actor_user_id, actor_type, event_type, severity,
    source, ip_address, user_agent, target_type, target_id, event_data, created_at
  )
  VALUES (
    p_organization_id, v_actual_actor,
    CASE WHEN v_actual_actor IS NULL THEN 'system' ELSE 'user' END,
    p_event_type,
    CASE WHEN p_severity IN ('info', 'warning', 'error', 'critical') THEN p_severity ELSE 'info' END,
    COALESCE(NULLIF(p_source, ''), 'api'),
    p_ip_address, p_user_agent, p_target_type, p_target_id,
    COALESCE(p_event_data, '{}'::jsonb), now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================================
-- SECTION 9: MEDIUM — Scope webhook endpoint admin policies to organization
-- Issue: Admin in Org A can see/modify webhook endpoints in Org B
-- ============================================================================

DROP POLICY IF EXISTS webhook_endpoints_admin_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_select ON public.webhook_endpoints
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
        AND (webhook_endpoints.organization_id IS NULL OR p.organization_id = webhook_endpoints.organization_id)
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_insert ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_insert ON public.webhook_endpoints
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
        AND p.organization_id = webhook_endpoints.organization_id
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_update ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_update ON public.webhook_endpoints
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
        AND p.organization_id = webhook_endpoints.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
        AND p.organization_id = webhook_endpoints.organization_id
    )
  );

DROP POLICY IF EXISTS webhook_endpoints_admin_delete ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_delete ON public.webhook_endpoints
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
        AND p.organization_id = webhook_endpoints.organization_id
    )
  );

-- ============================================================================
-- SECTION 10: HIGH — Fix Stripe organization_subscriptions RLS
-- Issue: Any org member can INSERT/UPDATE subscription records
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'organization_subscriptions') THEN
    -- Fix INSERT: only admins
    DROP POLICY IF EXISTS "org_subscriptions_insert" ON public.organization_subscriptions;
    CREATE POLICY "org_subscriptions_insert" ON public.organization_subscriptions
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id = public.get_user_organization_id()
        AND public.current_user_is_org_admin()
      );

    -- Add service_role INSERT
    DROP POLICY IF EXISTS "org_subscriptions_service_insert" ON public.organization_subscriptions;
    CREATE POLICY "org_subscriptions_service_insert" ON public.organization_subscriptions
      FOR INSERT TO service_role
      WITH CHECK (true);

    -- Fix UPDATE: only admins
    DROP POLICY IF EXISTS "org_subscriptions_update" ON public.organization_subscriptions;
    CREATE POLICY "org_subscriptions_update" ON public.organization_subscriptions
      FOR UPDATE TO authenticated
      USING (
        organization_id = public.get_user_organization_id()
        AND public.current_user_is_org_admin()
      );

    -- Add service_role UPDATE
    DROP POLICY IF EXISTS "org_subscriptions_service_update" ON public.organization_subscriptions;
    CREATE POLICY "org_subscriptions_service_update" ON public.organization_subscriptions
      FOR UPDATE TO service_role
      USING (true);

    RAISE NOTICE 'FIXED: Restricted organization_subscriptions INSERT/UPDATE to admins + service_role';
  END IF;
END $$;

-- ============================================================================
-- SECTION 11: HIGH — Fix self-registration superadmin role assignment
-- Issue: handle_new_user_ultra_fast assigns 'superadmin' to self-registering users
-- Fix: Change to 'admin' — they're creating their own org, should be admin of it
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Single INSERT with all necessary data
  -- SECURITY FIX: Self-registering users get 'admin' role (not 'superadmin')
  INSERT INTO profiles (
    user_id,
    email,
    first_name,
    last_name,
    organization_id,
    role,
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    inv_org,
    COALESCE(inv_role::user_role,
             CASE WHEN inv_org IS NULL THEN 'admin'::user_role
                  ELSE 'user'::user_role END),
    inv_org IS NULL,
    now(),
    now()
  );

  -- Update invitation status
  IF inv_org IS NOT NULL THEN
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = (
      SELECT id FROM invitations
      WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Minimal fallback - just create profile, don't fail signup
  BEGIN
    INSERT INTO profiles (
      user_id,
      email,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      'user'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- SECTION 12: MEDIUM — Add self-deletion guard to delete_user_safe
-- Issue: Platform admin can delete themselves or other platform admins
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user_safe(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete users';
  END IF;

  -- SECURITY: Prevent self-deletion
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- SECURITY: Prevent deletion of other platform admins
  IF EXISTS (
    SELECT 1 FROM public.user_role_assignments
    WHERE user_id = p_user_id AND role_name = 'platform_admin'
  ) THEN
    RAISE EXCEPTION 'Cannot delete another platform admin. Remove their platform_admin role first.';
  END IF;

  -- Get user info for logging
  SELECT email, organization_id INTO v_email, v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;

  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'user_deleted',
    'user',
    p_user_id,
    jsonb_build_object(
      'user_email', v_email,
      'organization_id', v_org_id,
      'reason', p_reason
    )
  );

  -- Delete the user (CASCADE will handle related records)
  DELETE FROM auth.users
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

-- ============================================================================
-- SECTION 13: LOW — Add search_path to user plan trigger functions
-- ============================================================================

CREATE OR REPLACE FUNCTION update_user_plan_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION expire_user_plans()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_plan_assignments
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- ============================================================================
-- SECTION 14: MEDIUM — Drop migration helper functions
-- Issue: _create_org_rls and _create_child_org_rls are migration utilities
--        that should not persist in production
-- ============================================================================

DROP FUNCTION IF EXISTS public._create_org_rls(text);
DROP FUNCTION IF EXISTS public._create_child_org_rls(text, text, text);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Security Audit Fixes Applied ===';
  RAISE NOTICE '';

  -- Verify webhook functions are not granted to authenticated
  SELECT COUNT(*) INTO v_count
  FROM information_schema.routine_privileges
  WHERE routine_name = 'get_pending_webhook_deliveries'
    AND grantee = 'authenticated';
  RAISE NOTICE 'get_pending_webhook_deliveries grants to authenticated: % (should be 0)', v_count;

  -- Verify reminder_templates has RLS
  SELECT COUNT(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'reminder_templates' AND c.relrowsecurity = true;
  RAISE NOTICE 'reminder_templates RLS enabled: %', CASE WHEN v_count > 0 THEN 'YES' ELSE 'N/A (table may not exist)' END;

  -- Verify reminder_queue has RLS
  SELECT COUNT(*) INTO v_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'reminder_queue' AND c.relrowsecurity = true;
  RAISE NOTICE 'reminder_queue RLS enabled: %', CASE WHEN v_count > 0 THEN 'YES' ELSE 'N/A (table may not exist)' END;

  -- Verify core helpers have search_path
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'get_user_organization_id'
    AND pronamespace = 'public'::regnamespace
    AND proconfig::text LIKE '%search_path%';
  RAISE NOTICE 'get_user_organization_id has search_path: %', CASE WHEN v_count > 0 THEN 'YES' ELSE 'NO' END;

  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'has_permission'
    AND pronamespace = 'public'::regnamespace
    AND proconfig::text LIKE '%search_path%';
  RAISE NOTICE 'has_permission has search_path: %', CASE WHEN v_count > 0 THEN 'YES' ELSE 'NO' END;

  -- Verify helper functions are dropped
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname IN ('_create_org_rls', '_create_child_org_rls')
    AND pronamespace = 'public'::regnamespace;
  RAISE NOTICE 'Migration helper functions remaining: % (should be 0)', v_count;

  RAISE NOTICE '';
  RAISE NOTICE 'Fixes applied:';
  RAISE NOTICE '  1. Revoked webhook function grants from authenticated (CRITICAL)';
  RAISE NOTICE '  2. Revoked REST API function grants from authenticated (CRITICAL)';
  RAISE NOTICE '  3. Fixed get_user_current_plan NULL check bypass (HIGH)';
  RAISE NOTICE '  4. Enabled RLS on reminder_templates and reminder_queue (HIGH)';
  RAISE NOTICE '  5. Added search_path to core SECURITY DEFINER helpers (HIGH)';
  RAISE NOTICE '  6. Added search_path to digest email functions (HIGH)';
  RAISE NOTICE '  7. Added search_path to respond_to_invitation (HIGH)';
  RAISE NOTICE '  8. Restricted log_security_event actor validation (HIGH)';
  RAISE NOTICE '  9. Scoped webhook endpoint policies to organization (MEDIUM)';
  RAISE NOTICE '  10. Restricted Stripe subscription RLS to admins (HIGH)';
  RAISE NOTICE '  11. Fixed self-registration role from superadmin to admin (HIGH)';
  RAISE NOTICE '  12. Added self-deletion guard to delete_user_safe (MEDIUM)';
  RAISE NOTICE '  13. Added search_path to user plan trigger functions (LOW)';
  RAISE NOTICE '  14. Dropped migration helper functions (MEDIUM)';
  RAISE NOTICE '';
END $$;
