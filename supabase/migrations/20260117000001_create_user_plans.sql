-- Create user plans system
-- This allows platform admins to assign plans to users with duration/validity

-- Create user_plans table (defines available plans)
CREATE TABLE IF NOT EXISTS public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise')),
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_plan_assignments table (tracks user plan assignments)
CREATE TABLE IF NOT EXISTS public.user_plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.user_plans(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL means no expiration (permanent)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_plans_type ON public.user_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_user_plans_active ON public.user_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_user_id ON public.user_plan_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_plan_id ON public.user_plan_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_status ON public.user_plan_assignments(status);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_expires_at ON public.user_plan_assignments(expires_at);

-- Enable RLS
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_plans (readable by all authenticated users)
DROP POLICY IF EXISTS "user_plans_select" ON public.user_plans;
CREATE POLICY "user_plans_select" ON public.user_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for user_plan_assignments
-- Users can view their own plan assignments
DROP POLICY IF EXISTS "user_plan_assignments_select_own" ON public.user_plan_assignments;
CREATE POLICY "user_plan_assignments_select_own" ON public.user_plan_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Platform admins can view all assignments
DROP POLICY IF EXISTS "user_plan_assignments_select_all" ON public.user_plan_assignments;
CREATE POLICY "user_plan_assignments_select_all" ON public.user_plan_assignments
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

-- Platform admins can insert assignments
DROP POLICY IF EXISTS "user_plan_assignments_insert" ON public.user_plan_assignments;
CREATE POLICY "user_plan_assignments_insert" ON public.user_plan_assignments
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin(auth.uid()));

-- Platform admins can update assignments
DROP POLICY IF EXISTS "user_plan_assignments_update" ON public.user_plan_assignments;
CREATE POLICY "user_plan_assignments_update" ON public.user_plan_assignments
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()));

-- Insert default plans based on pricing structure
INSERT INTO public.user_plans (name, display_name, description, plan_type, features) VALUES
  ('free', 'Free Plan', 'Basic access with limited features', 'free', 
   '["Basic document storage", "Limited cases", "Email support"]'::jsonb),
  ('starter', 'Starter Plan', 'Perfect for small teams getting started', 'starter',
   '["Up to 5 users", "100 cases", "Basic document storage", "Email support"]'::jsonb),
  ('professional', 'Professional Plan', 'For growing legal practices', 'professional',
   '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support"]'::jsonb),
  ('enterprise', 'Enterprise Plan', 'For large organizations', 'enterprise',
   '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  plan_type = EXCLUDED.plan_type,
  features = EXCLUDED.features;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS user_plans_updated_at ON public.user_plans;
CREATE TRIGGER user_plans_updated_at
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION update_user_plan_updated_at();

DROP TRIGGER IF EXISTS user_plan_assignments_updated_at ON public.user_plan_assignments;
CREATE TRIGGER user_plan_assignments_updated_at
  BEFORE UPDATE ON public.user_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION update_user_plan_updated_at();

-- Function to automatically expire plans
CREATE OR REPLACE FUNCTION expire_user_plans()
RETURNS void
LANGUAGE plpgsql
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

-- Function to get user's current active plan
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

-- Function to assign plan to user (platform admin only)
CREATE OR REPLACE FUNCTION public.assign_user_plan(
  p_user_id UUID,
  p_plan_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id UUID;
  v_plan_name TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can assign plans to users';
  END IF;

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Verify plan exists and is active
  SELECT name INTO v_plan_name
  FROM public.user_plans
  WHERE id = p_plan_id AND is_active = true;
  
  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  -- Revoke any existing active plans for this user
  UPDATE public.user_plan_assignments
  SET status = 'revoked',
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  -- Create new assignment
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
    p_user_id,
    p_plan_id,
    auth.uid(),
    now(),
    p_expires_at,
    p_notes,
    'active'
  )
  RETURNING id INTO v_assignment_id;

  RETURN json_build_object(
    'success', true,
    'assignment_id', v_assignment_id,
    'plan_name', v_plan_name,
    'message', 'Plan assigned successfully'
  );
END;
$$;

-- Function to revoke user plan (platform admin only)
CREATE OR REPLACE FUNCTION public.revoke_user_plan(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can revoke user plans';
  END IF;

  -- Revoke active plans
  UPDATE public.user_plan_assignments
  SET status = 'revoked',
      notes = COALESCE(notes || E'\n' || p_reason, p_reason),
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'No active plan found for user'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Plan revoked successfully'
  );
END;
$$;

-- Function to get all user plan assignments (platform admin only)
CREATE OR REPLACE FUNCTION public.get_all_user_plan_assignments()
RETURNS TABLE (
  assignment_id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  plan_type TEXT,
  assigned_by UUID,
  assigned_by_email TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view all user plan assignments';
  END IF;

  RETURN QUERY
  SELECT 
    upa.id as assignment_id,
    upa.user_id,
    u.email as user_email,
    COALESCE(p.first_name || ' ' || p.last_name, u.email) as user_name,
    up.id as plan_id,
    up.name as plan_name,
    up.display_name as plan_display_name,
    up.plan_type,
    upa.assigned_by,
    assigner.email as assigned_by_email,
    upa.starts_at,
    upa.expires_at,
    upa.status,
    upa.notes,
    upa.created_at
  FROM public.user_plan_assignments upa
  JOIN public.user_plans up ON up.id = upa.plan_id
  JOIN auth.users u ON u.id = upa.user_id
  LEFT JOIN public.profiles p ON p.user_id = upa.user_id
  LEFT JOIN auth.users assigner ON assigner.id = upa.assigned_by
  ORDER BY upa.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_current_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_plan(UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_plan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_user_plan_assignments() TO authenticated;

-- Comments
COMMENT ON TABLE public.user_plans IS 'Available plans that can be assigned to users';
COMMENT ON TABLE public.user_plan_assignments IS 'Tracks which users have which plans and when they expire';
COMMENT ON FUNCTION public.get_user_current_plan IS 'Gets the current active plan for a user';
COMMENT ON FUNCTION public.assign_user_plan IS 'Assigns a plan to a user (platform admin only)';
COMMENT ON FUNCTION public.revoke_user_plan IS 'Revokes a users active plan (platform admin only)';
COMMENT ON FUNCTION public.get_all_user_plan_assignments IS 'Gets all user plan assignments (platform admin only)';
