-- Migration: Fix unindexed foreign keys and drop truly unused indexes
-- Generated from Supabase database linter results
-- 
-- IMPORTANT: This migration adds indexes for ALL foreign key columns.
-- FK indexes are essential for:
--   - Efficient JOIN operations
--   - Fast CASCADE DELETE/UPDATE operations
--   - Avoiding sequential scans on FK constraint checks
--
-- We only drop indexes that are NOT covering any foreign key.

-- ============================================================================
-- PART 1: ADD INDEXES FOR ALL UNINDEXED FOREIGN KEYS
-- ============================================================================

-- ai_conversations
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id 
  ON public.ai_conversations(user_id);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id 
  ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id 
  ON public.audit_logs(user_id);

-- best_practices
CREATE INDEX IF NOT EXISTS idx_best_practices_organization_id 
  ON public.best_practices(organization_id);

-- calendar_events
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id 
  ON public.calendar_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_case_id 
  ON public.calendar_events(case_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_client_id 
  ON public.calendar_events(client_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_created_by 
  ON public.calendar_events(created_by);

-- case_activities
CREATE INDEX IF NOT EXISTS idx_case_activities_case_id 
  ON public.case_activities(case_id);
CREATE INDEX IF NOT EXISTS idx_case_activities_assigned_to 
  ON public.case_activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_case_activities_created_by 
  ON public.case_activities(created_by);
CREATE INDEX IF NOT EXISTS idx_case_activities_organization_id 
  ON public.case_activities(organization_id);

-- case_fields
CREATE INDEX IF NOT EXISTS idx_case_fields_case_type_id 
  ON public.case_fields(case_type_id);
CREATE INDEX IF NOT EXISTS idx_case_fields_created_by 
  ON public.case_fields(created_by);
CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id 
  ON public.case_fields(organization_id);

-- case_issues
CREATE INDEX IF NOT EXISTS idx_case_issues_organization_id 
  ON public.case_issues(organization_id);

-- case_types
CREATE INDEX IF NOT EXISTS idx_case_types_created_by 
  ON public.case_types(created_by);
CREATE INDEX IF NOT EXISTS idx_case_types_organization_id 
  ON public.case_types(organization_id);

-- cases
CREATE INDEX IF NOT EXISTS idx_cases_case_issue_id 
  ON public.cases(case_issue_id);
CREATE INDEX IF NOT EXISTS idx_cases_case_type_id 
  ON public.cases(case_type_id);
CREATE INDEX IF NOT EXISTS idx_cases_user_id 
  ON public.cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to 
  ON public.cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_created_by 
  ON public.cases(created_by);

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_user_id 
  ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_by 
  ON public.clients(created_by);

-- communication_logs
CREATE INDEX IF NOT EXISTS idx_communication_logs_client_id 
  ON public.communication_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_organization_id 
  ON public.communication_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_communication_logs_user_id 
  ON public.communication_logs(user_id);

-- contract_templates
CREATE INDEX IF NOT EXISTS idx_contract_templates_created_by 
  ON public.contract_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_contract_templates_organization_id 
  ON public.contract_templates(organization_id);

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_created_by 
  ON public.contracts(created_by);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_created_by 
  ON public.conversations(created_by);

-- dashboard_prefs
CREATE INDEX IF NOT EXISTS idx_dashboard_prefs_organization_id 
  ON public.dashboard_prefs(organization_id);

-- doc_templates
CREATE INDEX IF NOT EXISTS idx_doc_templates_organization_id 
  ON public.doc_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_created_by 
  ON public.doc_templates(created_by);

-- document_analyses
CREATE INDEX IF NOT EXISTS idx_document_analyses_created_by 
  ON public.document_analyses(created_by);
CREATE INDEX IF NOT EXISTS idx_document_analyses_organization_id 
  ON public.document_analyses(organization_id);

-- document_chunks
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id 
  ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_contract_id 
  ON public.document_chunks(contract_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id 
  ON public.document_chunks(organization_id);

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_client_id 
  ON public.documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_by 
  ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id 
  ON public.documents(organization_id);

-- invoice_items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id 
  ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_organization_id 
  ON public.invoice_items(organization_id);

-- invoice_templates
CREATE INDEX IF NOT EXISTS idx_invoice_templates_created_by 
  ON public.invoice_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_invoice_templates_organization_id 
  ON public.invoice_templates(organization_id);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_case_id 
  ON public.invoices(case_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id 
  ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by 
  ON public.invoices(created_by);

-- notification_preferences
CREATE INDEX IF NOT EXISTS idx_notification_preferences_organization_id 
  ON public.notification_preferences(organization_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_organization_id 
  ON public.notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id 
  ON public.notifications(user_id);

-- organization_sso_configs
CREATE INDEX IF NOT EXISTS idx_organization_sso_configs_created_by 
  ON public.organization_sso_configs(created_by);
CREATE INDEX IF NOT EXISTS idx_organization_sso_configs_updated_by 
  ON public.organization_sso_configs(updated_by);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_disabled_by 
  ON public.profiles(disabled_by);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id 
  ON public.profiles(role_id);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_case_id 
  ON public.tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to 
  ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by 
  ON public.tasks(created_by);

-- time_entries
CREATE INDEX IF NOT EXISTS idx_time_entries_activity_id 
  ON public.time_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_organization_id 
  ON public.time_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id 
  ON public.time_entries(user_id);

-- user_calendar_integrations
CREATE INDEX IF NOT EXISTS idx_user_calendar_integrations_organization_id 
  ON public.user_calendar_integrations(organization_id);

-- user_onboarding_steps
CREATE INDEX IF NOT EXISTS idx_user_onboarding_steps_organization_id 
  ON public.user_onboarding_steps(organization_id);

-- user_role_assignments
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id 
  ON public.user_role_assignments(organization_id);

-- user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_created_by 
  ON public.user_roles(created_by);

-- voice_transcriptions
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id 
  ON public.voice_transcriptions(organization_id);


-- ============================================================================
-- PART 2: DROP TRULY UNUSED INDEXES (NOT COVERING ANY FK)
-- ============================================================================
-- Only drop indexes that are:
--   1. Never used in queries
--   2. NOT covering any foreign key column
--
-- Composite/specialty indexes that aren't being used and don't cover FKs:

-- invitations - composite indexes not used
DROP INDEX IF EXISTS public.idx_invitations_email_status_expires;
DROP INDEX IF EXISTS public.idx_invitations_email_pending;

-- invitation_custom_roles
DROP INDEX IF EXISTS public.idx_invitation_custom_roles_invitation_id;

-- profiles - non-FK columns
DROP INDEX IF EXISTS public.idx_profiles_must_change_password;
DROP INDEX IF EXISTS public.idx_profiles_email;
DROP INDEX IF EXISTS public.idx_profiles_role;
DROP INDEX IF EXISTS public.idx_profiles_user_id;

-- case_issues - drop old naming, we created new one above
DROP INDEX IF EXISTS public.case_issues_organization_id_idx;

-- contracts - embedding and composite indexes
DROP INDEX IF EXISTS public.contracts_embedding_idx;
DROP INDEX IF EXISTS public.idx_contracts_org_dates;
DROP INDEX IF EXISTS public.idx_contracts_org_status;
DROP INDEX IF EXISTS public.idx_contracts_status;

-- documents - embedding and composite indexes
DROP INDEX IF EXISTS public.documents_embedding_idx;
DROP INDEX IF EXISTS public.idx_documents_created_at;
DROP INDEX IF EXISTS public.idx_documents_org_client;
DROP INDEX IF EXISTS public.idx_documents_org_created;

-- audit_logs - composite indexes (single column indexes created above)
DROP INDEX IF EXISTS public.idx_audit_logs_org_created;
DROP INDEX IF EXISTS public.idx_audit_logs_resource;

-- calendar_events - composite indexes
DROP INDEX IF EXISTS public.idx_calendar_events_start_date;
DROP INDEX IF EXISTS public.idx_calendar_org_dates;

-- case_activities - non-FK column
DROP INDEX IF EXISTS public.idx_case_activities_status;

-- cases - composite indexes
DROP INDEX IF EXISTS public.idx_cases_org_assigned;
DROP INDEX IF EXISTS public.idx_cases_org_client;
DROP INDEX IF EXISTS public.idx_cases_org_status;
DROP INDEX IF EXISTS public.idx_cases_status;

-- communication_logs - non-FK column
DROP INDEX IF EXISTS public.idx_communication_logs_created_at;

-- document_analyses - embedding index
DROP INDEX IF EXISTS public.idx_document_analyses_embedding;
DROP INDEX IF EXISTS public.idx_document_analyses_document_id;

-- global_roles
DROP INDEX IF EXISTS public.idx_global_roles_role;

-- invoices - composite and non-FK indexes
DROP INDEX IF EXISTS public.idx_invoices_created_at;
DROP INDEX IF EXISTS public.idx_invoices_org_client;
DROP INDEX IF EXISTS public.idx_invoices_org_due;
DROP INDEX IF EXISTS public.idx_invoices_org_status;
DROP INDEX IF EXISTS public.idx_invoices_organization_id;
DROP INDEX IF EXISTS public.idx_invoices_status;

-- notifications - composite and non-FK indexes
DROP INDEX IF EXISTS public.idx_notifications_created_at;
DROP INDEX IF EXISTS public.idx_notifications_status;
DROP INDEX IF EXISTS public.idx_notifications_user_status;

-- organization_sso_configs - domain indexes (not FK)
DROP INDEX IF EXISTS public.idx_org_sso_configs_domain;
DROP INDEX IF EXISTS public.idx_sso_configs_domain;

-- tasks - composite and non-FK indexes
DROP INDEX IF EXISTS public.idx_tasks_assigned_completed;
DROP INDEX IF EXISTS public.idx_tasks_task_type;

-- user_role_assignments - composite index
DROP INDEX IF EXISTS public.idx_user_role_assignments_role_org;

-- user_roles - composite index
DROP INDEX IF EXISTS public.idx_user_roles_role_name_org;

-- user_calendar_integrations - drop old naming
DROP INDEX IF EXISTS public.user_calendar_integrations_org_idx;

-- user_csrf_sessions - these might be useful, but currently unused
DROP INDEX IF EXISTS public.idx_user_csrf_sessions_token;
DROP INDEX IF EXISTS public.idx_user_csrf_sessions_expires_at;
