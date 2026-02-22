-- ============================================================================
-- PHASE 1-3: Critical Security, Schema Consolidation & Email Resolution
-- (Idempotent version - checks for existing constraints)
-- ============================================================================

-- PHASE 3: Add email column to profiles (do this first for foreign key dependencies)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
END $$;

-- Sync existing emails from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND p.email IS NULL;

-- Update trigger to maintain email sync
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();


-- PHASE 1.1: Handle NULL organization_id values before adding constraints
-- ============================================================================

UPDATE public.case_types SET is_global = true WHERE organization_id IS NULL;
UPDATE public.case_issues SET is_global = true WHERE organization_id IS NULL;
UPDATE public.contract_templates SET is_public = true WHERE organization_id IS NULL;

-- For document_chunks: Get organization from parent document
UPDATE public.document_chunks dc
SET organization_id = d.organization_id
FROM public.documents d
WHERE dc.document_id = d.id AND dc.organization_id IS NULL;

-- Add organization_id to voice_transcriptions if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'voice_transcriptions' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.voice_transcriptions ADD COLUMN organization_id UUID;
  END IF;
END $$;

UPDATE public.voice_transcriptions vt
SET organization_id = c.organization_id
FROM public.cases c
WHERE vt.case_id = c.id AND vt.organization_id IS NULL;

-- For user_role_assignments: Get from user's profile
UPDATE public.user_role_assignments ura
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ura.user_id = p.user_id AND ura.organization_id IS NULL;


-- PHASE 1.2: Add NOT NULL constraints after cleaning data
-- ============================================================================
DO $$
BEGIN
  ALTER TABLE public.case_fields ALTER COLUMN organization_id SET NOT NULL;
  ALTER TABLE public.document_chunks ALTER COLUMN organization_id SET NOT NULL;
  ALTER TABLE public.voice_transcriptions ALTER COLUMN organization_id SET NOT NULL;
  ALTER TABLE public.user_role_assignments ALTER COLUMN organization_id SET NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'Some NOT NULL constraints could not be added: %', SQLERRM;
END $$;


-- PHASE 1.3: Add Foreign Key Constraints to Organizations (idempotent)
-- ============================================================================
DO $$
BEGIN
  -- case_types
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_case_types_organization' AND table_name = 'case_types') THEN
    ALTER TABLE public.case_types 
      ADD CONSTRAINT fk_case_types_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_issues
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_case_issues_organization' AND table_name = 'case_issues') THEN
    ALTER TABLE public.case_issues 
      ADD CONSTRAINT fk_case_issues_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_case_fields_organization' AND table_name = 'case_fields') THEN
    ALTER TABLE public.case_fields 
      ADD CONSTRAINT fk_case_fields_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- document_chunks
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_document_chunks_organization' AND table_name = 'document_chunks') THEN
    ALTER TABLE public.document_chunks 
      ADD CONSTRAINT fk_document_chunks_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- voice_transcriptions
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_voice_transcriptions_organization' AND table_name = 'voice_transcriptions') THEN
    ALTER TABLE public.voice_transcriptions 
      ADD CONSTRAINT fk_voice_transcriptions_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- contract_templates
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_contract_templates_organization' AND table_name = 'contract_templates') THEN
    ALTER TABLE public.contract_templates 
      ADD CONSTRAINT fk_contract_templates_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- user_role_assignments
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_user_role_assignments_organization' AND table_name = 'user_role_assignments') THEN
    ALTER TABLE public.user_role_assignments 
      ADD CONSTRAINT fk_user_role_assignments_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;


-- PHASE 1.4: Standardize User References to Profiles (replace existing)
-- ============================================================================
DO $$
BEGIN
  -- Cases table
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_cases_created_by_profile' AND table_name = 'cases') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_cases_assigned_to_profile' AND table_name = 'cases') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Documents
  ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_documents_created_by_profile' AND table_name = 'documents') THEN
    ALTER TABLE public.documents 
      ADD CONSTRAINT fk_documents_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Contracts
  ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_contracts_created_by_profile' AND table_name = 'contracts') THEN
    ALTER TABLE public.contracts 
      ADD CONSTRAINT fk_contracts_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Invoices
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_invoices_created_by_profile' AND table_name = 'invoices') THEN
    ALTER TABLE public.invoices 
      ADD CONSTRAINT fk_invoices_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Communication logs
  ALTER TABLE public.communication_logs DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_communication_logs_user_profile' AND table_name = 'communication_logs') THEN
    ALTER TABLE public.communication_logs 
      ADD CONSTRAINT fk_communication_logs_user_profile 
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;

  -- Clients
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_clients_created_by_profile' AND table_name = 'clients') THEN
    ALTER TABLE public.clients 
      ADD CONSTRAINT fk_clients_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Calendar events
  ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_calendar_events_created_by_profile' AND table_name = 'calendar_events') THEN
    ALTER TABLE public.calendar_events 
      ADD CONSTRAINT fk_calendar_events_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Case activities
  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_case_activities_created_by_profile' AND table_name = 'case_activities') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_case_activities_assigned_to_profile' AND table_name = 'case_activities') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Tasks
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_tasks_created_by_profile' AND table_name = 'tasks') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_tasks_assigned_to_profile' AND table_name = 'tasks') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;


-- PHASE 2: Update RLS policies for voice_transcriptions
-- ============================================================================
DROP POLICY IF EXISTS "Users can create voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can create voice transcriptions in their organization"
  ON public.voice_transcriptions FOR INSERT
  WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can view voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can view voice transcriptions in their organization"
  ON public.voice_transcriptions FOR SELECT
  USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can update voice transcriptions in their organization"
  ON public.voice_transcriptions FOR UPDATE
  USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete voice transcriptions in their organization" ON public.voice_transcriptions;
CREATE POLICY "Users can delete voice transcriptions in their organization"
  ON public.voice_transcriptions FOR DELETE
  USING (organization_id = get_current_user_organization_id());


-- Add performance indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id ON public.case_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id ON public.voice_transcriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id ON public.user_role_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;