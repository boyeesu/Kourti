-- ============================================================================
-- PHASE 5-7: Optimizations (Performance, Missing Tables, Security Hardening)
-- ============================================================================

-- PHASE 5: Performance Optimization - Add Composite Indexes
-- ============================================================================

-- Index for case queries with organization and status filters
CREATE INDEX IF NOT EXISTS idx_cases_org_status ON public.cases(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_cases_org_assigned ON public.cases(organization_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_org_client ON public.cases(organization_id, client_id);

-- Index for document queries with organization filters
CREATE INDEX IF NOT EXISTS idx_documents_org_created ON public.documents(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_org_client ON public.documents(organization_id, client_id);

-- Index for contract queries with organization and date filters
CREATE INDEX IF NOT EXISTS idx_contracts_org_status ON public.contracts(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_org_dates ON public.contracts(organization_id, end_date) WHERE end_date IS NOT NULL;

-- Index for invoice queries
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_org_client ON public.invoices(organization_id, client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_due ON public.invoices(organization_id, due_date);

-- Index for calendar event queries
CREATE INDEX IF NOT EXISTS idx_calendar_org_dates ON public.calendar_events(organization_id, start_date, end_date);

-- Index for task queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_completed ON public.tasks(assigned_to, completed) WHERE assigned_to IS NOT NULL;

-- Index for notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON public.notifications(user_id, status, created_at DESC);

-- Index for user role assignments
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_user_org ON public.user_role_assignments(user_id, organization_id);

-- Covering index for profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_user_org_role ON public.profiles(user_id, organization_id, role);


-- PHASE 6: Missing Tables - Organization SSO Configs
-- ============================================================================

-- Create SSO configuration table for organizations
CREATE TABLE IF NOT EXISTS public.organization_sso_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft', 'okta', 'saml')),
  client_id TEXT NOT NULL,
  client_secret TEXT, -- Encrypted by application
  tenant_id TEXT, -- For Microsoft Azure AD
  domain TEXT, -- For domain-based SSO routing
  metadata_url TEXT, -- For SAML providers
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, provider)
);

-- Enable RLS on SSO configs
ALTER TABLE public.organization_sso_configs ENABLE ROW LEVEL SECURITY;

-- Only superadmins can manage SSO configs
CREATE POLICY "Superadmins can manage SSO configs in their organization"
  ON public.organization_sso_configs
  FOR ALL
  USING (
    organization_id = get_current_user_organization_id() 
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'::user_role
    )
  );

-- Add index for SSO config lookups
CREATE INDEX IF NOT EXISTS idx_sso_configs_org_provider ON public.organization_sso_configs(organization_id, provider, is_enabled);
CREATE INDEX IF NOT EXISTS idx_sso_configs_domain ON public.organization_sso_configs(domain) WHERE domain IS NOT NULL;

-- Add trigger for updated_at
CREATE TRIGGER update_sso_configs_updated_at
  BEFORE UPDATE ON public.organization_sso_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- PHASE 7: Security Hardening & Cleanup
-- ============================================================================

-- Add constraint to ensure users can't escalate their own privileges
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Prevent users from giving themselves admin/superadmin roles
  IF NEW.user_id = auth.uid() AND NEW.role_name IN ('admin', 'superadmin') THEN
    -- Check if the current user is already a superadmin
    IF NOT EXISTS (
      SELECT 1 FROM user_role_assignments
      WHERE user_id = auth.uid()
      AND role_name = 'superadmin'
      AND organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'Users cannot assign themselves admin or superadmin roles';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add trigger to prevent self-escalation
DROP TRIGGER IF EXISTS prevent_self_escalation ON public.user_role_assignments;
CREATE TRIGGER prevent_self_escalation
  BEFORE INSERT OR UPDATE ON public.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_role_escalation();

-- Add audit logging for sensitive operations
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(user_id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only superadmins can view audit logs
CREATE POLICY "Superadmins can view audit logs in their organization"
  ON public.audit_logs
  FOR SELECT
  USING (
    organization_id = get_current_user_organization_id() 
    AND EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = auth.uid() 
      AND role = 'superadmin'::user_role
    )
  );

-- System can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Add indexes for audit log queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);

-- Add function to log sensitive operations
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audit_id UUID;
  v_org_id UUID;
BEGIN
  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  INSERT INTO audit_logs (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  ) VALUES (
    v_org_id,
    auth.uid(),
    p_action,
    p_resource_type,
    p_resource_id,
    p_old_values,
    p_new_values
  ) RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- Add comments for documentation
COMMENT ON TABLE public.organization_sso_configs IS 'Stores SSO/OAuth configuration for organizations to enable enterprise single sign-on';
COMMENT ON TABLE public.audit_logs IS 'Audit trail for sensitive operations including role changes, permission modifications, and data access';
COMMENT ON FUNCTION public.prevent_self_role_escalation IS 'Prevents users from escalating their own privileges to admin or superadmin roles';
COMMENT ON FUNCTION public.log_audit_event IS 'Creates an audit log entry for sensitive operations with user context';