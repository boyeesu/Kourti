-- Create admin_actions table to track all super admin operations
-- This is separate from audit_logs as it tracks platform-level admin actions

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- 'user_approved', 'user_disabled', 'user_deleted', 'org_created', 'org_disabled', etc.
  target_type TEXT NOT NULL, -- 'user', 'organization', 'system'
  target_id UUID, -- ID of the target (user_id, org_id, etc.)
  details JSONB DEFAULT '{}'::jsonb, -- Additional action details
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view admin actions
DROP POLICY IF EXISTS "Platform admins can view admin actions" ON public.admin_actions;
CREATE POLICY "Platform admins can view admin actions"
  ON public.admin_actions
  FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- System can insert admin actions (via functions)
DROP POLICY IF EXISTS "System can insert admin actions" ON public.admin_actions;
CREATE POLICY "System can insert admin actions"
  ON public.admin_actions
  FOR INSERT
  WITH CHECK (true);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_user_id ON public.admin_actions(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action_type ON public.admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target_type ON public.admin_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON public.admin_actions(created_at DESC);

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type TEXT,
  p_target_type TEXT,
  p_target_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action_id UUID;
  v_admin_id UUID;
BEGIN
  -- Get current user ID
  v_admin_id := auth.uid();
  
  -- Verify user is platform admin
  IF NOT is_platform_admin(v_admin_id) THEN
    RAISE EXCEPTION 'Only platform admins can log admin actions';
  END IF;
  
  -- Insert admin action
  INSERT INTO admin_actions (
    admin_user_id,
    action_type,
    target_type,
    target_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    v_admin_id,
    p_action_type,
    p_target_type,
    p_target_id,
    p_details,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_action_id;
  
  RETURN v_action_id;
END;
$$;

-- Add comments
COMMENT ON TABLE public.admin_actions IS 'Tracks all actions performed by platform administrators for audit and compliance';
COMMENT ON FUNCTION public.log_admin_action IS 'Logs an admin action with context. Only callable by platform admins.';
