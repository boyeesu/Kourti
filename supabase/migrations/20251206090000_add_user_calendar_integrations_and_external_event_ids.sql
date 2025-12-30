SET search_path = public;

CREATE TABLE IF NOT EXISTS public.user_calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  external_user_id text,
  external_email text,
  access_token text NOT NULL,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS user_calendar_integrations_user_provider_idx
  ON public.user_calendar_integrations (user_id, provider);

CREATE INDEX IF NOT EXISTS user_calendar_integrations_org_idx
  ON public.user_calendar_integrations (organization_id);

DROP TRIGGER IF EXISTS trg_user_calendar_integrations_set_updated_at ON public.user_calendar_integrations;
CREATE TRIGGER trg_user_calendar_integrations_set_updated_at
  BEFORE UPDATE ON public.user_calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_integrations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_calendar_integrations FROM PUBLIC;
REVOKE ALL ON public.user_calendar_integrations FROM authenticated;
REVOKE ALL ON public.user_calendar_integrations FROM anon;
GRANT ALL ON public.user_calendar_integrations TO service_role;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS external_source text CHECK (external_source IN ('google_calendar', 'microsoft_teams')),
  ADD COLUMN IF NOT EXISTS external_calendar_id text;

CREATE INDEX IF NOT EXISTS idx_calendar_events_external_reference
  ON public.calendar_events (external_source, external_event_id);
