-- Add RLS policies for all tables and fix organization relationships

-- Enable RLS on all tables that don't have it
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.best_practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get current user's organization
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS UUID AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Create security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies for best_practices (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view best practices" ON public.best_practices
FOR SELECT TO authenticated USING (true);

-- RLS Policies for calendar_events
CREATE POLICY "Users can view events in their organization" ON public.calendar_events
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create events in their organization" ON public.calendar_events
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update events in their organization" ON public.calendar_events
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete events in their organization" ON public.calendar_events
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for cases
CREATE POLICY "Users can view cases in their organization" ON public.cases
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create cases in their organization" ON public.cases
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update cases in their organization" ON public.cases
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete cases in their organization" ON public.cases
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for clients
CREATE POLICY "Users can view clients in their organization" ON public.clients
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create clients in their organization" ON public.clients
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update clients in their organization" ON public.clients
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete clients in their organization" ON public.clients
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for communication_logs
CREATE POLICY "Users can view comm logs in their organization" ON public.communication_logs
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create comm logs in their organization" ON public.communication_logs
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

-- RLS Policies for contracts
CREATE POLICY "Users can view contracts in their organization" ON public.contracts
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create contracts in their organization" ON public.contracts
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update contracts in their organization" ON public.contracts
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete contracts in their organization" ON public.contracts
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for dashboard_prefs
CREATE POLICY "Users can view their own dashboard prefs" ON public.dashboard_prefs
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create their own dashboard prefs" ON public.dashboard_prefs
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their own dashboard prefs" ON public.dashboard_prefs
FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for doc_templates
CREATE POLICY "Users can view templates in their organization" ON public.doc_templates
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create templates in their organization" ON public.doc_templates
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update templates in their organization" ON public.doc_templates
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete templates in their organization" ON public.doc_templates
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for documents
CREATE POLICY "Users can view documents in their organization" ON public.documents
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create documents in their organization" ON public.documents
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update documents in their organization" ON public.documents
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete documents in their organization" ON public.documents
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for invitations (admins only)
CREATE POLICY "Admins can view invitations in their organization" ON public.invitations
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

CREATE POLICY "Admins can create invitations in their organization" ON public.invitations
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id() AND is_user_admin());

CREATE POLICY "Admins can update invitations in their organization" ON public.invitations
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

CREATE POLICY "Admins can delete invitations in their organization" ON public.invitations
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- RLS Policies for invoice_items
CREATE POLICY "Users can view invoice items in their organization" ON public.invoice_items
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create invoice items in their organization" ON public.invoice_items
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update invoice items in their organization" ON public.invoice_items
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete invoice items in their organization" ON public.invoice_items
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for invoice_templates
CREATE POLICY "Users can view invoice templates in their organization" ON public.invoice_templates
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create invoice templates in their organization" ON public.invoice_templates
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update invoice templates in their organization" ON public.invoice_templates
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete invoice templates in their organization" ON public.invoice_templates
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for invoices
CREATE POLICY "Users can view invoices in their organization" ON public.invoices
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create invoices in their organization" ON public.invoices
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update invoices in their organization" ON public.invoices
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete invoices in their organization" ON public.invoices
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create notifications in their organization" ON public.notifications
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their own notifications" ON public.notifications
FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications" ON public.notifications
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for openai_usage
CREATE POLICY "Users can view their own usage" ON public.openai_usage
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create their own usage records" ON public.openai_usage
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- RLS Policies for organizations (users can only see their own)
CREATE POLICY "Users can view their own organization" ON public.organizations
FOR SELECT TO authenticated USING (id = get_current_user_organization_id());

CREATE POLICY "Admins can update their organization" ON public.organizations
FOR UPDATE TO authenticated USING (id = get_current_user_organization_id() AND is_user_admin());

-- RLS Policies for profiles
CREATE POLICY "Users can view profiles in their organization" ON public.profiles
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their own profile" ON public.profiles
FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins can update profiles in their organization" ON public.profiles
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- RLS Policies for settings
CREATE POLICY "Users can view settings in their organization" ON public.settings
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Admins can manage settings in their organization" ON public.settings
FOR ALL TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- RLS Policies for time_entries
CREATE POLICY "Users can view time entries in their organization" ON public.time_entries
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create time entries in their organization" ON public.time_entries
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their own time entries" ON public.time_entries
FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own time entries" ON public.time_entries
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for usage_counters
CREATE POLICY "Users can view their own usage counters" ON public.usage_counters
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can create their own usage counters" ON public.usage_counters
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own usage counters" ON public.usage_counters
FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Admins can view roles in their organization" ON public.user_roles
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

CREATE POLICY "Admins can manage roles in their organization" ON public.user_roles
FOR ALL TO authenticated USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- Fix organization_id relationships - add missing organization_id columns
ALTER TABLE public.case_activities ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Update existing case_activities to have organization_id
UPDATE public.case_activities 
SET organization_id = (
  SELECT organization_id 
  FROM public.cases 
  WHERE cases.id = case_activities.case_id
) 
WHERE organization_id IS NULL;

-- Make organization_id NOT NULL for case_activities
ALTER TABLE public.case_activities ALTER COLUMN organization_id SET NOT NULL;