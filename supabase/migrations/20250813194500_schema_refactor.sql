-- Migration: schema refactor – consolidate tables and clean up FK duplicates

-- 1. Drop duplicate organisations table already removed previously; ensure it does not exist
DROP TABLE IF EXISTS public.organisations CASCADE;

-- 2. Rename column in notifications
ALTER TABLE public.notifications
    RENAME COLUMN organisation_id TO organization_id;

-- ensure FK now points to organizations
ALTER TABLE public.notifications
    ADD CONSTRAINT IF NOT EXISTS notifications_organization_id_fkey
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- 3. Profiles
-- remove email column (duplicate of auth.users.email)
ALTER TABLE public.profiles
    DROP COLUMN IF EXISTS email;

-- ensure user reference consistent – keep user_id but enforce FK to auth.users
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;
ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

-- 4. Case types merge: add columns to cases
ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS case_type_name text,
    ADD COLUMN IF NOT EXISTS case_type_description text;

-- migrate existing data from case_types (if still present)
UPDATE public.cases c
SET case_type_name = ct.name,
    case_type_description = ct.description
FROM public.case_types ct
WHERE c.case_type_id = ct.id;

-- Drop now-obsolete tables
DROP TABLE IF EXISTS public.case_fields CASCADE;
DROP TABLE IF EXISTS public.case_types CASCADE;

-- 5. Calendar events link to activities: add activity_id
ALTER TABLE public.calendar_events
    ADD COLUMN IF NOT EXISTS activity_id uuid;

-- set FK
ALTER TABLE public.calendar_events
    ADD CONSTRAINT IF NOT EXISTS calendar_events_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.case_activities(id);

-- Optional data migration example (may require custom business logic)
-- UPDATE public.calendar_events ce
-- SET activity_id = ca.id
-- FROM public.case_activities ca
-- WHERE ce.case_id = ca.case_id
--   AND ce.start_date::date = ca.due_date;

-- If you wish to drop case_activities table later, comment out previous FK and drop here.
-- DROP TABLE public.case_activities CASCADE;

-- 6. Notifications – add generic source reference columns
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS source_id uuid,
    ADD COLUMN IF NOT EXISTS source_type text;

-- 7. Time entries: rename activity_id → event_id
ALTER TABLE public.time_entries
    RENAME COLUMN activity_id TO event_id;

-- adjust FK
ALTER TABLE public.time_entries
    DROP CONSTRAINT IF EXISTS time_entries_activity_id_fkey;
ALTER TABLE public.time_entries
    ADD CONSTRAINT time_entries_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.calendar_events(id);

-- 8. Doc templates: convert variables to jsonb
ALTER TABLE public.doc_templates
    ALTER COLUMN variables TYPE jsonb USING variables::jsonb;

-- 9. Remove redundant duplicate FKs
-- calendar_events duplicates already cleaned earlier
ALTER TABLE public.calendar_events
    DROP CONSTRAINT IF EXISTS fk_calendar_events_client_id;
ALTER TABLE public.calendar_events
    DROP CONSTRAINT IF EXISTS fk_calendar_events_case_id;

-- cases duplicates
ALTER TABLE public.cases
    DROP CONSTRAINT IF EXISTS fk_cases_assigned_to;
ALTER TABLE public.cases
    DROP CONSTRAINT IF EXISTS fk_cases_client_id;

-- contracts duplicates no longer exist as contracts table removed previously

-- 10. Clean up contracts: contracts table already merged into documents earlier – ensure table dropped
DROP TABLE IF EXISTS public.contracts CASCADE;
DROP TABLE IF EXISTS public.contract_embeddings CASCADE;

-- 11. Standard index additions as needed
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON public.notifications(organization_id);

-- 12. End of migration
