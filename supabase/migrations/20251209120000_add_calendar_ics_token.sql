ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_ics_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_ics_token
  ON public.profiles (calendar_ics_token)
  WHERE calendar_ics_token IS NOT NULL;

COMMENT ON COLUMN public.profiles.calendar_ics_token IS 'Token used to access calendar ICS export/subscription.';
