-- Migration: Add calendar sync tables and RLS policies
-- Phase 6: Calendar Sync

-- Ensure user_calendar_integrations table exists
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
  
  -- Sync settings
  sync_enabled boolean DEFAULT true,
  sync_direction text DEFAULT 'bidirectional' CHECK (sync_direction IN ('import', 'export', 'bidirectional')),
  last_sync_at timestamptz,
  sync_settings jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  
  UNIQUE(user_id, provider)
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS user_calendar_integrations_user_provider_idx
  ON public.user_calendar_integrations (user_id, provider);

CREATE INDEX IF NOT EXISTS user_calendar_integrations_org_idx
  ON public.user_calendar_integrations (organization_id);

-- Enable RLS
ALTER TABLE public.user_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_calendar_integrations FORCE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own calendar integrations" ON public.user_calendar_integrations;
DROP POLICY IF EXISTS "Users can insert their own calendar integrations" ON public.user_calendar_integrations;
DROP POLICY IF EXISTS "Users can update their own calendar integrations" ON public.user_calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their own calendar integrations" ON public.user_calendar_integrations;

-- Create RLS policies
CREATE POLICY "Users can view their own calendar integrations"
  ON public.user_calendar_integrations
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own calendar integrations"
  ON public.user_calendar_integrations
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own calendar integrations"
  ON public.user_calendar_integrations
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own calendar integrations"
  ON public.user_calendar_integrations
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create calendar_sync_logs table
CREATE TABLE IF NOT EXISTS public.calendar_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.user_calendar_integrations(id) ON DELETE CASCADE,
  sync_type text NOT NULL CHECK (sync_type IN ('import', 'export', 'bidirectional', 'manual', 'scheduled')),
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'partial')),
  events_synced integer DEFAULT 0,
  events_created integer DEFAULT 0,
  events_updated integer DEFAULT 0,
  events_deleted integer DEFAULT 0,
  errors jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Create indexes for sync logs
CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_integration_id
  ON public.calendar_sync_logs (integration_id);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_status
  ON public.calendar_sync_logs (status);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_logs_started_at
  ON public.calendar_sync_logs (started_at DESC);

-- Enable RLS on calendar_sync_logs
ALTER TABLE public.calendar_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for calendar_sync_logs
DROP POLICY IF EXISTS "Users can view sync logs for their integrations" ON public.calendar_sync_logs;
CREATE POLICY "Users can view sync logs for their integrations"
  ON public.calendar_sync_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_calendar_integrations uci
      WHERE uci.id = calendar_sync_logs.integration_id
      AND uci.user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_calendar_integrations TO authenticated;
GRANT SELECT ON public.calendar_sync_logs TO authenticated;

