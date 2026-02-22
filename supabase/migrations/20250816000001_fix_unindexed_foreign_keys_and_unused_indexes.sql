-- Fix unindexed foreign keys by adding indexes

CREATE INDEX IF NOT EXISTS idx_calendar_events_case_id ON public.calendar_events (case_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id ON public.calendar_events (client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by ON public.calendar_events (created_by);

CREATE INDEX IF NOT EXISTS idx_case_activities_assigned_to ON public.case_activities (assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_activities_created_by ON public.case_activities (created_by);
CREATE INDEX IF NOT EXISTS idx_case_activities_organization_id ON public.case_activities (organization_id);

CREATE INDEX IF NOT EXISTS idx_cases_created_by ON public.cases (created_by);

CREATE INDEX IF NOT EXISTS idx_clients_created_by ON public.clients (created_by);

CREATE INDEX IF NOT EXISTS idx_communication_logs_user_id ON public.communication_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_organization_id ON public.communication_logs (organization_id);

CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON public.contracts (created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_client_id ON public.contracts (client_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_organization_id ON public.dashboard_prefs (organization_id);

CREATE INDEX IF NOT EXISTS idx_doc_templates_created_by ON public.doc_templates (created_by);

CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents (created_by);

CREATE INDEX IF NOT EXISTS idx_invoice_items_organization_id ON public.invoice_items (organization_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_templates_created_by ON public.invoice_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_templates_organization_id ON public.invoice_templates (organization_id);

CREATE INDEX IF NOT EXISTS idx_invoices_case_id ON public.invoices (case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices (created_by);

CREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON public.notifications (organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_disabled_by ON public.profiles (disabled_by);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles (role_id);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);

CREATE INDEX IF NOT EXISTS idx_time_entries_organization_id ON public.time_entries (organization_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_created_by ON public.user_roles (created_by);

-- Remove unused indexes if safe to do so
DROP INDEX IF EXISTS public.idx_clients_name;
DROP INDEX IF EXISTS public.idx_doc_templates_org;
DROP INDEX IF EXISTS public.idx_tasks_case_id;
DROP INDEX IF EXISTS public.idx_time_entries_activity_id;
DROP INDEX IF EXISTS public.invitations_org_idx;
