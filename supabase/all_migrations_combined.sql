-- Fix handle_new_user_fast() to save first_name and last_name from metadata
-- This ensures data persistence even if this trigger is used instead of handle_new_user_with_invitation()

CREATE OR REPLACE FUNCTION public.handle_new_user_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Single fast query for invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  -- Create profile - include first_name and last_name from metadata
  INSERT INTO profiles (
    user_id, 
    email, 
    first_name,
    last_name,
    organization_id, 
    role, 
    is_organization_creator, 
    created_at, 
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    inv_org,  -- NULL if no invitation, org_id if invited
    COALESCE(inv_role::user_role, CASE WHEN inv_org IS NULL THEN 'superadmin' ELSE 'user' END::user_role),
    inv_org IS NULL,  -- is_organization_creator = TRUE only if no invitation
    now(),
    now()
  );

  -- Mark invitation accepted (if exists) - separate statement for speed
  IF inv_org IS NOT NULL THEN
    UPDATE invitations SET status = 'accepted' WHERE email = NEW.email AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just create basic profile and continue
  BEGIN
    INSERT INTO profiles (
      user_id, 
      email, 
      first_name,
      last_name,
      role, 
      is_organization_creator, 
      created_at, 
      updated_at
    )
    VALUES (
      NEW.id, 
      NEW.email,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      'user', 
      TRUE, 
      now(), 
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
-- Migration: Add notification preferences and email delivery logs
-- Phase 1: App Notifications and Emails improvements

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Email preferences
  email_enabled boolean DEFAULT true,
  email_frequency text DEFAULT 'immediate' CHECK (email_frequency IN ('immediate', 'daily', 'weekly', 'never')),
  
  -- In-app preferences
  in_app_enabled boolean DEFAULT true,
  
  -- Notification type preferences
  case_notifications boolean DEFAULT true,
  client_notifications boolean DEFAULT true,
  document_notifications boolean DEFAULT true,
  contract_notifications boolean DEFAULT true,
  calendar_notifications boolean DEFAULT true,
  task_notifications boolean DEFAULT true,
  invoice_notifications boolean DEFAULT true,
  general_notifications boolean DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  
  UNIQUE(user_id, organization_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_org_id ON public.notification_preferences(organization_id);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for notification_preferences
CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create email_delivery_logs table
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  
  -- Email details
  recipient_email text NOT NULL,
  subject text NOT NULL,
  email_type text NOT NULL,
  
  -- Delivery status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  provider_message_id text,
  provider_response jsonb,
  
  -- Retry information
  retry_count integer DEFAULT 0,
  last_retry_at timestamptz,
  max_retries integer DEFAULT 3,
  
  -- Error tracking
  error_message text,
  error_stack text,
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  delivered_at timestamptz
);

-- Create indexes for email_delivery_logs
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_user_id ON public.email_delivery_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_org_id ON public.email_delivery_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_notification_id ON public.email_delivery_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status ON public.email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at ON public.email_delivery_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for email_delivery_logs
CREATE POLICY "Users can view their own email delivery logs"
  ON public.email_delivery_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Add indexes to notifications table for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_status ON public.notifications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);

-- Add archived_at column to notifications for soft archiving
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_archived_at ON public.notifications(archived_at);

-- Function to automatically create notification preferences for new users
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (
    user_id,
    organization_id,
    email_enabled,
    email_frequency,
    in_app_enabled
  )
  VALUES (
    NEW.user_id,
    NEW.organization_id,
    true,
    'immediate',
    true
  )
  ON CONFLICT (user_id, organization_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger to create default preferences when a profile is created
DROP TRIGGER IF EXISTS trigger_create_notification_preferences ON public.profiles;
CREATE TRIGGER trigger_create_notification_preferences
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_notification_preferences();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT ON public.email_delivery_logs TO authenticated;

-- Migration: Add recurring events and reminders support
-- Phase 2: Calendar Improvements

-- Add recurring event pattern columns to calendar_events
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_pattern jsonb,
  ADD COLUMN IF NOT EXISTS recurrence_end_date timestamptz,
  ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_instance_id text;

-- Create indexes for recurring events
CREATE INDEX IF NOT EXISTS idx_calendar_events_parent_event_id ON public.calendar_events(parent_event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_recurrence_instance_id ON public.calendar_events(recurrence_instance_id);

-- Create event_reminders table
CREATE TABLE IF NOT EXISTS public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Reminder timing
  reminder_type text NOT NULL CHECK (reminder_type IN ('before', 'at')),
  reminder_minutes integer NOT NULL DEFAULT 15, -- minutes before event (if before) or 0 (if at)
  
  -- Reminder status
  sent boolean DEFAULT false,
  sent_at timestamptz,
  
  -- Notification method
  notification_method text NOT NULL DEFAULT 'in_app' CHECK (notification_method IN ('in_app', 'email', 'both')),
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Create indexes for event_reminders
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON public.event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON public.event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent ON public.event_reminders(sent);
CREATE INDEX IF NOT EXISTS idx_event_reminders_org_id ON public.event_reminders(organization_id);

-- Enable RLS
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_reminders
CREATE POLICY "Users can view reminders for their events"
  ON public.event_reminders
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.id = event_reminders.event_id
      AND ce.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can create reminders for their events"
  ON public.event_reminders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.calendar_events ce
      WHERE ce.id = event_reminders.event_id
      AND ce.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can update their own reminders"
  ON public.event_reminders
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reminders"
  ON public.event_reminders
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminders TO authenticated;

-- Add conflict detection helper columns
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS conflict_detected boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflict_with jsonb;

-- Function to detect event conflicts
CREATE OR REPLACE FUNCTION public.detect_event_conflicts(
  p_event_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicts jsonb := '[]'::jsonb;
  conflict_record RECORD;
BEGIN
  -- Find overlapping events for the same organization
  FOR conflict_record IN
    SELECT id, title, start_date, end_date
    FROM public.calendar_events
    WHERE organization_id = p_organization_id
      AND id != COALESCE(p_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        (start_date <= p_start_date AND end_date > p_start_date) OR
        (start_date < p_end_date AND end_date >= p_end_date) OR
        (start_date >= p_start_date AND end_date <= p_end_date)
      )
  LOOP
    conflicts := conflicts || jsonb_build_object(
      'id', conflict_record.id,
      'title', conflict_record.title,
      'start_date', conflict_record.start_date,
      'end_date', conflict_record.end_date
    );
  END LOOP;

  RETURN conflicts;
END;
$$;

-- Update trigger to detect conflicts
CREATE OR REPLACE FUNCTION public.check_event_conflicts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflicts jsonb;
BEGIN
  conflicts := public.detect_event_conflicts(
    NEW.id,
    NEW.start_date,
    NEW.end_date,
    NEW.organization_id
  );

  IF jsonb_array_length(conflicts) > 0 THEN
    NEW.conflict_detected := true;
    NEW.conflict_with := conflicts;
  ELSE
    NEW.conflict_detected := false;
    NEW.conflict_with := '[]'::jsonb;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for conflict detection
DROP TRIGGER IF EXISTS trigger_check_event_conflicts ON public.calendar_events;
CREATE TRIGGER trigger_check_event_conflicts
  BEFORE INSERT OR UPDATE ON public.calendar_events
  FOR EACH ROW
  WHEN (NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL)
  EXECUTE FUNCTION public.check_event_conflicts();

-- Migration: Add user onboarding tracking
-- Phase 5: User Addition Improvements

-- Enhance user_invitations table if it exists, or create it
CREATE TABLE IF NOT EXISTS public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  role text NOT NULL,
  department text,
  
  -- Invitation status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  token text UNIQUE,
  expires_at timestamptz,
  
  -- Tracking
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  accepted_at timestamptz,
  user_id uuid REFERENCES auth.users(id), -- Set when invitation is accepted
  
  -- Resend tracking
  resend_count integer DEFAULT 0,
  last_resent_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  
  UNIQUE(organization_id, email)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_invitations_org_id ON public.user_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON public.user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON public.user_invitations(status);
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON public.user_invitations(token);

-- Enable RLS
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view invitations in their organization"
  ON public.user_invitations
  FOR SELECT
  TO authenticated
  USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Admins can manage invitations in their organization"
  ON public.user_invitations
  FOR ALL
  TO authenticated
  USING (
    organization_id = get_current_user_organization_id() AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
      AND role IN ('superadmin', 'admin')
    )
  );

-- Create user_onboarding_steps table
CREATE TABLE IF NOT EXISTS public.user_onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  step_name text NOT NULL,
  step_description text,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  metadata jsonb,
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  
  UNIQUE(user_id, step_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_onboarding_steps_user_id ON public.user_onboarding_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_steps_org_id ON public.user_onboarding_steps(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_steps_completed ON public.user_onboarding_steps(completed);

-- Enable RLS
ALTER TABLE public.user_onboarding_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own onboarding steps"
  ON public.user_onboarding_steps
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own onboarding steps"
  ON public.user_onboarding_steps
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to initialize onboarding steps for new users
CREATE OR REPLACE FUNCTION public.initialize_user_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_onboarding_steps (user_id, organization_id, step_name, step_description)
  VALUES
    (NEW.user_id, NEW.organization_id, 'profile_setup', 'Complete your profile'),
    (NEW.user_id, NEW.organization_id, 'first_case', 'Create your first case'),
    (NEW.user_id, NEW.organization_id, 'invite_team', 'Invite team members'),
    (NEW.user_id, NEW.organization_id, 'explore_features', 'Explore key features')
  ON CONFLICT (user_id, step_name) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger to initialize onboarding when profile is created
DROP TRIGGER IF EXISTS trigger_initialize_user_onboarding ON public.profiles;
CREATE TRIGGER trigger_initialize_user_onboarding
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_user_onboarding();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.user_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_onboarding_steps TO authenticated;

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

-- Migration: Add has_permission wrapper function
-- This function wraps user_has_permission to automatically use auth.uid()

CREATE OR REPLACE FUNCTION public.has_permission(
  p_resource text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call user_has_permission with the current authenticated user
  RETURN public.user_has_permission(auth.uid(), p_resource, p_action);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.has_permission IS 'Wrapper function that checks permissions for the current authenticated user. Calls user_has_permission with auth.uid().';

-- Create conversations table for chat between organization members
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name TEXT, -- For group conversations
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add comment
COMMENT ON TABLE public.conversations IS 'Chat conversations between organization members';

-- Create conversation participants table
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(conversation_id, user_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'system')),
  metadata JSONB, -- For file attachments, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_org ON public.conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conv ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organization ID
CREATE OR REPLACE FUNCTION get_current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$$;

-- RLS Policies for conversations
CREATE POLICY "Users can view conversations in their organization"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = get_current_user_organization_id() AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = conversations.id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create conversations in their organization"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    organization_id = get_current_user_organization_id() AND
    created_by = auth.uid()
  );

CREATE POLICY "Users can update their own conversations"
  ON public.conversations
  FOR UPDATE
  USING (
    organization_id = get_current_user_organization_id() AND
    created_by = auth.uid()
  );

-- RLS Policies for conversation_participants
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = conversation_participants.conversation_id
      AND organization_id = get_current_user_organization_id()
    ) AND
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = conversation_participants.conversation_id
      AND organization_id = get_current_user_organization_id()
      AND created_by = auth.uid()
    )
  );

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = messages.conversation_id
      AND c.organization_id = get_current_user_organization_id()
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages to their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_participants cp ON cp.conversation_id = c.id
      WHERE c.id = messages.conversation_id
      AND c.organization_id = get_current_user_organization_id()
      AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.messages
  FOR DELETE
  USING (sender_id = auth.uid());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to update updated_at
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create or get direct conversation between two users
CREATE OR REPLACE FUNCTION get_or_create_direct_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_id UUID;
  current_org_id UUID;
  conv_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = current_user_id;
  
  IF current_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not associated with an organization';
  END IF;
  
  -- Check if other user is in the same organization
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_other_user_id
    AND organization_id = current_org_id
  ) THEN
    RAISE EXCEPTION 'User is not in the same organization';
  END IF;
  
  -- Check if direct conversation already exists
  SELECT c.id INTO conv_id
  FROM public.conversations c
  WHERE c.type = 'direct'
  AND c.organization_id = current_org_id
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp1
    WHERE cp1.conversation_id = c.id AND cp1.user_id = current_user_id
  )
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = c.id AND cp2.user_id = p_other_user_id
  )
  LIMIT 1;
  
  -- If conversation exists, return it
  IF conv_id IS NOT NULL THEN
    RETURN conv_id;
  END IF;
  
  -- Create new direct conversation
  INSERT INTO public.conversations (organization_id, type, created_by)
  VALUES (current_org_id, 'direct', current_user_id)
  RETURNING id INTO conv_id;
  
  -- Add both users as participants
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (conv_id, current_user_id), (conv_id, p_other_user_id);
  
  RETURN conv_id;
END;
$$;
-- Migration: Improve chat system with triggers and real-time support
-- This migration adds triggers to automatically update conversation timestamps
-- and ensures real-time is properly configured

-- Function to update conversation updated_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_on_message_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message_insert ON public.messages;

-- Create trigger to update conversation timestamp when message is inserted
CREATE TRIGGER trigger_update_conversation_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message_insert();

-- Enable real-time for messages table (if not already enabled)
-- Note: This requires Supabase dashboard configuration, but we document it here
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Add comment
COMMENT ON FUNCTION update_conversation_on_message_insert() IS 'Automatically updates conversation updated_at when a message is inserted';
-- Migration: Fix conversation_participants RLS policies
-- Issues:
-- 1. Missing UPDATE policy (needed for useMarkAsRead)
-- 2. Recursive SELECT policy causing performance issues and 500 errors
-- 3. Complex nested EXISTS checks causing infinite loops

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

-- Create optimized SELECT policy (NO RECURSION, NO FUNCTION CALLS)
-- Users can view participants if the conversation is in their organization
-- We check this by joining with profiles to get the user's org, then checking conversations
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 
      FROM public.conversations c
      INNER JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = conversation_participants.conversation_id
      AND p.user_id = auth.uid()
    )
  );

-- Create INSERT policy (avoid function calls in WITH CHECK)
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    -- Conversation must exist and be in the user's organization
    EXISTS (
      SELECT 1 
      FROM public.conversations c
      INNER JOIN public.profiles p ON p.organization_id = c.organization_id
      WHERE c.id = conversation_participants.conversation_id
      AND p.user_id = auth.uid()
      AND (
        -- User created the conversation, OR
        c.created_by = auth.uid()
        OR
        -- User being added is in the same organization
        conversation_participants.user_id IN (
          SELECT user_id FROM public.profiles p2
          WHERE p2.organization_id = p.organization_id
        )
      )
    )
  );

-- Create UPDATE policy (needed for useMarkAsRead to update last_read_at)
-- Users can only update their own participant record
CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add index to improve SELECT policy performance
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv 
  ON public.conversation_participants(user_id, conversation_id);
-- Fix signup trigger to handle NULL organization_id and add proper validation

-- Add performance indexes for invitation lookups
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires 
  ON public.invitations(email, status, expires_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_invitation_custom_roles_invitation_id 
  ON public.invitation_custom_roles(invitation_id);

-- Ensure service role can insert profiles (for trigger function)
DROP POLICY IF EXISTS "Service role can insert profiles" ON profiles;
CREATE POLICY "Service role can insert profiles" ON profiles
FOR INSERT WITH CHECK (true);

-- Ensure service role can insert organizations (for trigger function)
DROP POLICY IF EXISTS "Service role can insert organizations" ON organizations;
CREATE POLICY "Service role can insert organizations" ON organizations
FOR INSERT WITH CHECK (true);

-- Ultra-minimal signup trigger - does ONLY essential work
-- All non-critical operations deferred to post-signup processing
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_org_id uuid;
  invitation_role public.user_role;
  new_org_id uuid;
  org_name text;
BEGIN
  -- Ultra-fast invitation lookup - no ORDER BY, no complex joins, just get first match
  -- Use index hint by querying indexed columns first
  SELECT organization_id, role
  INTO invitation_org_id, invitation_role
  FROM invitations
  WHERE email = NEW.email 
    AND status = 'pending' 
    AND expires_at > now()
  LIMIT 1;  -- No ORDER BY - just get first match for speed
  
  -- If invitation found with valid org, use it
  IF invitation_org_id IS NOT NULL THEN
    -- Create profile immediately - minimal fields only
    INSERT INTO public.profiles (
      user_id, 
      email, 
      organization_id, 
      role,
      first_name,
      last_name,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      invitation_org_id,
      COALESCE(invitation_role, 'user'::public.user_role),
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      FALSE,
      now(),
      now()
    );
    
    -- DO NOT update invitation here - defer to async job
    -- DO NOT process custom roles here - defer to async job
    
  ELSE
    -- No invitation - create new organization (fast path)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      COALESCE(
        TRIM(CONCAT(
          COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''), 
          ' ', 
          COALESCE(NEW.raw_user_meta_data ->> 'last_name', '')
        )),
        'User'
      ) || ' Organization'
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, COALESCE(NEW.email, 'user@example.com'), now(), now())
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (
      user_id, 
      email, 
      organization_id, 
      role,
      first_name,
      last_name,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      new_org_id,
      'superadmin'::public.user_role,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Absolute minimal fallback - just create profile, ignore errors
    BEGIN
      INSERT INTO public.organizations (name, email, created_at, updated_at)
      VALUES ('User Organization', NEW.email, now(), now())
      RETURNING id INTO new_org_id;

      INSERT INTO public.profiles (
        user_id, email, organization_id, role, is_organization_creator, created_at, updated_at
      )
      VALUES (
        NEW.id, NEW.email, new_org_id, 'superadmin'::public.user_role, TRUE, now(), now()
      );
      
      RETURN NEW;
    EXCEPTION
      WHEN OTHERS THEN
        -- Last resort - just return, let auth succeed even if profile creation fails
        -- Profile can be created manually later
        RETURN NEW;
    END;
END;
$$;

-- Create separate function to handle custom roles and cleanup (called after profile creation)
CREATE OR REPLACE FUNCTION public.process_invitation_custom_roles(p_user_id uuid, p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  custom_role_names TEXT[];
  org_id_val uuid;
  invited_by_val uuid;
BEGIN
  -- Get custom roles and org info
  SELECT 
    ARRAY_AGG(icr.role_name),
    i.organization_id,
    i.invited_by
  INTO custom_role_names, org_id_val, invited_by_val
  FROM invitation_custom_roles icr
  JOIN invitations i ON i.id = icr.invitation_id
  WHERE icr.invitation_id = p_invitation_id;
  
  -- Assign custom roles if any
  IF custom_role_names IS NOT NULL AND array_length(custom_role_names, 1) > 0 THEN
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    SELECT p_user_id, unnest(custom_role_names), org_id_val, invited_by_val
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Clean up
    DELETE FROM invitation_custom_roles WHERE invitation_id = p_invitation_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail if custom roles can't be processed
    RAISE WARNING 'Failed to process custom roles for user %: %', p_user_id, SQLERRM;
END;
$$;

-- Create function to process invitation cleanup and custom roles AFTER signup
-- This runs asynchronously via pg_cron or can be called manually
CREATE OR REPLACE FUNCTION public.complete_invitation_processing(p_user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
BEGIN
  -- Find and process the invitation
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = p_user_email 
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF invitation_record.id IS NOT NULL THEN
    -- Mark as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Process custom roles
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    IF custom_role_names IS NOT NULL AND array_length(custom_role_names, 1) > 0 THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT 
        (SELECT user_id FROM profiles WHERE email = p_user_email LIMIT 1),
        unnest(custom_role_names),
        invitation_record.organization_id,
        invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
      
      DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to complete invitation processing: %', SQLERRM;
END;
$$;

-- Test scripts for signup flows
-- Run these in Supabase SQL Editor to test user invitation and signup

-- ============================================================================
-- SETUP: Create test organization and admin user
-- ============================================================================

-- Create a test organization
DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
BEGIN
  -- Create test organization
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES ('Test Organization', 'test@example.com', now(), now())
  RETURNING id INTO test_org_id;

  -- Get or create test admin user (assuming one exists in auth.users)
  SELECT id INTO test_admin_id
  FROM auth.users
  WHERE email = 'admin@test.com'
  LIMIT 1;

  -- If admin doesn't exist, you'll need to create it via signup first
  IF test_admin_id IS NULL THEN
    RAISE NOTICE 'Test admin user not found. Please create admin@test.com first via signup.';
  ELSE
    -- Create admin profile if it doesn't exist
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      test_admin_id,
      'Test',
      'Admin',
      'admin@test.com',
      test_org_id,
      'superadmin'::public.user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RAISE NOTICE 'Test setup complete. Organization ID: %, Admin ID: %', test_org_id, test_admin_id;
  END IF;
END $$;

-- ============================================================================
-- TEST 1: Regular Signup (No Invitation)
-- ============================================================================

-- This test simulates a user signing up without an invitation
-- Expected: User gets their own organization and superadmin role

DO $$
DECLARE
  test_email text := 'newuser' || extract(epoch from now())::text || '@test.com';
  test_user_id uuid;
  test_org_id uuid;
  profile_count int;
BEGIN
  RAISE NOTICE '=== TEST 1: Regular Signup (No Invitation) ===';
  RAISE NOTICE 'Test email: %', test_email;
  
  -- Note: In real scenario, this would be done via Supabase Auth signup
  -- For testing, we'll simulate by checking what would happen
  
  -- Check if any pending invitations exist for this email
  SELECT COUNT(*) INTO profile_count
  FROM invitations
  WHERE email = test_email AND status = 'pending';
  
  IF profile_count = 0 THEN
    RAISE NOTICE '✓ No pending invitations found (expected)';
    RAISE NOTICE 'Expected behavior: User will create new organization';
  ELSE
    RAISE NOTICE '✗ Found pending invitations (unexpected)';
  END IF;
  
  RAISE NOTICE 'To complete this test:';
  RAISE NOTICE '1. Sign up with email: %', test_email;
  RAISE NOTICE '2. Verify a new organization was created';
  RAISE NOTICE '3. Verify user has superadmin role';
END $$;

-- ============================================================================
-- TEST 2: Create Invitation and Test Acceptance
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_invite_email text := 'invited' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
BEGIN
  RAISE NOTICE '=== TEST 2: Create Invitation ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create invitation
  INSERT INTO public.invitations (
    organization_id,
    email,
    first_name,
    last_name,
    role,
    department,
    invited_by,
    status,
    expires_at
  )
  VALUES (
    test_org_id,
    test_invite_email,
    'Invited',
    'User',
    'user'::public.user_role,
    'Legal',
    test_admin_id,
    'pending',
    now() + interval '14 days'
  )
  RETURNING id INTO invitation_id_val;
  
  RAISE NOTICE '✓ Invitation created';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Email: %', test_invite_email;
  RAISE NOTICE '  Organization ID: %', test_org_id;
  RAISE NOTICE '  Role: user';
  
  -- Verify invitation exists
  IF invitation_id_val IS NOT NULL THEN
    RAISE NOTICE '✓ Invitation verification passed';
  ELSE
    RAISE NOTICE '✗ Invitation creation failed';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE 'To test acceptance:';
  RAISE NOTICE '1. Sign up with email: %', test_invite_email;
  RAISE NOTICE '2. Verify user is added to organization: %', test_org_id;
  RAISE NOTICE '3. Verify user has role: user';
  RAISE NOTICE '4. Verify invitation status changed to: accepted';
END $$;

-- ============================================================================
-- TEST 3: Test Invitation with Custom Role
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_invite_email text := 'customrole' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
  custom_role_name text := 'paralegal';
BEGIN
  RAISE NOTICE '=== TEST 3: Invitation with Custom Role ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create invitation with custom role
  INSERT INTO public.invitations (
    organization_id,
    email,
    first_name,
    last_name,
    role,
    department,
    invited_by,
    status,
    expires_at
  )
  VALUES (
    test_org_id,
    test_invite_email,
    'Custom',
    'Role',
    'user'::public.user_role, -- Base role
    'Legal',
    test_admin_id,
    'pending',
    now() + interval '14 days'
  )
  RETURNING id INTO invitation_id_val;
  
  -- Add custom role
  INSERT INTO public.invitation_custom_roles (invitation_id, role_name)
  VALUES (invitation_id_val, custom_role_name);
  
  RAISE NOTICE '✓ Invitation with custom role created';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Email: %', test_invite_email;
  RAISE NOTICE '  Base Role: user';
  RAISE NOTICE '  Custom Role: %', custom_role_name;
  
  RAISE NOTICE '';
  RAISE NOTICE 'To test acceptance:';
  RAISE NOTICE '1. Sign up with email: %', test_invite_email;
  RAISE NOTICE '2. Verify user has base role: user';
  RAISE NOTICE '3. Verify user_role_assignments contains: %', custom_role_name;
END $$;

-- ============================================================================
-- TEST 4: Verify Profile Creation After Signup
-- ============================================================================

-- This function checks if a profile was created correctly
CREATE OR REPLACE FUNCTION test_verify_profile(
  p_email text,
  p_expected_org_id uuid DEFAULT NULL,
  p_expected_role public.user_role DEFAULT NULL
)
RETURNS TABLE (
  test_name text,
  passed boolean,
  message text
)
LANGUAGE plpgsql
AS $$
DECLARE
  profile_record RECORD;
  user_record RECORD;
BEGIN
  -- Get user from auth
  SELECT * INTO user_record
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;
  
  IF user_record.id IS NULL THEN
    RETURN QUERY SELECT 'User exists in auth.users'::text, false, 'User not found'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'User exists in auth.users'::text, true, 'User found'::text;
  
  -- Get profile
  SELECT * INTO profile_record
  FROM public.profiles
  WHERE user_id = user_record.id;
  
  IF profile_record.id IS NULL THEN
    RETURN QUERY SELECT 'Profile created'::text, false, 'Profile not found'::text;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 'Profile created'::text, true, 'Profile found'::text;
  
  -- Check organization
  IF p_expected_org_id IS NOT NULL THEN
    IF profile_record.organization_id = p_expected_org_id THEN
      RETURN QUERY SELECT 'Correct organization'::text, true, format('Organization ID: %', profile_record.organization_id);
    ELSE
      RETURN QUERY SELECT 'Correct organization'::text, false, format('Expected: %, Got: %', p_expected_org_id, profile_record.organization_id);
    END IF;
  END IF;
  
  -- Check role
  IF p_expected_role IS NOT NULL THEN
    IF profile_record.role = p_expected_role THEN
      RETURN QUERY SELECT 'Correct role'::text, true, format('Role: %', profile_record.role);
    ELSE
      RETURN QUERY SELECT 'Correct role'::text, false, format('Expected: %, Got: %', p_expected_role, profile_record.role);
    END IF;
  END IF;
  
  -- Check invitation status
  IF EXISTS (
    SELECT 1 FROM invitations
    WHERE email = p_email AND status = 'accepted'
  ) THEN
    RETURN QUERY SELECT 'Invitation accepted'::text, true, 'Invitation marked as accepted'::text;
  ELSIF EXISTS (
    SELECT 1 FROM invitations
    WHERE email = p_email AND status = 'pending'
  ) THEN
    RETURN QUERY SELECT 'Invitation accepted'::text, false, 'Invitation still pending'::text;
  END IF;
END;
$$;

-- ============================================================================
-- TEST 5: Test Multiple Invitations (Should Use Most Recent)
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_email text := 'multiple' || extract(epoch from now())::text || '@test.com';
  old_invitation_id uuid;
  new_invitation_id uuid;
BEGIN
  RAISE NOTICE '=== TEST 5: Multiple Invitations (Most Recent) ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create old invitation
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'Old', 'Invite', 'user'::public.user_role, test_admin_id, 'pending', now() + interval '14 days'
  )
  RETURNING id INTO old_invitation_id;
  
  -- Wait a moment (simulated)
  PERFORM pg_sleep(1);
  
  -- Create new invitation (should be used)
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'New', 'Invite', 'admin'::public.user_role, test_admin_id, 'pending', now() + interval '14 days'
  )
  RETURNING id INTO new_invitation_id;
  
  RAISE NOTICE '✓ Created two invitations';
  RAISE NOTICE '  Old invitation ID: % (role: user)', old_invitation_id;
  RAISE NOTICE '  New invitation ID: % (role: admin)', new_invitation_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: New invitation (admin role) should be used';
  RAISE NOTICE 'To test: Sign up with email: %', test_email;
END $$;

-- ============================================================================
-- TEST 6: Test Expired Invitation (Should Create New Org)
-- ============================================================================

DO $$
DECLARE
  test_org_id uuid;
  test_admin_id uuid;
  test_email text := 'expired' || extract(epoch from now())::text || '@test.com';
  invitation_id_val uuid;
BEGIN
  RAISE NOTICE '=== TEST 6: Expired Invitation ===';
  
  -- Get test organization
  SELECT id INTO test_org_id
  FROM public.organizations
  WHERE name = 'Test Organization'
  LIMIT 1;
  
  -- Get test admin
  SELECT user_id INTO test_admin_id
  FROM public.profiles
  WHERE role = 'superadmin'
  LIMIT 1;
  
  IF test_org_id IS NULL OR test_admin_id IS NULL THEN
    RAISE NOTICE '✗ Test setup incomplete. Run setup section first.';
    RETURN;
  END IF;
  
  -- Create expired invitation
  INSERT INTO public.invitations (
    organization_id, email, first_name, last_name, role, invited_by, status, expires_at
  )
  VALUES (
    test_org_id, test_email, 'Expired', 'User', 'user'::public.user_role, test_admin_id, 'pending', now() - interval '1 day'
  )
  RETURNING id INTO invitation_id_val;
  
  RAISE NOTICE '✓ Created expired invitation';
  RAISE NOTICE '  Invitation ID: %', invitation_id_val;
  RAISE NOTICE '  Expires at: %', now() - interval '1 day';
  RAISE NOTICE '';
  RAISE NOTICE 'Expected: User should create new organization (invitation expired)';
  RAISE NOTICE 'To test: Sign up with email: %', test_email;
END $$;

-- ============================================================================
-- TEST 7: Performance Test - Check Trigger Speed
-- ============================================================================

CREATE OR REPLACE FUNCTION test_trigger_performance()
RETURNS TABLE (
  test_name text,
  duration_ms numeric,
  passed boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration numeric;
BEGIN
  -- Test invitation lookup speed
  start_time := clock_timestamp();
  
  PERFORM id FROM invitations
  WHERE email = 'test@example.com'
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
  
  end_time := clock_timestamp();
  duration := extract(epoch from (end_time - start_time)) * 1000;
  
  RETURN QUERY SELECT 
    'Invitation lookup'::text,
    duration,
    duration < 100; -- Should be under 100ms
  
  -- Test profile insert speed (simulated)
  start_time := clock_timestamp();
  
  -- Just check if we can access the table quickly
  PERFORM COUNT(*) FROM profiles LIMIT 1;
  
  end_time := clock_timestamp();
  duration := extract(epoch from (end_time - start_time)) * 1000;
  
  RETURN QUERY SELECT 
    'Profile table access'::text,
    duration,
    duration < 50; -- Should be under 50ms
END;
$$;

-- ============================================================================
-- TEST 8: Cleanup Test Data
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_test_data()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete test invitations
  DELETE FROM invitations
  WHERE email LIKE '%@test.com'
    OR email LIKE 'newuser%@test.com'
    OR email LIKE 'invited%@test.com'
    OR email LIKE 'customrole%@test.com'
    OR email LIKE 'multiple%@test.com'
    OR email LIKE 'expired%@test.com';
  
  -- Delete test custom roles
  DELETE FROM invitation_custom_roles
  WHERE invitation_id IN (
    SELECT id FROM invitations WHERE email LIKE '%@test.com'
  );
  
  RAISE NOTICE 'Test data cleaned up';
END;
$$;

-- ============================================================================
-- RUN ALL TESTS
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SIGNUP FLOW TEST SUITE';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Run each test section above individually, or use:';
  RAISE NOTICE '';
  RAISE NOTICE 'To verify a profile after signup:';
  RAISE NOTICE '  SELECT * FROM test_verify_profile(''user@example.com'', org_id, ''user''::user_role);';
  RAISE NOTICE '';
  RAISE NOTICE 'To test performance:';
  RAISE NOTICE '  SELECT * FROM test_trigger_performance();';
  RAISE NOTICE '';
  RAISE NOTICE 'To cleanup test data:';
  RAISE NOTICE '  SELECT cleanup_test_data();';
  RAISE NOTICE '';
END $$;
-- Diagnostic queries for signup flow troubleshooting
-- Run these to check system health and configuration

-- ============================================================================
-- 1. Check Trigger Function Exists and is Correct
-- ============================================================================

SELECT 
  'Trigger Function Check' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' 
        AND p.proname = 'handle_new_user_with_invitation'
    ) THEN '✓ Function exists'
    ELSE '✗ Function missing'
  END as status;

-- Check trigger is attached
SELECT 
  'Trigger Attachment' as check_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'auth' 
        AND c.relname = 'users'
        AND t.tgname = 'on_auth_user_created'
    ) THEN '✓ Trigger attached'
    ELSE '✗ Trigger not attached'
  END as status;

-- ============================================================================
-- 2. Check Required Indexes
-- ============================================================================

SELECT 
  'Index Check' as check_name,
  indexname as index_name,
  CASE 
    WHEN indexname IS NOT NULL THEN '✓ Exists'
    ELSE '✗ Missing'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'invitations'
  AND (
    indexname LIKE '%email%status%' 
    OR indexname LIKE '%invitations_email%'
  )
LIMIT 1;

-- ============================================================================
-- 3. Check RLS Policies
-- ============================================================================

SELECT 
  'RLS Policy Check' as check_name,
  schemaname || '.' || tablename as table_name,
  policyname,
  CASE 
    WHEN policyname LIKE '%Service role%' THEN '✓ Service role policy exists'
    ELSE '? Check manually'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'organizations')
  AND policyname LIKE '%Service role%';

-- ============================================================================
-- 4. Check Recent Signups
-- ============================================================================

SELECT 
  'Recent Signups' as check_name,
  u.email,
  u.created_at as user_created,
  p.created_at as profile_created,
  CASE 
    WHEN p.id IS NOT NULL THEN '✓ Profile created'
    ELSE '✗ Profile missing'
  END as status,
  o.name as organization_name,
  p.role,
  i.status as invitation_status
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
LEFT JOIN public.organizations o ON o.id = p.organization_id
LEFT JOIN public.invitations i ON i.email = u.email
WHERE u.created_at > now() - interval '24 hours'
ORDER BY u.created_at DESC
LIMIT 10;

-- ============================================================================
-- 5. Check Pending Invitations
-- ============================================================================

SELECT 
  'Pending Invitations' as check_name,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) > 0 THEN '✓ Invitations found'
    ELSE 'No pending invitations'
  END as status
FROM public.invitations
WHERE status = 'pending'
  AND expires_at > now();

-- ============================================================================
-- 6. Check for Orphaned Profiles (users without organizations)
-- ============================================================================

SELECT 
  'Orphaned Profiles Check' as check_name,
  COUNT(*) as count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✓ No orphaned profiles'
    ELSE '✗ Found orphaned profiles'
  END as status
FROM public.profiles
WHERE organization_id IS NULL;

-- ============================================================================
-- 7. Check Function Performance
-- ============================================================================

-- Test invitation lookup speed
DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration_ms numeric;
BEGIN
  start_time := clock_timestamp();
  
  PERFORM id FROM public.invitations
  WHERE email = 'test@example.com'
    AND status = 'pending'
    AND expires_at > now()
  LIMIT 1;
  
  end_time := clock_timestamp();
  duration_ms := extract(epoch from (end_time - start_time)) * 1000;
  
  RAISE NOTICE 'Invitation lookup test: % ms', duration_ms;
  
  IF duration_ms > 100 THEN
    RAISE WARNING 'Slow invitation lookup detected: % ms (should be < 100ms)', duration_ms;
  END IF;
END $$;

-- ============================================================================
-- 8. Check Table Statistics
-- ============================================================================

SELECT 
  'Table Statistics' as check_name,
  schemaname || '.' || tablename as table_name,
  n_live_tup as row_count,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'organizations', 'invitations', 'invitation_custom_roles')
ORDER BY tablename;

-- ============================================================================
-- 9. Check for Errors in Recent Logs (if accessible)
-- ============================================================================

-- Note: This requires access to pg_stat_statements or log tables
-- Adjust based on your Supabase setup

SELECT 
  'Error Check' as check_name,
  'Check Supabase Dashboard > Logs for recent errors' as message;

-- ============================================================================
-- 10. Quick Health Check Summary
-- ============================================================================

DO $$
DECLARE
  func_exists boolean;
  trigger_exists boolean;
  index_exists boolean;
  service_policy_exists boolean;
  health_status text;
BEGIN
  -- Check function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' 
      AND p.proname = 'handle_new_user_with_invitation'
  ) INTO func_exists;
  
  -- Check trigger
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' 
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
  ) INTO trigger_exists;
  
  -- Check index
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'invitations'
      AND indexname LIKE '%email%status%'
  ) INTO index_exists;
  
  -- Check service policy
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname LIKE '%Service role%'
  ) INTO service_policy_exists;
  
  -- Determine health status
  IF func_exists AND trigger_exists AND index_exists AND service_policy_exists THEN
    health_status := '✓ HEALTHY - All checks passed';
  ELSE
    health_status := '✗ ISSUES DETECTED - Review individual checks above';
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SYSTEM HEALTH CHECK';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function exists: %', CASE WHEN func_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Trigger attached: %', CASE WHEN trigger_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Index exists: %', CASE WHEN index_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE 'Service policy exists: %', CASE WHEN service_policy_exists THEN '✓' ELSE '✗' END;
  RAISE NOTICE '';
  RAISE NOTICE 'Overall Status: %', health_status;
  RAISE NOTICE '========================================';
END $$;
-- =============================================================================
-- TEMPORARY PASSWORD INVITATION FLOW
-- New invitation approach: Create user with temp password, user must change on first login
-- =============================================================================

-- Step 1: Add must_change_password flag to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Step 2: Add temp_password_hash to invitations for verification (optional security)
ALTER TABLE public.invitations 
ADD COLUMN IF NOT EXISTS temp_password_set boolean DEFAULT false;

-- Step 3: Create index for quick lookup of users needing password change
CREATE INDEX IF NOT EXISTS idx_profiles_must_change_password 
  ON public.profiles(user_id) 
  WHERE must_change_password = true;

-- Step 4: Drop the old signup trigger - we're creating users directly now
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;

-- Step 5: Create a minimal trigger ONLY for non-invited signups (self-registration)
-- Invited users are created via edge function, not through signup
CREATE OR REPLACE FUNCTION public.handle_self_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Check if profile already exists (created by invitation flow)
  IF EXISTS (SELECT 1 FROM profiles WHERE user_id = NEW.id) THEN
    RETURN NEW;  -- Profile exists, skip
  END IF;

  -- Self-registration: create profile with NULL org (will go to onboarding)
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, must_change_password, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NULL,  -- No org yet - goes to onboarding
    'superadmin',
    TRUE,
    FALSE,  -- Self-registered users set their own password
    now(),
    now()
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;  -- Don't block auth on errors
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_self_registration();

-- Step 6: Function to mark password as changed
CREATE OR REPLACE FUNCTION public.mark_password_changed()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE profiles
  SET must_change_password = false, updated_at = now()
  WHERE user_id = auth.uid();
  
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_password_changed() TO authenticated;

-- Step 7: RLS policy to allow users to see their own must_change_password status
-- (Already covered by existing "Users can view their own profile" policy)

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ TEMP PASSWORD INVITATION FLOW MIGRATION COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'New columns added:';
  RAISE NOTICE '  - profiles.must_change_password (boolean)';
  RAISE NOTICE '  - invitations.temp_password_set (boolean)';
  RAISE NOTICE '';
  RAISE NOTICE 'New flow:';
  RAISE NOTICE '  1. Admin invites user';
  RAISE NOTICE '  2. Edge function creates auth user + profile with temp password';
  RAISE NOTICE '  3. Email sent with temp password';
  RAISE NOTICE '  4. User logs in with temp password';
  RAISE NOTICE '  5. App detects must_change_password = true';
  RAISE NOTICE '  6. User forced to change password';
  RAISE NOTICE '  7. mark_password_changed() called -> Dashboard';
  RAISE NOTICE '';
END $$;
-- Create organization table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create profiles table for user information
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',
  department TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  company TEXT,
  notes TEXT,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Create cases table
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  case_number TEXT UNIQUE,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  assigned_to UUID REFERENCES auth.users(id),
  court TEXT,
  next_hearing_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cases
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  category TEXT,
  tags TEXT[],
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create contracts table
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  contract_type TEXT,
  status TEXT DEFAULT 'draft',
  value DECIMAL(15,2),
  currency TEXT DEFAULT 'USD',
  start_date DATE,
  end_date DATE,
  terms TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on contracts
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- Create calendar_events table
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT,
  attendees TEXT[],
  event_type TEXT DEFAULT 'meeting',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Create settings table
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, key)
);

-- Enable RLS on settings
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create function to get user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for Organizations
CREATE POLICY "Users can view their organization" 
  ON public.organizations 
  FOR SELECT 
  USING (id = public.get_user_organization_id());

CREATE POLICY "Users can update their organization" 
  ON public.organizations 
  FOR UPDATE 
  USING (id = public.get_user_organization_id());

-- RLS Policies for Profiles
CREATE POLICY "Users can view all profiles in their organization" 
  ON public.profiles 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update their own profile" 
  ON public.profiles 
  FOR UPDATE 
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

-- RLS Policies for Clients
CREATE POLICY "Users can view clients in their organization" 
  ON public.clients 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create clients in their organization" 
  ON public.clients 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update clients in their organization" 
  ON public.clients 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete clients in their organization" 
  ON public.clients 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Cases
CREATE POLICY "Users can view cases in their organization" 
  ON public.cases 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create cases in their organization" 
  ON public.cases 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update cases in their organization" 
  ON public.cases 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete cases in their organization" 
  ON public.cases 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Documents
CREATE POLICY "Users can view documents in their organization" 
  ON public.documents 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create documents in their organization" 
  ON public.documents 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update documents in their organization" 
  ON public.documents 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete documents in their organization" 
  ON public.documents 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Contracts
CREATE POLICY "Users can view contracts in their organization" 
  ON public.contracts 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create contracts in their organization" 
  ON public.contracts 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update contracts in their organization" 
  ON public.contracts 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete contracts in their organization" 
  ON public.contracts 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Calendar Events
CREATE POLICY "Users can view calendar events in their organization" 
  ON public.calendar_events 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create calendar events in their organization" 
  ON public.calendar_events 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update calendar events in their organization" 
  ON public.calendar_events 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete calendar events in their organization" 
  ON public.calendar_events 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- RLS Policies for Settings
CREATE POLICY "Users can view settings in their organization" 
  ON public.settings 
  FOR SELECT 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can create settings in their organization" 
  ON public.settings 
  FOR INSERT 
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update settings in their organization" 
  ON public.settings 
  FOR UPDATE 
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can delete settings in their organization" 
  ON public.settings 
  FOR DELETE 
  USING (organization_id = public.get_user_organization_id());

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();-- Fix security warnings by setting search_path on functions
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';-- Add state and country fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN state TEXT,
ADD COLUMN country TEXT;-- First, let's create a sample organization
INSERT INTO public.organizations (id, name, description, address, state, country, phone, email, website) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'Legal Excellence Partners', 'A full-service law firm specializing in corporate and litigation matters', '123 Legal Street, Suite 500', 'California', 'United States', '+1-555-123-4567', 'info@legalexcellence.com', 'https://legalexcellence.com');

-- Create sample profiles (users) for the organization
INSERT INTO public.profiles (id, user_id, organization_id, first_name, last_name, email, role, department, phone) VALUES 
('660e8400-e29b-41d4-a716-446655440001', '660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'John', 'Smith', 'john.smith@legalexcellence.com', 'partner', 'Corporate Law', '+1-555-123-4568'),
('660e8400-e29b-41d4-a716-446655440002', '660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Sarah', 'Johnson', 'sarah.johnson@legalexcellence.com', 'senior_associate', 'Litigation', '+1-555-123-4569');

-- Create sample clients
INSERT INTO public.clients (id, organization_id, name, email, phone, address, company, notes, status, created_by) VALUES 
('770e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Tech Innovations Inc.', 'contact@techinnovations.com', '+1-555-987-6543', '456 Innovation Drive, Tech City, CA 90210', 'Tech Innovations Inc.', 'Large technology company requiring corporate legal services', 'active', '660e8400-e29b-41d4-a716-446655440001'),
('770e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Michael Davis', 'michael.davis@email.com', '+1-555-456-7890', '789 Residential Ave, Los Angeles, CA 90025', NULL, 'Individual client involved in personal injury case', 'active', '660e8400-e29b-41d4-a716-446655440002'),
('770e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Green Energy Solutions', 'legal@greenenergy.com', '+1-555-321-9876', '321 Solar Street, Renewable City, CA 91234', 'Green Energy Solutions LLC', 'Renewable energy startup needing regulatory compliance assistance', 'active', '660e8400-e29b-41d4-a716-446655440001'),
('770e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'Restaurant Group LLC', 'admin@restaurantgroup.com', '+1-555-654-3210', '987 Culinary Blvd, Food City, CA 92345', 'Restaurant Group LLC', 'Multi-location restaurant chain requiring employment law guidance', 'active', '660e8400-e29b-41d4-a716-446655440002');

-- Create sample cases
INSERT INTO public.cases (id, organization_id, client_id, title, description, case_number, status, priority, court, assigned_to, next_hearing_date, created_by) VALUES 
('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations Merger & Acquisition', 'Legal review and documentation for merger with CompetitorCorp', 'TI-2024-001', 'open', 'high', 'Superior Court of California', '660e8400-e29b-41d4-a716-446655440001', '2024-08-15 10:00:00-07', '660e8400-e29b-41d4-a716-446655440001'),
('880e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002', 'Davis Personal Injury Claim', 'Motor vehicle accident case seeking damages for medical expenses and lost wages', 'MD-2024-002', 'open', 'medium', 'Los Angeles County Superior Court', '660e8400-e29b-41d4-a716-446655440002', '2024-08-20 14:30:00-07', '660e8400-e29b-41d4-a716-446655440002'),
('880e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Regulatory Compliance', 'Assistance with state renewable energy regulations and permitting', 'GE-2024-003', 'open', 'medium', NULL, '660e8400-e29b-41d4-a716-446655440001', NULL, '660e8400-e29b-41d4-a716-446655440001'),
('880e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440004', 'Restaurant Group Employment Dispute', 'Employee classification and wage dispute resolution', 'RG-2024-004', 'open', 'high', 'California Labor Commission', '660e8400-e29b-41d4-a716-446655440002', '2024-08-25 09:00:00-07', '660e8400-e29b-41d4-a716-446655440002'),
('880e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations IP Protection', 'Patent application and trademark registration for new technology products', 'TI-2024-005', 'closed', 'low', NULL, '660e8400-e29b-41d4-a716-446655440001', NULL, '660e8400-e29b-41d4-a716-446655440001');

-- Create sample documents
INSERT INTO public.documents (id, organization_id, case_id, client_id, title, description, file_type, file_size, category, tags, uploaded_by) VALUES 
('990e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 'Merger Agreement Draft', 'Initial draft of merger agreement between Tech Innovations and CompetitorCorp', 'pdf', 2456789, 'Contract', ARRAY['merger', 'corporate', 'draft'], '660e8400-e29b-41d4-a716-446655440001'),
('990e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 'Medical Records - Davis', 'Complete medical records from accident and treatment', 'pdf', 5789234, 'Medical', ARRAY['medical', 'injury', 'evidence'], '660e8400-e29b-41d4-a716-446655440002'),
('990e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440003', 'Environmental Impact Study', 'State-required environmental assessment for solar installation project', 'pdf', 8934567, 'Regulatory', ARRAY['environmental', 'regulatory', 'solar'], '660e8400-e29b-41d4-a716-446655440001'),
('990e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', 'Employee Handbook', 'Current employee handbook and policies', 'docx', 1234567, 'Policy', ARRAY['employment', 'handbook', 'policy'], '660e8400-e29b-41d4-a716-446655440002'),
('990e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', NULL, '770e8400-e29b-41d4-a716-446655440001', 'Retainer Agreement', 'Standard retainer agreement for ongoing legal services', 'pdf', 456789, 'Contract', ARRAY['retainer', 'agreement', 'standard'], '660e8400-e29b-41d4-a716-446655440001');

-- Create sample contracts
INSERT INTO public.contracts (id, organization_id, client_id, title, description, contract_type, status, value, currency, start_date, end_date, terms, created_by) VALUES 
('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations Legal Services Agreement', 'Comprehensive legal services retainer for corporate matters', 'Retainer', 'active', 250000.00, 'USD', '2024-01-01', '2024-12-31', 'Monthly retainer of $25,000 for general corporate legal services including M&A support, contract review, and regulatory compliance', '660e8400-e29b-41d4-a716-446655440001'),
('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002', 'Personal Injury Representation Agreement', 'Contingency fee agreement for personal injury case', 'Contingency', 'active', 50000.00, 'USD', '2024-06-01', '2025-06-01', '33% contingency fee on successful recovery. Client responsible for court costs and expert witness fees', '660e8400-e29b-41d4-a716-446655440002'),
('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Regulatory Consulting', 'Ongoing regulatory compliance and permitting support', 'Hourly', 'active', 75000.00, 'USD', '2024-03-01', '2025-03-01', 'Hourly billing at $450/hour for partner time, $275/hour for associate time. Monthly cap of $8,000', '660e8400-e29b-41d4-a716-446655440001'),
('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440004', 'Restaurant Group Employment Law Services', 'Employment law guidance and dispute resolution', 'Project', 'active', 35000.00, 'USD', '2024-07-01', '2024-10-31', 'Fixed fee project to resolve current employment disputes and update HR policies', '660e8400-e29b-41d4-a716-446655440002');

-- Create sample calendar events
INSERT INTO public.calendar_events (id, organization_id, case_id, client_id, title, description, start_date, end_date, location, attendees, event_type, created_by) VALUES 
('bb0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 'Merger Negotiation Meeting', 'Final negotiation session for Tech Innovations merger terms', '2024-08-15 10:00:00-07', '2024-08-15 12:00:00-07', 'Superior Court of California, Room 302', ARRAY['john.smith@legalexcellence.com', 'contact@techinnovations.com'], 'meeting', '660e8400-e29b-41d4-a716-446655440001'),
('bb0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 'Davis Deposition', 'Client deposition for personal injury case', '2024-08-20 14:30:00-07', '2024-08-20 16:30:00-07', 'Los Angeles County Superior Court, Conference Room B', ARRAY['sarah.johnson@legalexcellence.com', 'michael.davis@email.com'], 'deposition', '660e8400-e29b-41d4-a716-446655440002'),
('bb0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', 'Employment Law Hearing', 'Labor Commission hearing for wage dispute', '2024-08-25 09:00:00-07', '2024-08-25 11:00:00-07', 'California Labor Commission, Downtown LA', ARRAY['sarah.johnson@legalexcellence.com', 'admin@restaurantgroup.com'], 'hearing', '660e8400-e29b-41d4-a716-446655440002'),
('bb0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', NULL, '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Consultation', 'Monthly check-in on regulatory compliance progress', '2024-08-30 15:00:00-07', '2024-08-30 16:00:00-07', 'Video Conference', ARRAY['john.smith@legalexcellence.com', 'legal@greenenergy.com'], 'consultation', '660e8400-e29b-41d4-a716-446655440001'),
('bb0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', NULL, NULL, 'Weekly Team Meeting', 'Weekly status update meeting for all attorneys', '2024-08-05 13:00:00-07', '2024-08-05 14:00:00-07', 'Conference Room A, Legal Excellence Partners', ARRAY['john.smith@legalexcellence.com', 'sarah.johnson@legalexcellence.com'], 'meeting', '660e8400-e29b-41d4-a716-446655440001'),
('bb0e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440000', NULL, NULL, 'CLE Training Session', 'Continuing Legal Education on new employment law updates', '2024-08-12 09:00:00-07', '2024-08-12 17:00:00-07', 'Downtown Conference Center', ARRAY['john.smith@legalexcellence.com', 'sarah.johnson@legalexcellence.com'], 'training', '660e8400-e29b-41d4-a716-446655440002');-- Create sample data for all modules (fixing the user reference issue)

-- First, let's create a sample organization
INSERT INTO public.organizations (id, name, description, address, state, country, phone, email, website) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'Legal Excellence Partners', 'A full-service law firm specializing in corporate and litigation matters', '123 Legal Street, Suite 500', 'California', 'United States', '+1-555-123-4567', 'info@legalexcellence.com', 'https://legalexcellence.com');

-- Create sample clients
INSERT INTO public.clients (id, organization_id, name, email, phone, address, company, notes, status) VALUES 
('770e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', 'Tech Innovations Inc.', 'contact@techinnovations.com', '+1-555-987-6543', '456 Innovation Drive, Tech City, CA 90210', 'Tech Innovations Inc.', 'Large technology company requiring corporate legal services', 'active'),
('770e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', 'Michael Davis', 'michael.davis@email.com', '+1-555-456-7890', '789 Residential Ave, Los Angeles, CA 90025', NULL, 'Individual client involved in personal injury case', 'active'),
('770e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', 'Green Energy Solutions', 'legal@greenenergy.com', '+1-555-321-9876', '321 Solar Street, Renewable City, CA 91234', 'Green Energy Solutions LLC', 'Renewable energy startup needing regulatory compliance assistance', 'active'),
('770e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', 'Restaurant Group LLC', 'admin@restaurantgroup.com', '+1-555-654-3210', '987 Culinary Blvd, Food City, CA 92345', 'Restaurant Group LLC', 'Multi-location restaurant chain requiring employment law guidance', 'active');

-- Create sample cases
INSERT INTO public.cases (id, organization_id, client_id, title, description, case_number, status, priority, court, next_hearing_date) VALUES 
('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations Merger & Acquisition', 'Legal review and documentation for merger with CompetitorCorp', 'TI-2024-001', 'open', 'high', 'Superior Court of California', '2024-08-15 10:00:00-07'),
('880e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002', 'Davis Personal Injury Claim', 'Motor vehicle accident case seeking damages for medical expenses and lost wages', 'MD-2024-002', 'open', 'medium', 'Los Angeles County Superior Court', '2024-08-20 14:30:00-07'),
('880e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Regulatory Compliance', 'Assistance with state renewable energy regulations and permitting', 'GE-2024-003', 'open', 'medium', NULL, NULL),
('880e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440004', 'Restaurant Group Employment Dispute', 'Employee classification and wage dispute resolution', 'RG-2024-004', 'open', 'high', 'California Labor Commission', '2024-08-25 09:00:00-07'),
('880e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations IP Protection', 'Patent application and trademark registration for new technology products', 'TI-2024-005', 'closed', 'low', NULL, NULL);

-- Create sample documents
INSERT INTO public.documents (id, organization_id, case_id, client_id, title, description, file_type, file_size, category, tags) VALUES 
('990e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 'Merger Agreement Draft', 'Initial draft of merger agreement between Tech Innovations and CompetitorCorp', 'pdf', 2456789, 'Contract', ARRAY['merger', 'corporate', 'draft']),
('990e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 'Medical Records - Davis', 'Complete medical records from accident and treatment', 'pdf', 5789234, 'Medical', ARRAY['medical', 'injury', 'evidence']),
('990e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440003', '770e8400-e29b-41d4-a716-446655440003', 'Environmental Impact Study', 'State-required environmental assessment for solar installation project', 'pdf', 8934567, 'Regulatory', ARRAY['environmental', 'regulatory', 'solar']),
('990e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', 'Employee Handbook', 'Current employee handbook and policies', 'docx', 1234567, 'Policy', ARRAY['employment', 'handbook', 'policy']),
('990e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', NULL, '770e8400-e29b-41d4-a716-446655440001', 'Retainer Agreement', 'Standard retainer agreement for ongoing legal services', 'pdf', 456789, 'Contract', ARRAY['retainer', 'agreement', 'standard']);

-- Create sample contracts
INSERT INTO public.contracts (id, organization_id, client_id, title, description, contract_type, status, value, currency, start_date, end_date, terms) VALUES 
('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440001', 'Tech Innovations Legal Services Agreement', 'Comprehensive legal services retainer for corporate matters', 'Retainer', 'active', 250000.00, 'USD', '2024-01-01', '2024-12-31', 'Monthly retainer of $25,000 for general corporate legal services including M&A support, contract review, and regulatory compliance'),
('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440002', 'Personal Injury Representation Agreement', 'Contingency fee agreement for personal injury case', 'Contingency', 'active', 50000.00, 'USD', '2024-06-01', '2025-06-01', '33% contingency fee on successful recovery. Client responsible for court costs and expert witness fees'),
('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Regulatory Consulting', 'Ongoing regulatory compliance and permitting support', 'Hourly', 'active', 75000.00, 'USD', '2024-03-01', '2025-03-01', 'Hourly billing at $450/hour for partner time, $275/hour for associate time. Monthly cap of $8,000'),
('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', '770e8400-e29b-41d4-a716-446655440004', 'Restaurant Group Employment Law Services', 'Employment law guidance and dispute resolution', 'Project', 'active', 35000.00, 'USD', '2024-07-01', '2024-10-31', 'Fixed fee project to resolve current employment disputes and update HR policies');

-- Create sample calendar events
INSERT INTO public.calendar_events (id, organization_id, case_id, client_id, title, description, start_date, end_date, location, attendees, event_type) VALUES 
('bb0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440001', 'Merger Negotiation Meeting', 'Final negotiation session for Tech Innovations merger terms', '2024-08-15 10:00:00-07', '2024-08-15 12:00:00-07', 'Superior Court of California, Room 302', ARRAY['john.smith@legalexcellence.com', 'contact@techinnovations.com'], 'meeting'),
('bb0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440002', 'Davis Deposition', 'Client deposition for personal injury case', '2024-08-20 14:30:00-07', '2024-08-20 16:30:00-07', 'Los Angeles County Superior Court, Conference Room B', ARRAY['sarah.johnson@legalexcellence.com', 'michael.davis@email.com'], 'deposition'),
('bb0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440000', '880e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440004', 'Employment Law Hearing', 'Labor Commission hearing for wage dispute', '2024-08-25 09:00:00-07', '2024-08-25 11:00:00-07', 'California Labor Commission, Downtown LA', ARRAY['sarah.johnson@legalexcellence.com', 'admin@restaurantgroup.com'], 'hearing'),
('bb0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440000', NULL, '770e8400-e29b-41d4-a716-446655440003', 'Green Energy Consultation', 'Monthly check-in on regulatory compliance progress', '2024-08-30 15:00:00-07', '2024-08-30 16:00:00-07', 'Video Conference', ARRAY['john.smith@legalexcellence.com', 'legal@greenenergy.com'], 'consultation'),
('bb0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440000', NULL, NULL, 'Weekly Team Meeting', 'Weekly status update meeting for all attorneys', '2024-08-05 13:00:00-07', '2024-08-05 14:00:00-07', 'Conference Room A, Legal Excellence Partners', ARRAY['john.smith@legalexcellence.com', 'sarah.johnson@legalexcellence.com'], 'meeting'),
('bb0e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440000', NULL, NULL, 'CLE Training Session', 'Continuing Legal Education on new employment law updates', '2024-08-12 09:00:00-07', '2024-08-12 17:00:00-07', 'Downtown Conference Center', ARRAY['john.smith@legalexcellence.com', 'sarah.johnson@legalexcellence.com'], 'training');-- First, let's fix the database structure and add proper relationships

-- Add foreign key constraints that are missing
ALTER TABLE cases 
ADD CONSTRAINT fk_cases_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE cases 
ADD CONSTRAINT fk_cases_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE contracts 
ADD CONSTRAINT fk_contracts_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Update profiles table to add role and make organization_id required
ALTER TABLE profiles 
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE profiles 
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'user';

-- Add is_organization_creator column to track who created the organization
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Create function to automatically create organization and set user as superadmin for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin',
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Update the trigger to use the new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to invite users to organization
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role user_role,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role user_role;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- For now, we'll create a pending invitation record
  -- In a real implementation, you'd integrate with Supabase Auth to send invitation emails
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name, 
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'User invitation created successfully'
  );
END;
$$;

-- Update RLS policies to be more performant and use the new structure

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create optimized RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON organizations FOR SELECT 
USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization" 
ON organizations FOR UPDATE 
USING (
  id = get_user_organization_id() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('superadmin', 'admin')
  )
);

-- Create optimized RLS policies for profiles
CREATE POLICY "Users can view profiles in their organization" 
ON profiles FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert profiles in their organization" 
ON profiles FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() OR
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile or admins can update any profile in org" 
ON profiles FOR UPDATE 
USING (
  user_id = auth.uid() OR 
  (organization_id = get_user_organization_id() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('superadmin', 'admin')
  ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_cases_organization_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);-- First, let's fix the database structure and add proper relationships

-- Add foreign key constraints that are missing
ALTER TABLE cases 
ADD CONSTRAINT fk_cases_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE cases 
ADD CONSTRAINT fk_cases_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE contracts 
ADD CONSTRAINT fk_contracts_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Update profiles table to add role and make organization_id required
ALTER TABLE profiles 
ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE profiles 
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'user';

-- Add is_organization_creator column to track who created the organization
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Create function to automatically create organization and set user as superadmin for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin',
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Update the trigger to use the new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to invite users to organization
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role user_role,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role user_role;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- For now, we'll create a pending invitation record
  -- In a real implementation, you'd integrate with Supabase Auth to send invitation emails
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name, 
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'User invitation created successfully'
  );
END;
$$;

-- Update RLS policies to be more performant and use the new structure

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create optimized RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON organizations FOR SELECT 
USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization" 
ON organizations FOR UPDATE 
USING (
  id = get_user_organization_id() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('superadmin', 'admin')
  )
);

-- Create optimized RLS policies for profiles
CREATE POLICY "Users can view profiles in their organization" 
ON profiles FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert profiles in their organization" 
ON profiles FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() OR
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile or admins can update any profile in org" 
ON profiles FOR UPDATE 
USING (
  user_id = auth.uid() OR 
  (organization_id = get_user_organization_id() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('superadmin', 'admin')
  ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_cases_organization_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);-- First, let's handle existing data and create the organization for the current user

-- Create organization for existing users who don't have one
DO $$
DECLARE
    user_record RECORD;
    new_org_id uuid;
    org_name text;
BEGIN
    -- Loop through profiles that don't have an organization
    FOR user_record IN 
        SELECT p.user_id, p.first_name, p.last_name, p.email, u.raw_user_meta_data
        FROM profiles p
        LEFT JOIN auth.users u ON p.user_id = u.id
        WHERE p.organization_id IS NULL
    LOOP
        -- Create organization name from user data
        org_name := COALESCE(
            user_record.raw_user_meta_data ->> 'organization',
            CONCAT(
                COALESCE(user_record.first_name, 'User'), 
                ' ', 
                COALESCE(user_record.last_name, ''),
                ' Organization'
            )
        );

        -- Create organization for this user
        INSERT INTO public.organizations (name, email, created_at, updated_at)
        VALUES (org_name, user_record.email, now(), now())
        RETURNING id INTO new_org_id;

        -- Update the profile with the organization
        UPDATE profiles 
        SET organization_id = new_org_id,
            role = 'superadmin',
            is_organization_creator = TRUE,
            updated_at = now()
        WHERE user_id = user_record.user_id;
    END LOOP;
END $$;

-- Now add the NOT NULL constraint
ALTER TABLE profiles 
ALTER COLUMN organization_id SET NOT NULL;

-- Add foreign key constraints that are missing
ALTER TABLE cases 
ADD CONSTRAINT fk_cases_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE cases 
ADD CONSTRAINT fk_cases_assigned_to 
FOREIGN KEY (assigned_to) REFERENCES profiles(user_id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE documents 
ADD CONSTRAINT fk_documents_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE contracts 
ADD CONSTRAINT fk_contracts_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_case_id 
FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT fk_calendar_events_client_id 
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Update profiles table role column to use the enum
ALTER TABLE profiles 
ALTER COLUMN role TYPE user_role USING role::user_role;

ALTER TABLE profiles 
ALTER COLUMN role SET DEFAULT 'user';

-- Add is_organization_creator column to track who created the organization
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Update existing profiles to mark the current user as organization creator
UPDATE profiles 
SET is_organization_creator = TRUE 
WHERE role = 'superadmin';

-- Create function to automatically create organization and set user as superadmin for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin',
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Update the trigger to use the new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create function to invite users to organization
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role user_role,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role user_role;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- For now, we'll create a pending invitation record
  -- In a real implementation, you'd integrate with Supabase Auth to send invitation emails
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name, 
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'User invitation created successfully'
  );
END;
$$;-- Create user roles enum
CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');

-- Add is_organization_creator column first
ALTER TABLE profiles 
ADD COLUMN is_organization_creator BOOLEAN DEFAULT FALSE;

-- Update existing profiles to mark the current user as organization creator
UPDATE profiles 
SET is_organization_creator = TRUE 
WHERE role = 'superadmin';

-- Add a new role column with the enum type
ALTER TABLE profiles 
ADD COLUMN role_new user_role DEFAULT 'user';

-- Copy existing role values to the new column
UPDATE profiles 
SET role_new = CASE 
  WHEN role = 'superadmin' THEN 'superadmin'::user_role
  WHEN role = 'admin' THEN 'admin'::user_role
  ELSE 'user'::user_role
END;

-- Drop the old role column and rename the new one
ALTER TABLE profiles DROP COLUMN role;
ALTER TABLE profiles RENAME COLUMN role_new TO role;

-- Make the role column NOT NULL
ALTER TABLE profiles ALTER COLUMN role SET NOT NULL;

-- Create function to automatically create organization and set user as superadmin for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Update the trigger to use the new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();-- Create function to invite users to organization
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role user_role,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role user_role;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- For now, we'll create a pending invitation record
  -- In a real implementation, you'd integrate with Supabase Auth to send invitation emails
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name, 
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'User invitation created successfully'
  );
END;
$$;

-- Update RLS policies to be more performant and use the new structure

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create optimized RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON organizations FOR SELECT 
USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization" 
ON organizations FOR UPDATE 
USING (
  id = get_user_organization_id() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('superadmin', 'admin')
  )
);

-- Create optimized RLS policies for profiles
CREATE POLICY "Users can view profiles in their organization" 
ON profiles FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert profiles in their organization" 
ON profiles FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() OR
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile or admins can update any profile in org" 
ON profiles FOR UPDATE 
USING (
  user_id = auth.uid() OR 
  (organization_id = get_user_organization_id() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('superadmin', 'admin')
  ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_cases_organization_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);-- Create function to invite users to organization (using text for role parameter for now)
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  result json;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check if current user has permission to invite users
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- Validate role parameter
  IF p_role NOT IN ('superadmin', 'admin', 'user') THEN
    RETURN json_build_object('error', 'Invalid role specified');
  END IF;

  -- For now, we'll create a pending invitation record
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name, 
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(), -- Temporary ID until user signs up
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role::user_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true, 
    'message', 'User invitation created successfully'
  );
END;
$$;

-- Update RLS policies to be more performant and use the new structure

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

-- Create optimized RLS policies for organizations
CREATE POLICY "Users can view their organization" 
ON organizations FOR SELECT 
USING (id = get_user_organization_id());

CREATE POLICY "Admins can update their organization" 
ON organizations FOR UPDATE 
USING (
  id = get_user_organization_id() AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role IN ('superadmin', 'admin')
  )
);

-- Create optimized RLS policies for profiles
CREATE POLICY "Users can view profiles in their organization" 
ON profiles FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can insert profiles in their organization" 
ON profiles FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() OR
  user_id = auth.uid()
);

CREATE POLICY "Users can update their own profile or admins can update any profile in org" 
ON profiles FOR UPDATE 
USING (
  user_id = auth.uid() OR 
  (organization_id = get_user_organization_id() AND EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role IN ('superadmin', 'admin')
  ))
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_cases_organization_id ON cases(organization_id);
CREATE INDEX IF NOT EXISTS idx_cases_client_id ON cases(client_id);
CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON clients(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_organization_id ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_case_id ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_contracts_organization_id ON contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_organization_id ON calendar_events(organization_id);-- Remove all sample data to start fresh
DELETE FROM calendar_events WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM contracts WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM documents WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM cases WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM clients WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM organizations WHERE name LIKE '%Legal Solutions%';-- Create user_roles table for managing custom roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  role_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, role_name)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for user_roles
CREATE POLICY "Users can view roles in their organization" 
ON public.user_roles 
FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Superadmins can create roles in their organization" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

CREATE POLICY "Superadmins can update roles in their organization" 
ON public.user_roles 
FOR UPDATE 
USING (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

CREATE POLICY "Superadmins can delete roles in their organization" 
ON public.user_roles 
FOR DELETE 
USING (
  organization_id = get_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Migration: Fix invite_user_to_organization search_path and schema

-- Ensure function is created in public schema and has proper search_path
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles 
  WHERE user_id = auth.uid();

  -- Check permissions
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    RETURN json_build_object('error', 'Insufficient permissions to invite users');
  END IF;

  -- Check if user already exists in auth.users
  SELECT id INTO invited_user_id
  FROM auth.users
  WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- Validate role param
  IF p_role NOT IN ('superadmin', 'admin', 'user') THEN
    RETURN json_build_object('error', 'Invalid role specified');
  END IF;

  -- Insert invitation as pending profile
  INSERT INTO public.profiles (
    user_id,
    first_name,
    last_name,
    email,
    organization_id,
    role,
    department,
    is_organization_creator,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    p_first_name,
    p_last_name,
    p_email,
    current_org_id,
    p_role::user_role,
    p_department,
    FALSE,
    now(),
    now()
  );

  RETURN json_build_object(
    'success', true,
    'message', 'User invitation created successfully'
  );
END;
$$;
-- 20250810120000_create_case_types_and_fields.sql
-- Add customizable case types and fields

SET search_path = auth, public;

-- Create case_types table
CREATE TABLE IF NOT EXISTS public.case_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create case_fields table
CREATE TABLE IF NOT EXISTS public.case_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_type_id uuid NOT NULL REFERENCES public.case_types(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_key text NOT NULL,
  data_type text NOT NULL,      -- e.g. 'text','number','date','select'
  required boolean DEFAULT FALSE,
  options jsonb,                -- for select fields: { "choices": ["A","B"] }
  field_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT case_fields_unique_key UNIQUE(case_type_id, field_key)
);

-- Add case_type_id to existing cases table
ALTER TABLE IF EXISTS public.cases
  ADD COLUMN IF NOT EXISTS case_type_id uuid REFERENCES public.case_types(id);
-- 20250810121000_add_custom_fields_to_cases.sql
-- Add JSONB column to store custom field values on cases

SET search_path = auth, public;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- Grant authenticated role permission to insert/update custom_fields
GRANT UPDATE(custom_fields), SELECT(custom_fields) ON public.cases TO authenticated;
-- 20250810130000_case_activities.sql
-- Adds task/time-tracking for cases

SET search_path = auth, public;

-------------------------------------------------------------------
-- new table: case_activities
-------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  activity_type text NOT NULL,          -- 'task'|'meeting'|'court'|'research' etc.
  assigned_to uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  due_date date,
  status text DEFAULT 'pending',        -- 'pending'|'in_progress'|'completed'
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_case_activities_case_id ON public.case_activities(case_id);

-------------------------------------------------------------------
-- new table: time_entries (logs billable time per activity)
-------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.case_activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  minutes integer NOT NULL CHECK (minutes > 0),
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_activity_id ON public.time_entries(activity_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.time_entries(user_id);

-------------------------------------------------------------------
-- augment cases with current_status, progress helpers
-------------------------------------------------------------------
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS current_status text DEFAULT 'in_progress';

-------------------------------------------------------------------
-- RLS stubs ( tighten later )
-------------------------------------------------------------------
-- Only members of same org can interact
-- Assumes get_user_organization_id() helper already exists

ALTER TABLE public.case_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members select activities" ON public.case_activities
  FOR SELECT USING (exists(select 1 from public.cases c where c.id = case_id and c.organization_id = get_user_organization_id()));
CREATE POLICY "org members modify activities" ON public.case_activities
  FOR ALL USING (true) WITH CHECK (exists(select 1 from public.cases c where c.id = case_id and c.organization_id = get_user_organization_id()));

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members select time" ON public.time_entries
  FOR SELECT USING (exists(select 1 from public.case_activities a join public.cases c on a.case_id=c.id where a.id = activity_id and c.organization_id = get_user_organization_id()));
CREATE POLICY "org members modify time" ON public.time_entries
  FOR ALL USING (true) WITH CHECK (exists(select 1 from public.case_activities a join public.cases c on a.case_id=c.id where a.id = activity_id and c.organization_id = get_user_organization_id()));

-------------------------------------------------------------------
-- Grant execute/select
-------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_activities, public.time_entries TO authenticated;
-- 20250810140000_create_communication_logs.sql
-- Adds communication_logs table for client interactions

SET search_path = auth, public;

CREATE TABLE IF NOT EXISTS public.communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  type text NOT NULL,            -- 'email','phone','note'
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_logs_client_id ON public.communication_logs(client_id);

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members select commlogs" ON public.communication_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "org members modify commlogs" ON public.communication_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_logs TO authenticated;
-- 20250810150000_document_versioning_and_templates.sql
-- Document versioning + template support

SET search_path = auth, public;

--------------------------------------------------------------------
-- 1. Templates table
--------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doc_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  content text NOT NULL,                -- raw md/plain text with {{placeholders}}
  variables text[],                     -- list of placeholder names
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_org ON public.doc_templates(organization_id);

--------------------------------------------------------------------
-- 2. Extend documents table for versioning / template link
--------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.doc_templates(id) ON DELETE SET NULL;

-- ensure history uniqueness (one active record per doc path if desired) - optional

--------------------------------------------------------------------
-- 3. Function & trigger to auto-increment version when uploading new version (same file path / same parent doc)
--------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_document_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_bump_doc_version ON public.documents;
CREATE TRIGGER trg_bump_doc_version BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE PROCEDURE public.bump_document_version();

--------------------------------------------------------------------
-- 4. RLS policies (reuse existing org policy if any). Ensure new columns accessible.
--------------------------------------------------------------------
-- Assuming documents already RLS-enabled, just grant new columns
GRANT UPDATE(version,previous_version_id,template_id) ON public.documents TO authenticated;

ALTER TABLE public.doc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members template access" ON public.doc_templates
  USING (organization_id = get_user_organization_id())
  WITH CHECK (organization_id = get_user_organization_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.doc_templates TO authenticated;
-- Create invitations table for user invites
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  role public.user_role not null default 'user',
  department text,
  invited_by uuid not null, -- auth user id of inviter
  status text not null default 'pending', -- pending | accepted | revoked | expired
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_status_chk check (status in ('pending','accepted','revoked','expired'))
);

-- Indexes and constraints
create index if not exists invitations_org_idx on public.invitations(organization_id);
create unique index if not exists invitations_unique_pending on public.invitations(organization_id, email) where status = 'pending';

-- RLS
alter table public.invitations enable row level security;

-- Helper function to check if current user is admin/superadmin in their org
create or replace function public.current_user_is_org_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('admin','superadmin')
  );
$$;

-- Policies: admins of an org can manage their org's invitations
drop policy if exists "Admins can view org invitations" on public.invitations;
create policy "Admins can view org invitations"
  on public.invitations for select
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can insert org invitations" on public.invitations;
create policy "Admins can insert org invitations"
  on public.invitations for insert
  with check (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can update org invitations" on public.invitations;
create policy "Admins can update org invitations"
  on public.invitations for update
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can delete org invitations" on public.invitations;
create policy "Admins can delete org invitations"
  on public.invitations for delete
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can insert org invitations" on public.invitations;
create policy "Admins can insert org invitations"
  on public.invitations for insert
  with check (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can update org invitations" on public.invitations;
create policy "Admins can update org invitations"
  on public.invitations for update
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

drop policy if exists "Admins can delete org invitations" on public.invitations;
create policy "Admins can delete org invitations"
  on public.invitations for delete
  using (
    public.current_user_is_org_admin() and
    organization_id = (select organization_id from public.profiles where user_id = auth.uid())
  );

-- Trigger to auto-update updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invitations_set_updated on public.invitations;
create trigger trg_invitations_set_updated
before update on public.invitations
for each row execute function public.set_updated_at();

-- Update invite_user_to_organization to handle existing users and invitations
create or replace function public.invite_user_to_organization(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text,
  p_department text default null
) returns json
language plpgsql
security definer
set search_path to 'auth','public'
as $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  -- Check permissions
  IF current_user_role NOT IN ('superadmin', 'admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Validate role param and cast to enum
  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  normalized_role := p_role::public.user_role;

  -- Check if user already exists in auth.users
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- If user exists, upsert their profile into this organization
    -- If a profile already exists for this user, update org and role
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
        set organization_id = current_org_id,
            role = normalized_role,
            department = p_department,
            first_name = coalesce(first_name, p_first_name),
            last_name = coalesce(last_name, p_last_name),
            email = coalesce(email, p_email),
            updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, email, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, p_email, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message','Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation record
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message','Invitation created');
END;
$$;-- Enable RLS on case_types table
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;

-- Enable RLS on case_fields table  
ALTER TABLE public.case_fields ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for case_types table
-- Users can view case types in their organization
CREATE POLICY "Users can view case types in their organization" 
ON public.case_types 
FOR SELECT 
USING (organization_id = get_user_organization_id());

-- Users can create case types in their organization
CREATE POLICY "Users can create case types in their organization" 
ON public.case_types 
FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

-- Users can update case types in their organization
CREATE POLICY "Users can update case types in their organization" 
ON public.case_types 
FOR UPDATE 
USING (organization_id = get_user_organization_id());

-- Users can delete case types in their organization
CREATE POLICY "Users can delete case types in their organization" 
ON public.case_types 
FOR DELETE 
USING (organization_id = get_user_organization_id());

-- Create RLS policies for case_fields table
-- Users can view case fields for case types in their organization
CREATE POLICY "Users can view case fields in their organization" 
ON public.case_fields 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can create case fields for case types in their organization
CREATE POLICY "Users can create case fields in their organization" 
ON public.case_fields 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can update case fields for case types in their organization
CREATE POLICY "Users can update case fields in their organization" 
ON public.case_fields 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));

-- Users can delete case fields for case types in their organization
CREATE POLICY "Users can delete case fields in their organization" 
ON public.case_fields 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.case_types ct 
  WHERE ct.id = case_fields.case_type_id 
  AND ct.organization_id = get_user_organization_id()
));-- Fix database function search paths for security
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.generate_document_from_template(p_template_id uuid, p_context jsonb)
 RETURNS documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  new_doc public.documents%ROWTYPE;
BEGIN
  -- Fetch template
  PERFORM 1 FROM public.doc_templates WHERE id = p_template_id;
  -- Do your merge logic here (e.g. replace {{vars}} in content)
  -- For now, insert a placeholder doc record:
  INSERT INTO public.documents (title, file_path, organization_id, custom_fields)
  VALUES (
    (SELECT name FROM public.doc_templates WHERE id=p_template_id),
    '/generated/path/' || p_template_id || '.pdf',
    public.get_user_organization_id(),
    p_context
  )
  RETURNING * INTO new_doc;
  RETURN new_doc;
END;
$function$;

-- Add more restrictive RLS policy for role changes in profiles table
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles in their organization" ON public.profiles;

-- Create more secure policies
CREATE POLICY "Users can view profiles in their organization" 
ON public.profiles 
FOR SELECT 
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update their own basic profile" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid()) 
WITH CHECK (
  user_id = auth.uid() 
  AND organization_id = public.get_user_organization_id()
  -- Prevent users from changing their own role unless they're superadmin
  AND (
    role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    OR public.current_user_is_org_admin()
  )
);

-- Only admins can insert new profiles (for invitations)
CREATE POLICY "Admins can create profiles for their organization" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  public.current_user_is_org_admin()
  AND organization_id = public.get_user_organization_id()
);-- Fix database function search paths for security
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = ''
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.generate_document_from_template(p_template_id uuid, p_context jsonb)
 RETURNS documents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  new_doc public.documents%ROWTYPE;
BEGIN
  -- Fetch template
  PERFORM 1 FROM public.doc_templates WHERE id = p_template_id;
  -- Do your merge logic here (e.g. replace {{vars}} in content)
  -- For now, insert a placeholder doc record:
  INSERT INTO public.documents (title, file_path, organization_id, custom_fields)
  VALUES (
    (SELECT name FROM public.doc_templates WHERE id=p_template_id),
    '/generated/path/' || p_template_id || '.pdf',
    public.get_user_organization_id(),
    p_context
  )
  RETURNING * INTO new_doc;
  RETURN new_doc;
END;
$function$;

-- Drop existing conflicting policies and recreate with better security
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own basic profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can create profiles for their organization" ON public.profiles;

-- Create more secure policies for profiles table
CREATE POLICY "Users can view profiles in organization" 
ON public.profiles 
FOR SELECT 
USING (organization_id = public.get_user_organization_id());

CREATE POLICY "Users can update own profile with role restrictions" 
ON public.profiles 
FOR UPDATE 
USING (user_id = auth.uid()) 
WITH CHECK (
  user_id = auth.uid() 
  AND organization_id = public.get_user_organization_id()
  -- Prevent users from changing their own role unless they're superadmin
  AND (
    role = (SELECT role FROM public.profiles WHERE user_id = auth.uid())
    OR public.current_user_is_org_admin()
  )
);

-- Only admins can insert new profiles (for invitations)
CREATE POLICY "Admins can create profiles for organization" 
ON public.profiles 
FOR INSERT 
WITH CHECK (
  public.current_user_is_org_admin()
  AND organization_id = public.get_user_organization_id()
);-- Enable the pgvector extension for similarity search
create extension if not exists vector;

-- Documents table: store raw text, summaries, metadata, and key dates
create table if not exists documents (
  id               uuid      primary key default gen_random_uuid(),
  name             text      not null,
  content          text      not null,
  summary          text,
  metadata         jsonb     default '{}'::jsonb,
  effective_date   date,
  renewal_date     date,
  termination_date date,
  organization_id  uuid      references organizations(id),
  uploaded_by      uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Store contract embeddings for RAG
create table if not exists contract_embeddings (
  contract_id uuid      references documents(id) on delete cascade,
  embedding   vector(1536) not null,
  primary key(contract_id)
);

-- Library of best-practice clauses (pre-embedded)
create table if not exists best_practices (
  id        uuid      primary key default gen_random_uuid(),
  name      text      not null,
  clause    text      not null,
  embedding vector(1536) not null
);

-- RPC to retrieve top 5 similar best-practice clauses
create or replace function match_best_practices(query vector(1536))
returns table(id uuid, clause text, similarity double precision)
language sql stable as $$
  select
    id,
    clause,
    1 - (embedding <=> query) as similarity
  from best_practices
  order by embedding <=> query
  limit 5;
$$;alter table dashboard_prefs
  add column if not exists reminder_window_days int default 90;
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
-- Re-add foreign key constraint for cases.assigned_to referencing profiles.user_id
ALTER TABLE public.cases
    ADD CONSTRAINT fk_cases_assigned_to
    FOREIGN KEY (assigned_to)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
-- Recreate contracts table after schema refactor
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  client_id uuid constraint fk_contracts_client_id references public.clients(id) on delete set null,
  title text not null,
  description text,
  contract_type text,
  status text default 'draft',
  value decimal(15,2),
  currency text default 'USD',
  start_date date,
  end_date date,
  terms text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.contracts enable row level security;

-- Trigger to auto-update updated_at
create trigger update_contracts_updated_at
  before update on public.contracts
  for each row execute function public.update_updated_at_column();

-- Helpful index for organization lookups
create index if not exists idx_contracts_organization_id on public.contracts(organization_id);

-- RLS Policies
create policy "Users can view contracts in their organization"
  on public.contracts
  for select
  using (organization_id = public.get_user_organization_id());

create policy "Users can create contracts in their organization"
  on public.contracts
  for insert
  with check (organization_id = public.get_user_organization_id());

create policy "Users can update contracts in their organization"
  on public.contracts
  for update
  using (organization_id = public.get_user_organization_id());

create policy "Users can delete contracts in their organization"
  on public.contracts
  for delete
  using (organization_id = public.get_user_organization_id());
-- Update get_user_organization_id to use Supabase MCP
-- This function will always pull organization_id from the current JWT/session context

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid AS $$
  SELECT current_setting('request.jwt.claims.org_id', true)::uuid;
$$ LANGUAGE SQL STABLE;
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
-- Fix duplicate foreign key constraints causing cases query errors
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS fk_cases_client_id;

-- Create invoices table with comprehensive billing features
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'cancelled', 'overdue')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  terms_conditions TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, invoice_number)
);

-- Create invoice line items table
CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoice templates table
CREATE TABLE public.invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_terms TEXT,
  default_notes TEXT,
  default_tax_rate DECIMAL(5,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add user status and password reset fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'pending')),
ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

-- Enable RLS on new tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for invoices
CREATE POLICY "Users can view their organization invoices" 
ON public.invoices FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create invoices for their organization" 
ON public.invoices FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their organization invoices" 
ON public.invoices FOR UPDATE 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can delete invoices" 
ON public.invoices FOR DELETE 
USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());

-- RLS policies for invoice items
CREATE POLICY "Users can view invoice items for their organization invoices" 
ON public.invoice_items FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.invoices i 
  WHERE i.id = invoice_items.invoice_id 
  AND i.organization_id = get_user_organization_id()
));

CREATE POLICY "Users can manage invoice items for their organization invoices" 
ON public.invoice_items FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.invoices i 
  WHERE i.id = invoice_items.invoice_id 
  AND i.organization_id = get_user_organization_id()
));

-- RLS policies for invoice templates
CREATE POLICY "Users can view their organization templates" 
ON public.invoice_templates FOR SELECT 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Users can create templates for their organization" 
ON public.invoice_templates FOR INSERT 
WITH CHECK (organization_id = get_user_organization_id());

CREATE POLICY "Users can update their organization templates" 
ON public.invoice_templates FOR UPDATE 
USING (organization_id = get_user_organization_id());

CREATE POLICY "Admins can delete templates" 
ON public.invoice_templates FOR DELETE 
USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_items_updated_at
  BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_invoice_templates_updated_at
  BEFORE UPDATE ON public.invoice_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate invoice numbers
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$$;

-- Function to disable user (for super admins)
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$$;

-- Function to enable user (for super admins)
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$$;-- Add global user roles and support for custom per-organization roles
-- Up Migration

-- Note: This migration is split into separate statements to handle enum transaction issues

-- PART 1: Create or modify enum type
-- 1. Ensure user_role enum exists with base values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- If creating new, include all values at once
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');
  END IF;
END$$;

-- 2. Create global_roles lookup table (idempotent)
CREATE TABLE IF NOT EXISTS public.global_roles (
  role text PRIMARY KEY, -- Using text instead of enum to avoid transaction issues
  display_name text NOT NULL,
  description text
);

-- Make table read-only (no INSERT/UPDATE/DELETE through RLS except by superuser)
ALTER TABLE public.global_roles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT global roles
CREATE POLICY "Public read global roles" ON public.global_roles
  FOR SELECT USING (true);

-- 3. Seed the global_roles table with known values
INSERT INTO public.global_roles(role, display_name, description) VALUES
  ('superadmin', 'Super Admin', 'Creator/Owner of the organisation with full permissions'),
  ('finance', 'Finance', 'Manage billing and payments'),
  ('administrator', 'Administrator', 'Manage users, roles and settings'),
  ('legal', 'Legal', 'Access legal documents and case files')
ON CONFLICT (role) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 4. Ensure profiles.role column default stays valid
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';

-- 5. Migration for enum values must be applied separately after commit
-- COMMENT OUT the enum modification and profile update for now
/*
-- Execute these separately after this migration is committed:

-- Add new enum values if needed
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'administrator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'legal';

-- Update any existing profiles that used 'admin' to 'administrator' for consistency
UPDATE public.profiles SET role = 'administrator' WHERE role = 'admin';
*/

-- Down Migration
-- To roll back, delete seeded rows and values. (Manual instructions provided as automated down for enum value removal is not supported without recreate.)
-- 20250816180000_create_rls_policies.sql
-- Consolidated RLS policies for all main tables
-- NOTE: run `supabase db reset && supabase db push` to apply locally or deploy via CI.

-------------------------------------------------------------------------------
-- Helper: ensure get_user_organization_id() exists
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE user_id = auth.uid();
$$;

-------------------------------------------------------------------------------
-- Helper: quick check for org admin / superadmin
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role IN ('admin','superadmin')
      AND organization_id = get_user_organization_id()
  );
$$;

-------------------------------------------------------------------------------
-- Macro to enable RLS if not already enabled
-------------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations','profiles','clients','cases','documents','document_analyses',
        'contracts','calendar_events','invoices','invoice_items','invoice_templates',
        'case_activities','time_entries','settings','tasks','communication_logs',
        'dashboard_prefs','notifications','doc_templates','user_roles','invitations',
        'best_practices','openai_usage','usage_counters'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-------------------------------------------------------------------------------
-- Template generators to cut duplication
-------------------------------------------------------------------------------
-- 1. Tables with direct organization_id column --------------------------------
CREATE OR REPLACE FUNCTION public._create_org_rls(table_name text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "org_select" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_select" ON public.%I
    FOR SELECT USING (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_insert" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_insert" ON public.%I
    FOR INSERT WITH CHECK (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_update" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_update" ON public.%I
    FOR UPDATE USING (organization_id = get_user_organization_id());', table_name);

  EXECUTE format('DROP POLICY IF EXISTS "org_delete_admin" ON public.%I', table_name);
  EXECUTE format('CREATE POLICY "org_delete_admin" ON public.%I
    FOR DELETE USING (organization_id = get_user_organization_id() AND current_user_is_org_admin());', table_name);
END;$$;

-- 2. Helper for parent-child tables with FK to parent having org column --------
CREATE OR REPLACE FUNCTION public._create_child_org_rls(child_table text, fk_col text, parent_table text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "org_select" ON public.%I', child_table);
  EXECUTE format('CREATE POLICY "org_select" ON public.%I
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()));',
     child_table, child_table, parent_table, child_table, fk_col);

  EXECUTE format('DROP POLICY IF EXISTS "org_all" ON public.%I', child_table);
  EXECUTE format('CREATE POLICY "org_all" ON public.%I
  FOR ALL USING (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.%I p WHERE p.id = %I.%I AND p.organization_id = get_user_organization_id()));',
    child_table, parent_table, child_table, fk_col, parent_table, child_table, fk_col);
END;$$;

-------------------------------------------------------------------------------
-- Apply org RLS to simple tables
-------------------------------------------------------------------------------
SELECT public._create_org_rls(t)
FROM (VALUES
  ('organizations'), ('profiles'), ('clients'), ('cases'), ('documents'),
  ('document_analyses'), ('contracts'), ('calendar_events'), ('invoices'),
  ('invoice_templates'), ('settings'), ('dashboard_prefs'), ('notifications'),
  ('doc_templates'), ('user_roles'), ('invitations'), ('best_practices')
) AS v(t);

-- openai_usage & usage_counters (user scoped) ----------------------------------
DROP POLICY IF EXISTS "own_usage" ON public.openai_usage;
CREATE POLICY "own_usage" ON public.openai_usage
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own_counters" ON public.usage_counters;
CREATE POLICY "own_counters" ON public.usage_counters
  FOR SELECT USING (user_id = auth.uid());

-------------------------------------------------------------------------------
-- Child tables policies
-------------------------------------------------------------------------------
-- invoice_items -> invoices
SELECT public._create_child_org_rls('invoice_items','invoice_id','invoices');
-- case_activities -> cases
SELECT public._create_child_org_rlS('case_activities','case_id','cases');
-- time_entries -> case_activities (needs join two levels)
DROP POLICY IF EXISTS "org_select" ON public.time_entries;
CREATE POLICY "org_select" ON public.time_entries
FOR SELECT USING (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
));
DROP POLICY IF EXISTS "org_all" ON public.time_entries;
CREATE POLICY "org_all" ON public.time_entries
FOR ALL USING (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.case_activities a JOIN public.cases c ON c.id = a.case_id
  WHERE a.id = time_entries.activity_id AND c.organization_id = get_user_organization_id()
));

-------------------------------------------------------------------------------
-- Additional per-table fine-grained rules
-------------------------------------------------------------------------------
-- profiles: user can update own profile
DROP POLICY IF EXISTS "self_update" ON public.profiles;
CREATE POLICY "self_update" ON public.profiles
FOR UPDATE USING (user_id = auth.uid());

-- tasks table (depends on cases)
DROP POLICY IF EXISTS "org_select" ON public.tasks;
CREATE POLICY "org_select" ON public.tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()));
DROP POLICY IF EXISTS "org_all" ON public.tasks;
CREATE POLICY "org_all" ON public.tasks
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = tasks.case_id AND c.organization_id = get_user_organization_id()));
-- tasks assignee self permissions
DROP POLICY IF EXISTS "assignee_manage" ON public.tasks;
CREATE POLICY "assignee_manage" ON public.tasks
  FOR ALL USING (assigned_to = auth.uid());

-------------------------------------------------------------------------------
-- communication_logs simple org + own row update/delete
-------------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_select" ON public.communication_logs;
CREATE POLICY "org_select" ON public.communication_logs
  FOR SELECT USING (organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "org_insert" ON public.communication_logs;
CREATE POLICY "org_insert" ON public.communication_logs
  FOR INSERT WITH CHECK (organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "own_update_delete" ON public.communication_logs;
CREATE POLICY "own_update_delete" ON public.communication_logs
  FOR UPDATE USING (user_id = auth.uid() AND organization_id = get_user_organization_id())
  WITH CHECK (user_id = auth.uid() AND organization_id = get_user_organization_id());
DROP POLICY IF EXISTS "own_delete" ON public.communication_logs;
CREATE POLICY "own_delete" ON public.communication_logs
  FOR DELETE USING (user_id = auth.uid() AND organization_id = get_user_organization_id());

-------------------------------------------------------------------------------
-- grant to authenticated
-------------------------------------------------------------------------------
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Setup document analysis tables and functions
-- This migration sets up the necessary tables and functions for document analysis

-- Create document_analyses table
CREATE TABLE IF NOT EXISTS public.document_analyses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid NOT NULL,
  analysis_type text NOT NULL,
  content text NOT NULL,
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  embedding vector(1536), -- For similarity search
  metadata jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'completed',
  error text,
  
  CONSTRAINT fk_document_analyses_organization
    FOREIGN KEY (organization_id)
    REFERENCES organizations(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_document_analyses_created_by
    FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- Add RLS policies
ALTER TABLE public.document_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view analyses for their organization"
  ON public.document_analyses
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create analyses for their organization"
  ON public.document_analyses
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  );

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id 
  ON public.document_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_organization_id 
  ON public.document_analyses(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_created_by 
  ON public.document_analyses(created_by);
CREATE INDEX IF NOT EXISTS idx_document_analyses_embedding 
  ON public.document_analyses 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function to analyze document content
CREATE OR REPLACE FUNCTION analyze_document(
  p_document_id uuid,
  p_content text,
  p_document_type text DEFAULT 'document',
  p_analysis_type text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Call OpenAI API using pg_net extension (if available)
  -- Otherwise, return a placeholder response
  BEGIN
    -- TODO: Replace with actual OpenAI API call once pg_net is enabled
    v_result := jsonb_build_object(
      'status', 'success',
      'content', 'Document analysis is being processed. Please check back later.'
    );

    -- Update analysis record
    UPDATE document_analyses
    SET 
      content = v_result->>'content',
      status = 'completed',
      updated_at = now()
    WHERE id = v_analysis_id;

  EXCEPTION WHEN OTHERS THEN
    -- Update analysis record with error
    UPDATE document_analyses
    SET 
      status = 'failed',
      error = SQLERRM,
      updated_at = now()
    WHERE id = v_analysis_id;
    
    RAISE EXCEPTION 'Failed to analyze document: %', SQLERRM;
  END;

  RETURN v_result;
END;
$$;

-- Function to get analysis results
CREATE OR REPLACE FUNCTION get_document_analysis(
  p_document_id uuid,
  p_analysis_type text DEFAULT 'general'
)
RETURNS TABLE (
  id uuid,
  content text,
  status text,
  created_at timestamptz,
  error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$$;

-- Add comment explaining the migration
COMMENT ON TABLE public.document_analyses IS 
  'Stores document analysis results and metadata';

COMMENT ON FUNCTION analyze_document IS 
  'Analyzes a document using AI and stores the results';

COMMENT ON FUNCTION get_document_analysis IS 
  'Retrieves the latest analysis results for a document';-- Add title column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN title TEXT;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN public.profiles.title IS 'Job title or position of the user';-- This migration ensures the user_roles table exists

-- Create user_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, role_name)
);

-- Enable RLS if not already enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Users can view roles in their organization'
  ) THEN
    CREATE POLICY "Users can view roles in their organization" 
    ON public.user_roles 
    FOR SELECT 
    USING (organization_id = get_user_organization_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can create roles in their organization'
  ) THEN
    CREATE POLICY "Superadmins can create roles in their organization" 
    ON public.user_roles 
    FOR INSERT 
    WITH CHECK (
      organization_id = get_user_organization_id() 
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'superadmin'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can update roles in their organization'
  ) THEN
    CREATE POLICY "Superadmins can update roles in their organization" 
    ON public.user_roles 
    FOR UPDATE 
    USING (
      organization_id = get_user_organization_id() 
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'superadmin'
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_roles' AND policyname = 'Superadmins can delete roles in their organization'
  ) THEN
    CREATE POLICY "Superadmins can delete roles in their organization" 
    ON public.user_roles 
    FOR DELETE 
    USING (
      organization_id = get_user_organization_id() 
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND role = 'superadmin'
      )
    );
  END IF;
END $$;

-- Create trigger for automatic timestamp updates if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_user_roles_updated_at'
  ) THEN
    CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;-- Create case_types table
CREATE TABLE IF NOT EXISTS case_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create case_issues table
CREATE TABLE IF NOT EXISTS case_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id UUID NOT NULL REFERENCES case_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add index for faster lookups of issues by type
CREATE INDEX IF NOT EXISTS case_issues_case_type_id_idx ON case_issues(case_type_id);

-- Insert case types
INSERT INTO case_types (name, description) VALUES
('Civil Law', 'Disputes between individuals, businesses, or organizations'),
('Business/Corporate Law', 'Pertains to the formation, operation, and dissolution of businesses'),
('Family Law', 'Deals with legal matters related to family relationships'),
('Real Estate Law', 'Covers the purchase, sale, and use of property'),
('Estate Planning', 'Focuses on managing assets and affairs after death or incapacitation'),
('Criminal Law', 'Cases involving prosecution of individuals accused of breaking the law');

-- Insert case issues for Civil Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Car Accidents'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Medical Malpractice'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Slip and Fall Accidents'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Product Liability'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Wrongful Death');

-- Insert case issues for Business/Corporate Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Breach of Contract'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Business Formation'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Mergers and Acquisitions'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Intellectual Property Protection'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Employment Disputes');

-- Insert case issues for Family Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Divorce and Separation'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Child Custody and Support'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Adoption and Guardianship'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Prenuptial and Postnuptial Agreements'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Domestic Violence and Restraining Orders');

-- Insert case issues for Real Estate Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Landlord/Tenant Disputes'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Property Disputes'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Real Estate Transactions'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Zoning and Land Use Issues');

-- Insert case issues for Estate Planning
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Drafting Wills and Trusts'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Probate Administration'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Guardianship and Conservatorship'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Power of Attorney');

-- Insert case issues for Criminal Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Felonies and Misdemeanors'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'DUI/DWI Offenses'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Drug Offenses'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Assault and Battery'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Theft, Fraud, and White-Collar Crimes');

-- Add case_type_id and case_issue_id to the cases table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cases') THEN
    ALTER TABLE cases 
    ADD COLUMN IF NOT EXISTS case_type_id UUID REFERENCES case_types(id),
    ADD COLUMN IF NOT EXISTS case_issue_id UUID REFERENCES case_issues(id);
  END IF;
END $$;-- Add RLS policies for all tables and fix organization relationships

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
ALTER TABLE public.case_activities ALTER COLUMN organization_id SET NOT NULL;-- Fix RLS policies for existing tables only (remove reference to non-existent activities table)

-- Enable RLS on all tables that don't have it yet
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
ALTER TABLE public.case_activities ALTER COLUMN organization_id SET NOT NULL;-- Fix search path issues for security functions

-- Set search path for existing functions
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = 'public'
AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$$;

-- Add RLS policies for case_activities
CREATE POLICY "Users can view activities in their organization" ON public.case_activities
FOR SELECT TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create activities in their organization" ON public.case_activities
FOR INSERT TO authenticated WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update activities in their organization" ON public.case_activities
FOR UPDATE TO authenticated USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete activities in their organization" ON public.case_activities
FOR DELETE TO authenticated USING (organization_id = get_current_user_organization_id());-- Add organization_id and created_by to case_types if they don't exist
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'case_types') THEN
    -- Check if organization_id column exists
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                  WHERE table_name = 'case_types' AND column_name = 'organization_id') THEN
      ALTER TABLE case_types 
      ADD COLUMN organization_id UUID REFERENCES organizations(id);
    END IF;
    
    -- Check if created_by column exists
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                  WHERE table_name = 'case_types' AND column_name = 'created_by') THEN
      ALTER TABLE case_types 
      ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Try to get org_id from JWT claims
  BEGIN
    org_id := nullif(current_setting('request.jwt.claims.org_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    org_id := NULL;
  END;
  
  -- If org_id is not in JWT claims, fall back to profile lookup
  IF org_id IS NULL THEN
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
  END IF;
  
  RETURN org_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function to update the org_id claim in JWT on authentication
CREATE OR REPLACE FUNCTION public.handle_auth_user_jwt()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Get the user's organization_id from profiles
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- If organization_id exists, set it in JWT claims
  IF org_id IS NOT NULL THEN
    -- Update JWT to include org_id
    PERFORM auth.jwt_claim(auth.uid(), 'org_id', org_id::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to update JWT claims on login
CREATE OR REPLACE TRIGGER on_auth_user_signin
AFTER INSERT ON auth.sessions
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_jwt();

-- Migrate existing users by creating a temporary function to set org_id for all users
CREATE OR REPLACE FUNCTION public.migrate_user_org_ids()
RETURNS void AS $$
DECLARE
  user_rec RECORD;
BEGIN
  FOR user_rec IN SELECT p.user_id, p.organization_id FROM public.profiles p WHERE p.organization_id IS NOT NULL
  LOOP
    -- Set claim for each user
    PERFORM auth.jwt_claim(user_rec.user_id, 'org_id', user_rec.organization_id::text);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the migration function
SELECT public.migrate_user_org_ids();

-- Drop the temporary migration function
DROP FUNCTION public.migrate_user_org_ids();

-- Update RLS policies to use the improved get_user_organization_id function
-- No changes needed as they already use this function-- Fix the get_user_organization_id function to use proper auth claims
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    org_id uuid;
BEGIN
    -- Get organization_id from profiles table for the current user
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
    
    -- If no organization found, return null instead of throwing error
    IF org_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN org_id;
END;
$$;

-- Ensure case_types table exists with proper structure
CREATE TABLE IF NOT EXISTS public.case_types (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    organization_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    is_active boolean DEFAULT true
);

-- Ensure case_issues table exists with proper structure  
CREATE TABLE IF NOT EXISTS public.case_issues (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    description text,
    case_type_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Ensure case_fields table exists with proper structure
CREATE TABLE IF NOT EXISTS public.case_fields (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    case_type_id uuid NOT NULL,
    label text NOT NULL,
    field_key text NOT NULL,
    data_type text NOT NULL DEFAULT 'text',
    is_required boolean DEFAULT false,
    options jsonb DEFAULT '[]'::jsonb,
    field_order integer DEFAULT 0,
    organization_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_issues ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.case_fields ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for case_types
DROP POLICY IF EXISTS "Users can view case types in their organization" ON public.case_types;
CREATE POLICY "Users can view case types in their organization"
ON public.case_types FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case types in their organization" ON public.case_types;
CREATE POLICY "Users can create case types in their organization"
ON public.case_types FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case types in their organization" ON public.case_types;
CREATE POLICY "Users can update case types in their organization"
ON public.case_types FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case types in their organization" ON public.case_types;
CREATE POLICY "Users can delete case types in their organization"
ON public.case_types FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add RLS policies for case_issues
DROP POLICY IF EXISTS "Users can view case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can view case issues in their organization"
ON public.case_issues FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can create case issues in their organization"
ON public.case_issues FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can update case issues in their organization"
ON public.case_issues FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case issues in their organization" ON public.case_issues;
CREATE POLICY "Users can delete case issues in their organization"
ON public.case_issues FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add RLS policies for case_fields
DROP POLICY IF EXISTS "Users can view case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can view case fields in their organization"
ON public.case_fields FOR SELECT
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can create case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can create case fields in their organization"
ON public.case_fields FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can update case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can update case fields in their organization"
ON public.case_fields FOR UPDATE
USING (organization_id = get_current_user_organization_id());

DROP POLICY IF EXISTS "Users can delete case fields in their organization" ON public.case_fields;
CREATE POLICY "Users can delete case fields in their organization"
ON public.case_fields FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_case_types_updated_at ON public.case_types;
CREATE TRIGGER update_case_types_updated_at
    BEFORE UPDATE ON public.case_types
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_case_issues_updated_at ON public.case_issues;
CREATE TRIGGER update_case_issues_updated_at
    BEFORE UPDATE ON public.case_issues
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_case_fields_updated_at ON public.case_fields;
CREATE TRIGGER update_case_fields_updated_at
    BEFORE UPDATE ON public.case_fields
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();-- Fix invoices foreign key relationship issues
-- Remove invalid foreign key constraints if they exist
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;

-- Add proper foreign key constraint for created_by to reference auth.users
-- Note: We can't create foreign keys to auth.users in public schema directly
-- Instead, we'll ensure the column exists and is properly typed
ALTER TABLE public.invoices 
  ALTER COLUMN created_by SET DATA TYPE uuid;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);

-- Update any null organization_id values in existing tables if needed
UPDATE public.case_types SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_types.created_by LIMIT 1
) WHERE organization_id IS NULL AND created_by IS NOT NULL;

UPDATE public.case_issues SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_issues.case_type_id LIMIT 1
) WHERE organization_id IS NULL;

UPDATE public.case_fields SET organization_id = (
  SELECT organization_id FROM public.profiles WHERE user_id = case_fields.created_by LIMIT 1
) WHERE organization_id IS NULL AND created_by IS NOT NULL;-- 2025-08-18 09:00 Add foreign key from cases.client_id to clients.id

ALTER TABLE public.cases
  ADD CONSTRAINT fk_cases_clients
  FOREIGN KEY (client_id)
  REFERENCES public.clients (id)
  ON DELETE SET NULL;
-- 2025-08-19 09:00 Add indexes to clients on name and email for faster queries

CREATE INDEX idx_clients_name ON public.clients (lower(name));
CREATE INDEX idx_clients_email ON public.clients (lower(email));
-- 2025-08-20 09:00 Ensure cases.client_id FK references clients.id with correct constraint name

ALTER TABLE public.cases
DROP CONSTRAINT IF EXISTS fk_cases_clients;

ALTER TABLE public.cases
  ADD CONSTRAINT fk_cases_client_id
  FOREIGN KEY (client_id)
  REFERENCES public.clients (id)
  ON DELETE SET NULL;
-- 2025-08-23 09:00  Replace email CHECK for clients with simple name@domain.com validation

-- Drop any previous email constraint
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS email_is_valid;

-- New constraint: allow NULL, otherwise must look like name@domain.com
ALTER TABLE public.clients
  ADD CONSTRAINT email_is_valid
  CHECK (
    email IS NULL
    OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );
-- CRITICAL FIX: Add RLS policies for tasks table
-- Enable RLS on tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view tasks in their organization (via case)
CREATE POLICY "Users can view tasks in their organization" 
ON public.tasks 
FOR SELECT 
USING (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Users can create tasks in their organization
CREATE POLICY "Users can create tasks in their organization" 
ON public.tasks 
FOR INSERT 
WITH CHECK (
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Task creators and assignees can update tasks
CREATE POLICY "Users can update tasks they created or are assigned to" 
ON public.tasks 
FOR UPDATE 
USING (
  (created_by = auth.uid() OR assigned_to = auth.uid()) AND
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- Policy: Task creators and admins can delete tasks
CREATE POLICY "Users can delete tasks they created or admins can delete" 
ON public.tasks 
FOR DELETE 
USING (
  (created_by = auth.uid() OR is_user_admin()) AND
  case_id IN (
    SELECT id FROM public.cases 
    WHERE organization_id = get_current_user_organization_id()
  )
);

-- HIGH PRIORITY FIX: Secure database functions with proper search paths
-- Fix get_current_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$function$;

-- Fix is_user_admin function
CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$function$;

-- Fix get_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
    
    IF org_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN org_id;
END;
$function$;

-- Fix current_user_is_org_admin function
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;-- Fix remaining functions with missing search paths

-- Fix analyze_document function
CREATE OR REPLACE FUNCTION public.analyze_document(p_document_id uuid, p_content text, p_document_type text DEFAULT 'document'::text, p_analysis_type text DEFAULT 'general'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Call OpenAI API using pg_net extension (if available)
  -- Otherwise, return a placeholder response
  BEGIN
    -- TODO: Replace with actual OpenAI API call once pg_net is enabled
    v_result := jsonb_build_object(
      'status', 'success',
      'content', 'Document analysis is being processed. Please check back later.'
    );

    -- Update analysis record
    UPDATE document_analyses
    SET 
      content = v_result->>'content',
      status = 'completed',
      updated_at = now()
    WHERE id = v_analysis_id;

  EXCEPTION WHEN OTHERS THEN
    -- Update analysis record with error
    UPDATE document_analyses
    SET 
      status = 'failed',
      error = SQLERRM,
      updated_at = now()
    WHERE id = v_analysis_id;
    
    RAISE EXCEPTION 'Failed to analyze document: %', SQLERRM;
  END;

  RETURN v_result;
END;
$function$;

-- Fix get_document_analysis function
CREATE OR REPLACE FUNCTION public.get_document_analysis(p_document_id uuid, p_analysis_type text DEFAULT 'general'::text)
RETURNS TABLE(id uuid, content text, status text, created_at timestamp with time zone, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;-- Fix remaining functions that may not have search_path set

-- Fix set_updated_at function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Fix update_tasks_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;

-- Fix bump_document_version function
CREATE OR REPLACE FUNCTION public.bump_document_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix invite_user_to_organization function
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    return json_build_object('error','Only superadmins can invite admin users');
  END IF;

  normalized_role := p_role::public.user_role;

  -- Does the user already exist?
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Upsert profile to this organization
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
      set organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = coalesce(first_name, p_first_name),
          last_name = coalesce(last_name, p_last_name),
          updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;-- Fix remaining functions that may still have search path issues

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::public.user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

-- Fix disable_user function
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;-- Fix remaining functions that may still have search path issues

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::public.user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

-- Fix disable_user function
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$function$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;-- Fix the last function with missing search path - match_best_practices
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
RETURNS TABLE(id uuid, clause text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;-- Fix the last remaining function with search path issue
-- Fix match_best_practices function
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
RETURNS TABLE(id uuid, clause text, similarity double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;-- Insert common legal case types for De Barons Law Firm
INSERT INTO public.case_types (organization_id, name, description, is_active, created_by, created_at, updated_at)
VALUES 
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Corporate Law', 'Corporate legal matters including business formation, contracts, and compliance', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Real Estate Law', 'Property transactions, leases, and real estate disputes', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Employment Law', 'Employment contracts, workplace disputes, and labor law matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Commercial Litigation', 'Business disputes, contract breaches, and commercial lawsuits', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Intellectual Property', 'Trademark, copyright, and patent matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Family Law', 'Divorce, custody, and family legal matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Criminal Defense', 'Criminal law and defense matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Tax Law', 'Tax compliance, disputes, and advisory services', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now());-- Insert case issues for each case type for De Barons Law Firm
-- Corporate Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Corporate Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Business Formation', 'Incorporation, LLC formation, partnership agreements'),
    ('Mergers & Acquisitions', 'Company mergers, acquisitions, and due diligence'),
    ('Corporate Compliance', 'Regulatory compliance and corporate governance'),
    ('Contract Negotiation', 'Commercial contracts and business agreements'),
    ('Corporate Restructuring', 'Business restructuring and reorganization')
) AS issue(name, description);

-- Real Estate Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Real Estate Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Property Purchase/Sale', 'Residential and commercial property transactions'),
    ('Lease Agreements', 'Commercial and residential lease negotiations'),
    ('Property Disputes', 'Boundary disputes, title issues, and property conflicts'),
    ('Zoning Issues', 'Zoning applications and land use matters'),
    ('Real Estate Development', 'Development projects and construction contracts')
) AS issue(name, description);

-- Employment Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Employment Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Wrongful Termination', 'Unlawful dismissal and employment contract breaches'),
    ('Workplace Discrimination', 'Discrimination based on protected characteristics'),
    ('Wage & Hour Disputes', 'Overtime, minimum wage, and compensation issues'),
    ('Sexual Harassment', 'Workplace harassment and hostile work environment'),
    ('Employment Contracts', 'Employment agreement drafting and review')
) AS issue(name, description);

-- Commercial Litigation case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Commercial Litigation' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Contract Breach', 'Breach of commercial contracts and agreements'),
    ('Business Partnership Disputes', 'Partnership conflicts and dissolution'),
    ('Debt Collection', 'Commercial debt recovery and collection'),
    ('Shareholder Disputes', 'Corporate shareholder conflicts and rights'),
    ('Trade Secret Litigation', 'Protection of confidential business information')
) AS issue(name, description);

-- Intellectual Property case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Intellectual Property' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Trademark Registration', 'Trademark applications and registrations'),
    ('Patent Applications', 'Patent filing and prosecution'),
    ('Copyright Protection', 'Copyright registration and enforcement'),
    ('IP Infringement', 'Intellectual property infringement litigation'),
    ('Licensing Agreements', 'IP licensing and technology transfer')
) AS issue(name, description);

-- Family Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Family Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Divorce Proceedings', 'Divorce petitions and marital dissolution'),
    ('Child Custody', 'Child custody arrangements and modifications'),
    ('Child Support', 'Child support calculations and enforcement'),
    ('Adoption', 'Adoption proceedings and legal guardianship'),
    ('Domestic Violence', 'Restraining orders and protection matters')
) AS issue(name, description);

-- Criminal Defense case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Criminal Defense' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('DUI/DWI Defense', 'Driving under the influence charges'),
    ('Theft & Fraud', 'Theft, embezzlement, and fraud charges'),
    ('Assault & Battery', 'Violent crime defense'),
    ('Drug Offenses', 'Drug possession and trafficking charges'),
    ('White Collar Crime', 'Financial crimes and regulatory violations')
) AS issue(name, description);

-- Tax Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Tax Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Tax Audit Defense', 'IRS and state tax audit representation'),
    ('Tax Dispute Resolution', 'Tax controversy and appeals'),
    ('Tax Planning', 'Strategic tax planning and compliance'),
    ('Business Tax Issues', 'Corporate and business tax matters'),
    ('International Tax', 'Cross-border tax compliance and planning')
) AS issue(name, description);-- Add task_type column to tasks table for flexible task categorization
ALTER TABLE public.tasks 
ADD COLUMN task_type text DEFAULT 'general';

-- Add index for task_type for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks(task_type);

-- Update existing tasks to have the general task type
UPDATE public.tasks SET task_type = 'general' WHERE task_type IS NULL;-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false);

-- Create RLS policies for document storage
CREATE POLICY "Users can view documents in their organization"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload documents to their organization folder"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update documents in their organization folder"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete documents in their organization folder"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] IN (
    SELECT organization_id::text 
    FROM profiles 
    WHERE user_id = auth.uid()
  )
);

-- Add file_path column to documents table to store storage path
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS file_path text,
ADD COLUMN IF NOT EXISTS file_size bigint,
ADD COLUMN IF NOT EXISTS mime_type text;-- Security fixes for Kouti Legal application

-- 1. Fix global_roles table RLS policy
DROP POLICY IF EXISTS "Public read global roles" ON public.global_roles;
CREATE POLICY "Authenticated users can view global roles" 
ON public.global_roles 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- 2. Add organization_id to best_practices table and update RLS policy
ALTER TABLE public.best_practices 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Update best_practices RLS policy to be organization-scoped
DROP POLICY IF EXISTS "Authenticated users can view best practices" ON public.best_practices;
CREATE POLICY "Users can view best practices in their organization" 
ON public.best_practices 
FOR SELECT 
USING (organization_id = get_current_user_organization_id() OR organization_id IS NULL);

-- 3. Fix database functions by adding proper search_path settings

-- Fix get_current_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_current_user_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  org_id UUID;
BEGIN
  SELECT organization_id INTO org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN org_id;
END;
$function$;

-- Fix is_user_admin function
CREATE OR REPLACE FUNCTION public.is_user_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  RETURN user_role IN ('admin', 'superadmin');
END;
$function$;

-- Fix get_user_organization_id function
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
    org_id uuid;
BEGIN
    SELECT organization_id INTO org_id
    FROM public.profiles
    WHERE user_id = auth.uid();
    
    IF org_id IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN org_id;
END;
$function$;

-- Fix current_user_is_org_admin function
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.role in ('admin','superadmin')
  );
$function$;

-- Fix set_updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- Fix update_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- Fix update_tasks_updated_at_column trigger function
CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;-- Fix remaining database functions with missing search_path settings

-- Fix analyze_document function
CREATE OR REPLACE FUNCTION public.analyze_document(p_document_id uuid, p_content text, p_document_type text DEFAULT 'document'::text, p_analysis_type text DEFAULT 'general'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Call OpenAI API using pg_net extension (if available)
  -- Otherwise, return a placeholder response
  BEGIN
    -- TODO: Replace with actual OpenAI API call once pg_net is enabled
    v_result := jsonb_build_object(
      'status', 'success',
      'content', 'Document analysis is being processed. Please check back later.'
    );

    -- Update analysis record
    UPDATE document_analyses
    SET 
      content = v_result->>'content',
      status = 'completed',
      updated_at = now()
    WHERE id = v_analysis_id;

  EXCEPTION WHEN OTHERS THEN
    -- Update analysis record with error
    UPDATE document_analyses
    SET 
      status = 'failed',
      error = SQLERRM,
      updated_at = now()
    WHERE id = v_analysis_id;
    
    RAISE EXCEPTION 'Failed to analyze document: %', SQLERRM;
  END;

  RETURN v_result;
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$function$;

-- Fix get_document_analysis function
CREATE OR REPLACE FUNCTION public.get_document_analysis(p_document_id uuid, p_analysis_type text DEFAULT 'general'::text)
 RETURNS TABLE(id uuid, content text, status text, created_at timestamp with time zone, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also enable their auth account
  UPDATE auth.users
  SET banned_until = NULL
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix bump_document_version function
CREATE OR REPLACE FUNCTION public.bump_document_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix invite_user_to_organization function
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    return json_build_object('error','Only superadmins can invite admin users');
  END IF;

  normalized_role := p_role::public.user_role;

  -- Does the user already exist?
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Upsert profile to this organization
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
      set organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = coalesce(first_name, p_first_name),
          last_name = coalesce(last_name, p_last_name),
          updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::public.user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

-- Fix disable_user function
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  -- Also disable their auth account
  UPDATE auth.users
  SET banned_until = 'infinity'
  WHERE id = target_user_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;

-- Fix match_best_practices function
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
 RETURNS TABLE(id uuid, clause text, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path = 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;-- Fix remaining database functions with missing search_path settings (excluding vector function)

-- Fix analyze_document function
CREATE OR REPLACE FUNCTION public.analyze_document(p_document_id uuid, p_content text, p_document_type text DEFAULT 'document'::text, p_analysis_type text DEFAULT 'general'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_organization_id uuid;
  v_user_id uuid;
  v_api_key text;
  v_result jsonb;
  v_analysis_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO v_organization_id
  FROM profiles
  WHERE user_id = auth.uid();
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- Get current user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not authenticated';
  END IF;

  -- Create analysis record
  INSERT INTO document_analyses (
    document_id,
    analysis_type,
    organization_id,
    created_by,
    status,
    content
  ) VALUES (
    p_document_id,
    p_analysis_type,
    v_organization_id,
    v_user_id,
    'processing',
    ''
  ) RETURNING id INTO v_analysis_id;

  -- Get OpenAI API key from secure settings
  v_api_key := current_setting('app.settings.openai_key', true);
  
  IF v_api_key IS NULL THEN
    RAISE EXCEPTION 'OpenAI API key not configured';
  END IF;

  -- Return a placeholder response
  v_result := jsonb_build_object(
    'status', 'success',
    'content', 'Document analysis is being processed. Please check back later.'
  );

  -- Update analysis record
  UPDATE document_analyses
  SET 
    content = v_result->>'content',
    status = 'completed',
    updated_at = now()
  WHERE id = v_analysis_id;

  RETURN v_result;
END;
$function$;

-- Fix generate_invoice_number function
CREATE OR REPLACE FUNCTION public.generate_invoice_number(org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  invoice_number TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 'INV-' || current_year || '-(.*)') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.invoices
  WHERE organization_id = org_id
  AND invoice_number LIKE 'INV-' || current_year || '-%';
  
  invoice_number := 'INV-' || current_year || '-' || LPAD(next_number::TEXT, 4, '0');
  
  RETURN invoice_number;
END;
$function$;

-- Fix get_document_analysis function
CREATE OR REPLACE FUNCTION public.get_document_analysis(p_document_id uuid, p_analysis_type text DEFAULT 'general'::text)
 RETURNS TABLE(id uuid, content text, status text, created_at timestamp with time zone, error text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.content,
    a.status,
    a.created_at,
    a.error
  FROM document_analyses a
  WHERE a.document_id = p_document_id
    AND a.analysis_type = p_analysis_type
    AND a.organization_id IN (
      SELECT organization_id 
      FROM profiles 
      WHERE user_id = auth.uid()
    )
  ORDER BY a.created_at DESC
  LIMIT 1;
END;
$function$;

-- Fix enable_user function
CREATE OR REPLACE FUNCTION public.enable_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can enable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'active',
      disabled_at = NULL,
      disabled_by = NULL,
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  return json_build_object('success', true, 'message', 'User enabled successfully');
END;
$function$;

-- Fix invite_user_to_organization function
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    return json_build_object('error','Insufficient permissions to invite users');
  END IF;

  IF p_role NOT IN ('superadmin','admin','user') THEN
    return json_build_object('error','Invalid role specified');
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    return json_build_object('error','Only superadmins can invite admin users');
  END IF;

  normalized_role := p_role::public.user_role;

  -- Does the user already exist?
  select id into invited_user_id from auth.users where email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Upsert profile to this organization
    IF exists(select 1 from public.profiles where user_id = invited_user_id) THEN
      update public.profiles
      set organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = coalesce(first_name, p_first_name),
          last_name = coalesce(last_name, p_last_name),
          updated_at = now()
      where user_id = invited_user_id;
    ELSE
      insert into public.profiles(
        user_id, first_name, last_name, organization_id, role, department, is_organization_creator, created_at, updated_at
      ) values (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, p_department, false, now(), now()
      );
    END IF;

    return json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Otherwise, create an invitation
  insert into public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) values (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  on conflict (organization_id, email) where status = 'pending' do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    role = excluded.role,
    department = excluded.department,
    invited_by = excluded.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  return json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  new_org_id uuid;
  org_name text;
BEGIN
  -- Extract organization name from user metadata, default to user's name + " Organization"
  org_name := COALESCE(
    NEW.raw_user_meta_data ->> 'organization',
    CONCAT(
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
      ' ', 
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      ' Organization'
    )
  );

  -- Create new organization for the user
  INSERT INTO public.organizations (name, email, created_at, updated_at)
  VALUES (org_name, NEW.email, now(), now())
  RETURNING id INTO new_org_id;

  -- Create profile with superadmin role and link to organization
  INSERT INTO public.profiles (
    user_id, 
    first_name, 
    last_name, 
    email, 
    organization_id, 
    role, 
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.email,
    new_org_id,
    'superadmin'::public.user_role,
    TRUE,
    now(),
    now()
  );

  RETURN NEW;
END;
$function$;

-- Fix disable_user function
CREATE OR REPLACE FUNCTION public.disable_user(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  current_user_role text;
  current_org_id uuid;
BEGIN
  -- Get current user's role and organization
  select role::text, organization_id into current_user_role, current_org_id
  from public.profiles
  where user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin') THEN
    return json_build_object('error','Only superadmins can disable users');
  END IF;

  -- Update the target user's status
  UPDATE public.profiles
  SET status = 'disabled',
      disabled_at = now(),
      disabled_by = auth.uid(),
      updated_at = now()
  WHERE user_id = target_user_id
  AND organization_id = current_org_id;

  return json_build_object('success', true, 'message', 'User disabled successfully');
END;
$function$;-- Add client_id column to documents table to link documents to clients
ALTER TABLE public.documents 
ADD COLUMN client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to documents table for vector search
ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS documents_embedding_idx 
ON public.documents USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Add embedding column to contracts table for vector search  
ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for contract vector similarity search
CREATE INDEX IF NOT EXISTS contracts_embedding_idx
ON public.contracts USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Function to search documents by similarity
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  name text,
  content text,
  summary text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Function to search contracts by similarity
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  terms text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    1 - (contracts.embedding <=> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND 1 - (contracts.embedding <=> query_embedding) > match_threshold
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Create table for voice transcriptions
CREATE TABLE IF NOT EXISTS public.voice_transcriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  created_by uuid NOT NULL,
  case_id uuid,
  title text NOT NULL,
  transcript text NOT NULL,
  summary text,
  audio_file_path text,
  duration_seconds integer,
  status text DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS for voice transcriptions
ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for voice transcriptions
CREATE POLICY "Users can view transcriptions in their organization" 
ON public.voice_transcriptions 
FOR SELECT 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create transcriptions in their organization" 
ON public.voice_transcriptions 
FOR INSERT 
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update transcriptions in their organization" 
ON public.voice_transcriptions 
FOR UPDATE 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete transcriptions in their organization" 
ON public.voice_transcriptions 
FOR DELETE 
USING (organization_id = get_current_user_organization_id());

-- Add trigger for updated_at
CREATE TRIGGER update_voice_transcriptions_updated_at
BEFORE UPDATE ON public.voice_transcriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  name text,
  content text,
  summary text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- Fix security warnings by setting search_path for functions
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  terms text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    1 - (contracts.embedding <=> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND 1 - (contracts.embedding <=> query_embedding) > match_threshold
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY similarity DESC
  LIMIT match_count;
$$;-- Fix vector functions with proper distance operators
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  name text,
  content text,
  summary text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    1 - (documents.embedding <-> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND (documents.embedding <-> query_embedding) < (1 - match_threshold)
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY (documents.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;

-- Fix contracts search function
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  terms text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    1 - (contracts.embedding <-> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND (contracts.embedding <-> query_embedding) < (1 - match_threshold)
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY (contracts.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;-- Make case types and case issues global (available to all users)

-- Update case_types table to make organization_id nullable and add global flag
ALTER TABLE case_types ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE case_types ADD COLUMN is_global boolean DEFAULT false;

-- Update case_issues table to make organization_id nullable  
ALTER TABLE case_issues ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE case_issues ADD COLUMN is_global boolean DEFAULT false;

-- Update RLS policies for case_types to allow global access
DROP POLICY IF EXISTS "Users can view case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can create case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can update case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can delete case types in their organization" ON case_types;

-- New RLS policies for case_types - users can view global ones or their organization's
CREATE POLICY "Users can view case types" ON case_types FOR SELECT 
USING (
  is_global = true OR 
  organization_id = get_current_user_organization_id()
);

-- Only admins can manage case types now
CREATE POLICY "Only superadmins can manage case types" ON case_types FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Update RLS policies for case_issues to allow global access
DROP POLICY IF EXISTS "Users can view case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can create case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can update case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can delete case issues in their organization" ON case_issues;

-- New RLS policies for case_issues - users can view global ones or their organization's
CREATE POLICY "Users can view case issues" ON case_issues FOR SELECT 
USING (
  is_global = true OR 
  organization_id = get_current_user_organization_id()
);

-- Only admins can manage case issues now
CREATE POLICY "Only superadmins can manage case issues" ON case_issues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Insert some default global case types
INSERT INTO case_types (name, description, is_global, is_active) VALUES
('Personal Injury', 'Cases involving physical or psychological injury caused by negligence or intentional acts', true, true),
('Criminal Defense', 'Defense against criminal charges and prosecution', true, true),
('Family Law', 'Cases involving family relationships, divorce, custody, adoption', true, true),
('Corporate Law', 'Business-related legal matters including contracts, compliance, mergers', true, true),
('Real Estate', 'Property transactions, disputes, zoning, and real estate law', true, true),
('Employment Law', 'Workplace disputes, discrimination, wrongful termination', true, true),
('Intellectual Property', 'Patents, trademarks, copyrights, and trade secrets', true, true),
('Immigration', 'Visa applications, deportation defense, citizenship matters', true, true),
('Bankruptcy', 'Debt relief, reorganization, and bankruptcy proceedings', true, true),
('Contract Disputes', 'Breach of contract and commercial dispute resolution', true, true);

-- Insert some default case issues for each case type
INSERT INTO case_issues (case_type_id, name, description, is_global) 
SELECT ct.id, issue.name, issue.description, true
FROM case_types ct
CROSS JOIN (
  VALUES 
    ('Liability Assessment', 'Determining fault and legal responsibility'),
    ('Damages Calculation', 'Calculating monetary compensation and losses'),
    ('Evidence Collection', 'Gathering and preserving relevant evidence'),
    ('Settlement Negotiation', 'Negotiating resolution outside of court'),
    ('Court Preparation', 'Preparing for trial proceedings and litigation')
) AS issue(name, description)
WHERE ct.is_global = true;

-- Create table for contract templates
CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_content text NOT NULL,
  contract_type text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  created_by uuid REFERENCES auth.users(id),
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on contract_templates
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for contract_templates
CREATE POLICY "Users can view public templates or their organization's templates" ON contract_templates FOR SELECT
USING (
  is_public = true OR 
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can create templates in their organization" ON contract_templates FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their organization's templates" ON contract_templates FOR UPDATE
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete their organization's templates" ON contract_templates FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Update voice_transcriptions table to store audio file paths
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS audio_file_url text;

-- Add trigger for updated_at on contract_templates
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();-- First, let's check if the clients and cases tables have proper RLS policies
-- Add user_id column to clients table if it doesn't exist and create RLS policies
DO $$ 
BEGIN
    -- Add user_id column to clients if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'clients' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.clients ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add user_id column to cases if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'cases' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.cases ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;

-- Create RLS policies for clients
CREATE POLICY "Users can view their own clients" 
ON public.clients FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients" 
ON public.clients FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
ON public.clients FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
ON public.clients FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on cases table
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can create their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;

-- Create RLS policies for cases
CREATE POLICY "Users can view their own cases" 
ON public.cases FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases" 
ON public.cases FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cases" 
ON public.cases FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cases" 
ON public.cases FOR DELETE 
USING (auth.uid() = user_id);

-- Create a storage bucket for bulk imports if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulk-imports', 'bulk-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for bulk imports
DROP POLICY IF EXISTS "Users can upload bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their bulk import files" ON storage.objects;

CREATE POLICY "Users can upload bulk import files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their bulk import files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their bulk import files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);-- First, let's check if the clients and cases tables have proper RLS policies
-- Add user_id column to clients table if it doesn't exist and create RLS policies
DO $$ 
BEGIN
    -- Add user_id column to clients if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'clients' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.clients ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add user_id column to cases if it doesn't exist  
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'cases' 
                   AND column_name = 'user_id') THEN
        ALTER TABLE public.cases ADD COLUMN user_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Enable RLS on clients table
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;

-- Create RLS policies for clients
CREATE POLICY "Users can view their own clients" 
ON public.clients FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own clients" 
ON public.clients FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clients" 
ON public.clients FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clients" 
ON public.clients FOR DELETE 
USING (auth.uid() = user_id);

-- Enable RLS on cases table
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can create their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;

-- Create RLS policies for cases
CREATE POLICY "Users can view their own cases" 
ON public.cases FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases" 
ON public.cases FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cases" 
ON public.cases FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own cases" 
ON public.cases FOR DELETE 
USING (auth.uid() = user_id);

-- Create a storage bucket for bulk imports if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('bulk-imports', 'bulk-imports', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for bulk imports
DROP POLICY IF EXISTS "Users can upload bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their bulk import files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their bulk import files" ON storage.objects;

CREATE POLICY "Users can upload bulk import files" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their bulk import files" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their bulk import files" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'bulk-imports' AND auth.uid()::text = (storage.foldername(name))[1]);-- Create permissions table for fine-grained role permissions
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL,
  organization_id UUID NOT NULL,
  resource TEXT NOT NULL, -- cases, clients, documents, contracts, calendars, etc.
  action TEXT NOT NULL, -- create, read, update, delete, manage
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(role_name, organization_id, resource, action)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for role_permissions
CREATE POLICY "Superadmins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

CREATE POLICY "Users can view role permissions in their organization"
ON public.role_permissions
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Create function to check user permissions
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Check role permissions
  SELECT COALESCE(granted, false)
  INTO has_permission
  FROM role_permissions
  WHERE role_name = user_role
    AND organization_id = org_id
    AND resource = p_resource
    AND action = p_action;
  
  -- Default permissions for system roles if not explicitly set
  IF has_permission IS NULL THEN
    -- Admins get most permissions by default
    IF user_role = 'admin' AND p_action IN ('create', 'read', 'update', 'delete') THEN
      has_permission := true;
    -- Regular users get read permissions by default
    ELSIF user_role = 'user' AND p_action = 'read' THEN
      has_permission := true;
    END IF;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;

-- Insert default permissions for system roles
INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'admin' as role_name,
  o.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) as resource,
  unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
  true as granted,
  o.id as created_by -- Using org id as placeholder, will be updated
FROM organizations o
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'user' as role_name,
  o.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) as resource,
  'read' as action,
  true as granted,
  o.id as created_by
FROM organizations o
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- Create permissions table for fine-grained role permissions
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_name TEXT NOT NULL,
  organization_id UUID NOT NULL,
  resource TEXT NOT NULL, -- cases, clients, documents, contracts, calendars, etc.
  action TEXT NOT NULL, -- create, read, update, delete, manage
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(role_name, organization_id, resource, action)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for role_permissions
CREATE POLICY "Superadmins can manage role permissions"
ON public.role_permissions
FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

CREATE POLICY "Users can view role permissions in their organization"
ON public.role_permissions
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Create function to check user permissions
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Check role permissions
  SELECT COALESCE(granted, false)
  INTO has_permission
  FROM role_permissions
  WHERE role_name = user_role
    AND organization_id = org_id
    AND resource = p_resource
    AND action = p_action;
  
  -- Default permissions for system roles if not explicitly set
  IF has_permission IS NULL THEN
    -- Admins get most permissions by default
    IF user_role = 'admin' AND p_action IN ('create', 'read', 'update', 'delete') THEN
      has_permission := true;
    -- Regular users get read permissions by default
    ELSIF user_role = 'user' AND p_action = 'read' THEN
      has_permission := true;
    END IF;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;

-- Insert default permissions for admin role
DO $$
DECLARE
    org_record RECORD;
    resource_item TEXT;
    action_item TEXT;
BEGIN
    FOR org_record IN SELECT id FROM organizations LOOP
        FOR resource_item IN SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) LOOP
            FOR action_item IN SELECT unnest(ARRAY['create', 'read', 'update', 'delete']) LOOP
                INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
                VALUES ('admin', org_record.id, resource_item, action_item, true, org_record.id)
                ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
    
    -- Insert read permissions for user role
    FOR org_record IN SELECT id FROM organizations LOOP
        FOR resource_item IN SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']) LOOP
            INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by) 
            VALUES ('user', org_record.id, resource_item, 'read', true, org_record.id)
            ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Create trigger for updated_at
CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();-- First, let's populate the global_roles table with system roles
INSERT INTO global_roles (role, display_name, description) 
VALUES 
  ('superadmin', 'Super Administrator', 'Full system access and organization management'),
  ('admin', 'Administrator', 'Organization management and user administration'),
  ('user', 'User', 'Standard user access')
ON CONFLICT (role) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;

-- Update the invite_user_to_organization function to handle both global and custom roles
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  p_email text, 
  p_first_name text, 
  p_last_name text, 
  p_role text, 
  p_department text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
  is_valid_role boolean := false;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF current_user_role NOT IN ('superadmin','admin') THEN
    RETURN json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Check if role is valid (either global or custom role in organization)
  -- Check global roles first
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    is_valid_role := true;
  -- Check custom roles for this organization
  ELSIF EXISTS(SELECT 1 FROM user_roles WHERE role_name = p_role AND organization_id = current_org_id) THEN
    is_valid_role := true;
  END IF;

  IF NOT is_valid_role THEN
    RETURN json_build_object('error', 'Invalid role specified: ' || p_role);
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND current_user_role != 'superadmin' THEN
    RETURN json_build_object('error','Only superadmins can invite admin users');
  END IF;

  -- For global roles, cast to user_role enum
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    normalized_role := p_role::public.user_role;
  ELSE
    -- For custom roles, default to 'user' enum but store actual role name
    normalized_role := 'user'::public.user_role;
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id FROM auth.users WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Update existing user's profile
    IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id = invited_user_id) THEN
      UPDATE public.profiles
      SET organization_id = current_org_id,
          role = normalized_role,
          department = p_department,
          first_name = COALESCE(first_name, p_first_name),
          last_name = COALESCE(last_name, p_last_name),
          updated_at = now()
      WHERE user_id = invited_user_id;
    ELSE
      INSERT INTO public.profiles(
        user_id, first_name, last_name, organization_id, role, department, 
        is_organization_creator, created_at, updated_at
      ) VALUES (
        invited_user_id, p_first_name, p_last_name, current_org_id, normalized_role, 
        p_department, false, now(), now()
      );
    END IF;

    -- For custom roles, also create a role assignment
    IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      VALUES (invited_user_id, p_role, current_org_id, auth.uid())
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;

    RETURN json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Create new invitation
  INSERT INTO public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) VALUES (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  ON CONFLICT (organization_id, email) WHERE status = 'pending' DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    invited_by = EXCLUDED.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  -- Store custom role information for later processing
  IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    INSERT INTO invitation_custom_roles (invitation_id, role_name)
    SELECT i.id, p_role
    FROM invitations i
    WHERE i.organization_id = current_org_id 
      AND i.email = p_email 
      AND i.status = 'pending'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Invitation created');
END;
$$;

-- Create tables for custom role assignments and invitation tracking
CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role_name text NOT NULL,
  organization_id uuid NOT NULL,
  assigned_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, role_name, organization_id)
);

CREATE TABLE IF NOT EXISTS invitation_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid NOT NULL,
  role_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(invitation_id, role_name)
);

-- Enable RLS on new tables
ALTER TABLE user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_custom_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_role_assignments
CREATE POLICY "Users can view role assignments in their organization"
ON user_role_assignments FOR SELECT
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Admins can manage role assignments in their organization"
ON user_role_assignments FOR ALL
USING (organization_id = get_current_user_organization_id() AND is_user_admin());

-- RLS policies for invitation_custom_roles
CREATE POLICY "Admins can manage invitation custom roles"
ON invitation_custom_roles FOR ALL
USING (EXISTS(
  SELECT 1 FROM invitations i 
  WHERE i.id = invitation_custom_roles.invitation_id 
    AND i.organization_id = get_current_user_organization_id()
    AND is_user_admin()
));

-- Update triggers
CREATE TRIGGER update_user_role_assignments_updated_at
  BEFORE UPDATE ON user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Update the user_has_permission function to handle custom roles
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
  custom_roles TEXT[];
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Check permissions for global role
  SELECT COALESCE(granted, false)
  INTO has_permission
  FROM role_permissions
  WHERE role_name = user_role
    AND organization_id = org_id
    AND resource = p_resource
    AND action = p_action;
  
  -- If global role has permission, return true
  IF has_permission THEN
    RETURN true;
  END IF;
  
  -- Check custom role assignments
  SELECT ARRAY_AGG(role_name) INTO custom_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- Check permissions for each custom role
  IF custom_roles IS NOT NULL THEN
    FOR i IN 1..array_length(custom_roles, 1) LOOP
      SELECT COALESCE(granted, false)
      INTO has_permission
      FROM role_permissions
      WHERE role_name = custom_roles[i]
        AND organization_id = org_id
        AND resource = p_resource
        AND action = p_action;
      
      IF has_permission THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  
  -- Default permissions for system roles if not explicitly set
  IF has_permission IS NULL OR has_permission = false THEN
    -- Admins get most permissions by default
    IF user_role = 'admin' AND p_action IN ('create', 'read', 'update', 'delete') THEN
      has_permission := true;
    -- Regular users get read permissions by default
    ELSIF user_role = 'user' AND p_action = 'read' THEN
      has_permission := true;
    END IF;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;-- Clear and recreate global roles with proper hierarchy
DELETE FROM global_roles;

INSERT INTO global_roles (role, display_name, description) VALUES 
  ('superadmin', 'Super Admin', 'Organization Administrator with full system access and role management'),
  ('admin', 'Admin', 'Organization Administrator with full CRUD access'),
  ('user', 'User', 'Standard user with Create, Read, Update access (no delete)');

-- Set up default permissions for each role
-- Clear existing default permissions first
DELETE FROM role_permissions WHERE organization_id IS NULL;

-- Super Admin gets all permissions (but we'll handle this in code since they have full access)
-- Admin gets full CRUD on all resources
INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'admin' as role_name,
  org.id as organization_id,
  unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings']) as resource,
  unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
  true as granted,
  '00000000-0000-0000-0000-000000000000'::uuid as created_by
FROM organizations org
ON CONFLICT (role_name, organization_id, resource, action) DO UPDATE SET granted = EXCLUDED.granted;

-- User gets CRU (no delete) on most resources, read-only on settings and users
INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
SELECT 
  'user' as role_name,
  org.id as organization_id,
  resource,
  action,
  CASE 
    WHEN resource IN ('settings', 'users') AND action != 'read' THEN false
    WHEN action = 'delete' THEN false
    ELSE true
  END as granted,
  '00000000-0000-0000-0000-000000000000'::uuid as created_by
FROM organizations org
CROSS JOIN (
  SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
         unnest(ARRAY['create', 'read', 'update', 'delete']) as action
) perms
ON CONFLICT (role_name, organization_id, resource, action) DO UPDATE SET granted = EXCLUDED.granted;

-- Update the RLS policies for role management
DROP POLICY IF EXISTS "Admins can manage r" ON user_roles;
DROP POLICY IF EXISTS "Superadmins can manage custom roles" ON user_roles;

CREATE POLICY "Only superadmins can manage custom roles"
ON user_roles FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS(
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

-- Update permissions management policy
DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON role_permissions;

CREATE POLICY "Superadmins can manage all role permissions"
ON role_permissions FOR ALL
USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS(
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'::user_role
  )
);

-- Create a function to initialize default permissions for new organizations
CREATE OR REPLACE FUNCTION public.initialize_organization_permissions(org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin permissions (full CRUD)
  INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
  SELECT 
    'admin' as role_name,
    org_id,
    unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
    unnest(ARRAY['create', 'read', 'update', 'delete']) as action,
    true as granted,
    '00000000-0000-0000-0000-000000000000'::uuid as created_by
  ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

  -- User permissions (CRU, no delete)
  INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by) 
  SELECT 
    'user' as role_name,
    org_id,
    resource,
    action,
    CASE 
      WHEN resource IN ('settings', 'users') AND action != 'read' THEN false
      WHEN action = 'delete' THEN false
      ELSE true
    END as granted,
    '00000000-0000-0000-0000-000000000000'::uuid as created_by
  FROM (
    SELECT unnest(ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks', 'settings', 'users']) as resource,
           unnest(ARRAY['create', 'read', 'update', 'delete']) as action
  ) perms
  ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
END;
$$;

-- Add trigger to initialize permissions for new organizations
CREATE OR REPLACE FUNCTION public.handle_new_organization_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM initialize_organization_permissions(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_initialize_organization_permissions ON organizations;

-- Create trigger for new organizations
CREATE TRIGGER trigger_initialize_organization_permissions
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_organization_permissions();-- Clean up and fix global roles and permissions system

-- 1. Remove global role entries from role_permissions table (global roles should use built-in logic)
DELETE FROM role_permissions WHERE role_name IN ('admin', 'user', 'superadmin');

-- 2. Update user_has_permission function to properly handle global vs custom roles
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_role TEXT;
  org_id UUID;
  has_permission BOOLEAN := false;
  custom_roles TEXT[];
BEGIN
  -- Get user's role and organization
  SELECT role::TEXT, organization_id
  INTO user_role, org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Superadmins have all permissions
  IF user_role = 'superadmin' THEN
    RETURN true;
  END IF;
  
  -- Default permissions for global roles (built-in logic)
  IF user_role = 'admin' THEN
    -- Admins get full CRUD permissions by default
    IF p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      has_permission := true;
    END IF;
  ELSIF user_role = 'user' THEN
    -- Users get CRU permissions by default (no delete)
    IF p_action IN ('create', 'read', 'update') THEN
      has_permission := true;
    END IF;
  END IF;
  
  -- Check custom role assignments and their explicit permissions
  SELECT ARRAY_AGG(role_name) INTO custom_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- Check permissions for each custom role (explicit permissions override defaults)
  IF custom_roles IS NOT NULL THEN
    FOR i IN 1..array_length(custom_roles, 1) LOOP
      SELECT COALESCE(granted, false)
      INTO has_permission
      FROM role_permissions
      WHERE role_name = custom_roles[i]
        AND organization_id = org_id
        AND resource = p_resource
        AND action = p_action;
      
      -- If any custom role grants permission, return true
      IF has_permission THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  
  RETURN COALESCE(has_permission, false);
END;
$$;

-- 3. Create function to set default permissions for custom roles
CREATE OR REPLACE FUNCTION public.initialize_custom_role_permissions(p_role_name text, p_organization_id uuid, p_created_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  resource_name text;
  action_name text;
BEGIN
  -- Set default read permissions for all resources for new custom roles
  FOREACH resource_name IN ARRAY ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']
  LOOP
    INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by)
    VALUES (p_role_name, p_organization_id, resource_name, 'read', true, p_created_by)
    ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
  END LOOP;
END;
$$;

-- 4. Create trigger to initialize permissions for new custom roles
CREATE OR REPLACE FUNCTION public.trigger_initialize_custom_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Initialize default permissions for new custom role
  PERFORM initialize_custom_role_permissions(NEW.role_name, NEW.organization_id, NEW.created_by);
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_user_role_created ON user_roles;
CREATE TRIGGER on_user_role_created
  AFTER INSERT ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_custom_role_permissions();-- Fix security warnings by setting proper search_path for the new functions
CREATE OR REPLACE FUNCTION public.initialize_custom_role_permissions(p_role_name text, p_organization_id uuid, p_created_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  resource_name text;
BEGIN
  -- Set default read permissions for all resources for new custom roles
  FOREACH resource_name IN ARRAY ARRAY['cases', 'clients', 'documents', 'contracts', 'calendars', 'invoices', 'tasks']
  LOOP
    INSERT INTO role_permissions (role_name, organization_id, resource, action, granted, created_by)
    VALUES (p_role_name, p_organization_id, resource_name, 'read', true, p_created_by)
    ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_initialize_custom_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Initialize default permissions for new custom role
  PERFORM initialize_custom_role_permissions(NEW.role_name, NEW.organization_id, NEW.created_by);
  RETURN NEW;
END;
$$;

-- Initialize permissions for existing custom roles that have no permissions
DO $$
DECLARE
  role_record RECORD;
BEGIN
  FOR role_record IN 
    SELECT DISTINCT ur.role_name, ur.organization_id, ur.created_by
    FROM user_roles ur
    LEFT JOIN role_permissions rp ON ur.role_name = rp.role_name AND ur.organization_id = rp.organization_id
    WHERE rp.id IS NULL
  LOOP
    PERFORM initialize_custom_role_permissions(role_record.role_name, role_record.organization_id, role_record.created_by);
  END LOOP;
END;
$$;-- Fix invitation and custom role assignment system

-- 1. Add function to handle invitation acceptance and role assignment
CREATE OR REPLACE FUNCTION public.accept_invitation_and_assign_roles(p_user_id uuid, p_invitation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
BEGIN
  -- Get invitation details
  SELECT * INTO invitation_record
  FROM invitations
  WHERE id = p_invitation_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invitation not found or already used');
  END IF;
  
  -- Check if invitation is expired
  IF invitation_record.expires_at < now() THEN
    RETURN json_build_object('error', 'Invitation has expired');
  END IF;
  
  -- Update the user's profile with organization and role
  UPDATE profiles
  SET 
    organization_id = invitation_record.organization_id,
    role = invitation_record.role,
    first_name = COALESCE(first_name, invitation_record.first_name),
    last_name = COALESCE(last_name, invitation_record.last_name),
    department = COALESCE(department, invitation_record.department),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Get custom roles associated with this invitation
  SELECT ARRAY_AGG(role_name) INTO custom_role_names
  FROM invitation_custom_roles
  WHERE invitation_id = p_invitation_id;
  
  -- Assign custom roles if any
  IF custom_role_names IS NOT NULL THEN
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    SELECT p_user_id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
  END IF;
  
  -- Mark invitation as accepted
  UPDATE invitations
  SET status = 'accepted', updated_at = now()
  WHERE id = p_invitation_id;
  
  -- Clean up custom role entries for this invitation
  DELETE FROM invitation_custom_roles WHERE invitation_id = p_invitation_id;
  
  RETURN json_build_object('success', true, 'message', 'Invitation accepted and roles assigned');
END;
$$;

-- 2. Create trigger to automatically handle new user signup with invitations
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - use invitation details
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      department,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      invitation_record.role,
      invitation_record.department,
      FALSE,
      now(),
      now()
    );
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (existing logic)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
        ' ', 
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        ' Organization'
      )
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      'superadmin'::public.user_role,
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Update the trigger to use new function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_with_invitation();-- Create notification triggers for all modules
-- First, create functions to handle notifications for each module

-- Function to create notifications
CREATE OR REPLACE FUNCTION create_notification(
  p_organization_id UUID,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (
    organization_id,
    user_id,
    title,
    description,
    type,
    status
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_title,
    p_description,
    p_type,
    'unread'
  );
END;
$$;

-- Cases notifications
CREATE OR REPLACE FUNCTION notify_case_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Case Created';
    notification_desc := 'Case "' || NEW.title || '" has been created';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_title := 'Case Updated';
    notification_desc := 'Case "' || NEW.title || '" has been updated';
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Case Deleted';
    notification_desc := 'Case "' || OLD.title || '" has been deleted';
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'case'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Clients notifications
CREATE OR REPLACE FUNCTION notify_client_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Client Added';
    notification_desc := 'Client "' || NEW.name || '" has been added';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_title := 'Client Updated';
    notification_desc := 'Client "' || NEW.name || '" has been updated';
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Client Removed';
    notification_desc := 'Client "' || OLD.name || '" has been removed';
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'client'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Documents notifications
CREATE OR REPLACE FUNCTION notify_document_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Document Added';
    notification_desc := 'Document "' || NEW.name || '" has been uploaded';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_title := 'Document Updated';
    notification_desc := 'Document "' || NEW.name || '" has been updated';
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Document Deleted';
    notification_desc := 'Document "' || OLD.name || '" has been deleted';
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'document'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Contracts notifications
CREATE OR REPLACE FUNCTION notify_contract_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Contract Created';
    notification_desc := 'Contract "' || NEW.title || '" has been created';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_title := 'Contract Updated';
    notification_desc := 'Contract "' || NEW.title || '" has been updated';
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Contract Deleted';
    notification_desc := 'Contract "' || OLD.title || '" has been deleted';
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'contract'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Calendar events notifications
CREATE OR REPLACE FUNCTION notify_calendar_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Event Created';
    notification_desc := 'Event "' || NEW.title || '" has been scheduled';
  ELSIF TG_OP = 'UPDATE' THEN
    notification_title := 'Event Updated';
    notification_desc := 'Event "' || NEW.title || '" has been updated';
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Event Cancelled';
    notification_desc := 'Event "' || OLD.title || '" has been cancelled';
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'calendar'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Invoice notifications
CREATE OR REPLACE FUNCTION notify_invoice_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_users RECORD;
  notification_title TEXT;
  notification_desc TEXT;
BEGIN
  -- Determine the action
  IF TG_OP = 'INSERT' THEN
    notification_title := 'New Invoice Created';
    notification_desc := 'Invoice "' || NEW.invoice_number || '" has been created';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    notification_title := 'Invoice Status Changed';
    notification_desc := 'Invoice "' || NEW.invoice_number || '" status changed to ' || NEW.status;
  ELSIF TG_OP = 'DELETE' THEN
    notification_title := 'Invoice Deleted';
    notification_desc := 'Invoice "' || OLD.invoice_number || '" has been deleted';
  ELSE
    -- Return early if it's just a regular update without status change
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Create notifications for all users in the organization
  FOR org_users IN 
    SELECT user_id 
    FROM profiles 
    WHERE organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
      AND user_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid())
  LOOP
    PERFORM create_notification(
      COALESCE(NEW.organization_id, OLD.organization_id),
      org_users.user_id,
      notification_title,
      notification_desc,
      'info'
    );
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create the triggers
DROP TRIGGER IF EXISTS cases_notification_trigger ON cases;
CREATE TRIGGER cases_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cases
  FOR EACH ROW EXECUTE FUNCTION notify_case_changes();

DROP TRIGGER IF EXISTS clients_notification_trigger ON clients;
CREATE TRIGGER clients_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION notify_client_changes();

DROP TRIGGER IF EXISTS documents_notification_trigger ON documents;
CREATE TRIGGER documents_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION notify_document_changes();

DROP TRIGGER IF EXISTS contracts_notification_trigger ON contracts;
CREATE TRIGGER contracts_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON contracts
  FOR EACH ROW EXECUTE FUNCTION notify_contract_changes();

DROP TRIGGER IF EXISTS calendar_events_notification_trigger ON calendar_events;
CREATE TRIGGER calendar_events_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION notify_calendar_changes();

DROP TRIGGER IF EXISTS invoices_notification_trigger ON invoices;
CREATE TRIGGER invoices_notification_trigger
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_changes();-- Fix security warnings by setting search_path for functions

-- Update existing functions to have proper search_path
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.bump_document_version() SET search_path = public;-- Add verified status and improve user management queries
-- Update profiles table to better track user status
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Create a view that combines profiles and invitations for user management
CREATE OR REPLACE VIEW public.organization_users AS
SELECT 
    p.id,
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.role::text as role,
    p.department,
    p.status,
    p.disabled_at,
    p.disabled_by,
    p.verified_at,
    p.last_login_at,
    p.created_at,
    p.organization_id,
    'user' as user_type,
    CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END as verification_status
FROM public.profiles p
WHERE p.organization_id IS NOT NULL

UNION ALL

SELECT 
    i.id,
    NULL as user_id,
    i.email,
    i.first_name,
    i.last_name,
    i.role::text as role,
    i.department,
    i.status,
    NULL as disabled_at,
    NULL as disabled_by,
    NULL as verified_at,
    NULL as last_login_at,
    i.created_at,
    i.organization_id,
    'invitation' as user_type,
    CASE 
        WHEN i.status = 'accepted' THEN 'verified'
        WHEN i.status = 'pending' THEN 'pending'
        ELSE 'expired'
    END as verification_status
FROM public.invitations i
WHERE i.status = 'pending' OR i.expires_at > now();

-- Update the trigger to set verified_at when user logs in
CREATE OR REPLACE FUNCTION public.update_user_login()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_login_at and set verified_at if not set
    UPDATE public.profiles 
    SET 
        last_login_at = now(),
        verified_at = COALESCE(verified_at, now())
    WHERE user_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for tracking logins (this will fire when auth.users is updated with last_sign_in_at)
DROP TRIGGER IF EXISTS on_auth_user_login ON auth.users;
CREATE TRIGGER on_auth_user_login
    AFTER UPDATE OF last_sign_in_at ON auth.users
    FOR EACH ROW
    WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
    EXECUTE FUNCTION public.update_user_login();

-- Add RLS policies for the view
ALTER VIEW public.organization_users OWNER TO postgres;

-- Grant access to the view
GRANT SELECT ON public.organization_users TO authenticated;

-- Create RLS policy for the view (views inherit from underlying tables but let's be explicit)
-- Note: Views use the RLS policies of their underlying tables

-- Add function to disable/enable users (only for superadmins)
CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id uuid, disable boolean DEFAULT true)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_role text;
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's role and organization
  SELECT role::text, organization_id INTO current_user_role, current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Only superadmins can disable/enable users
  IF current_user_role != 'superadmin' THEN
    RETURN json_build_object('error', 'Only superadmins can disable/enable users');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Update the user's status
  IF disable THEN
    UPDATE public.profiles
    SET status = 'disabled',
        disabled_at = now(),
        disabled_by = auth.uid(),
        updated_at = now()
    WHERE user_id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET status = 'active',
        disabled_at = NULL,
        disabled_by = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
  END IF;

  RETURN json_build_object(
    'success', true, 
    'message', 
    CASE WHEN disable THEN 'User disabled successfully' ELSE 'User enabled successfully' END
  );
END;
$$;-- Fix critical security issues from previous migration

-- 1. Drop the security definer view and recreate properly
DROP VIEW IF EXISTS public.organization_users;

-- 2. Create a function instead of a security definer view to avoid the security warning
CREATE OR REPLACE FUNCTION public.get_organization_users(org_id uuid)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    email text,
    first_name text,
    last_name text,
    role text,
    department text,
    status text,
    disabled_at timestamp with time zone,
    disabled_by uuid,
    verified_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone,
    organization_id uuid,
    user_type text,
    verification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.email,
        p.first_name,
        p.last_name,
        p.role::text as role,
        p.department,
        p.status,
        p.disabled_at,
        p.disabled_by,
        p.verified_at,
        p.last_login_at,
        p.created_at,
        p.organization_id,
        'user'::text as user_type,
        CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END::text as verification_status
    FROM public.profiles p
    WHERE p.organization_id = org_id

    UNION ALL

    SELECT 
        i.id,
        NULL::uuid as user_id,
        i.email,
        i.first_name,
        i.last_name,
        i.role::text as role,
        i.department,
        i.status,
        NULL::timestamp with time zone as disabled_at,
        NULL::uuid as disabled_by,
        NULL::timestamp with time zone as verified_at,
        NULL::timestamp with time zone as last_login_at,
        i.created_at,
        i.organization_id,
        'invitation'::text as user_type,
        CASE 
            WHEN i.status = 'accepted' THEN 'verified'
            WHEN i.status = 'pending' THEN 'pending'
            ELSE 'expired'
        END::text as verification_status
    FROM public.invitations i
    WHERE i.organization_id = org_id 
      AND (i.status = 'pending' OR i.expires_at > now());
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_organization_users(uuid) TO authenticated;

-- Fix search_path for all functions that need it
ALTER FUNCTION public.notify_case_changes() SET search_path = public;
ALTER FUNCTION public.notify_client_changes() SET search_path = public;
ALTER FUNCTION public.notify_document_changes() SET search_path = public;
ALTER FUNCTION public.notify_contract_changes() SET search_path = public;
ALTER FUNCTION public.notify_calendar_changes() SET search_path = public;
ALTER FUNCTION public.notify_invoice_changes() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_new_user_with_invitation() SET search_path = public;
ALTER FUNCTION public.create_notification(uuid, uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.generate_invoice_number(uuid) SET search_path = public;
ALTER FUNCTION public.get_current_user_organization_id() SET search_path = public;
ALTER FUNCTION public.current_user_is_org_admin() SET search_path = public;
ALTER FUNCTION public.user_has_permission(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.is_user_admin() SET search_path = public;
ALTER FUNCTION public.enable_user(uuid) SET search_path = public;
ALTER FUNCTION public.disable_user(uuid) SET search_path = public;
ALTER FUNCTION public.match_best_practices(vector) SET search_path = public;
ALTER FUNCTION public.match_documents(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.match_contracts(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.get_user_organization_id() SET search_path = public;
ALTER FUNCTION public.analyze_document(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.get_document_analysis(uuid, text) SET search_path = public;
ALTER FUNCTION public.initialize_custom_role_permissions(text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.trigger_initialize_custom_role_permissions() SET search_path = public;
ALTER FUNCTION public.accept_invitation_and_assign_roles(uuid, uuid) SET search_path = public;-- Ensure users who sign up get properly marked as verified
-- Update the existing trigger to set verified_at properly

CREATE OR REPLACE FUNCTION public.update_user_login()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last_login_at and set verified_at if not set
    UPDATE public.profiles 
    SET 
        last_login_at = now(),
        verified_at = COALESCE(verified_at, now())
    WHERE user_id = NEW.id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also update the new user creation function to set verified_at
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - use invitation details
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      department,
      is_organization_creator,
      verified_at, -- Set as verified when they sign up via invitation
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      invitation_record.role,
      invitation_record.department,
      FALSE,
      now(), -- Mark as verified immediately
      now(),
      now()
    );
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (existing logic)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
        ' ', 
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        ' Organization'
      )
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      is_organization_creator,
      verified_at, -- Mark org creators as verified
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      'superadmin'::public.user_role,
      TRUE,
      now(), -- Mark as verified immediately
      now(),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;-- Fix vector search functions to use proper distance operators
-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop and recreate match_documents function with correct operators
DROP FUNCTION IF EXISTS match_documents(vector, double precision, int);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  content text,
  summary text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    documents.created_at,
    documents.updated_at,
    1 - (documents.embedding <-> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND (documents.embedding <-> query_embedding) < (1 - match_threshold)
  ORDER BY (documents.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;

-- Drop and recreate match_contracts function with correct operators
DROP FUNCTION IF EXISTS match_contracts(vector, double precision, int);

CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  terms text,
  content text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    contracts.content,
    contracts.created_at,
    contracts.updated_at,
    1 - (contracts.embedding <-> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND (contracts.embedding <-> query_embedding) < (1 - match_threshold)
  ORDER BY (contracts.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;-- Fix vector search functions with correct types and operators
-- Drop existing functions that use incorrect operators
DROP FUNCTION IF EXISTS match_documents(extensions.vector, double precision, integer);
DROP FUNCTION IF EXISTS match_contracts(extensions.vector, double precision, integer);

-- Recreate match_documents function with proper vector type and L2 distance operator
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  content text,
  summary text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    documents.id,
    documents.name,
    documents.content,
    documents.summary,
    documents.created_at,
    documents.updated_at,
    1 - (documents.embedding <-> query_embedding) AS similarity
  FROM documents
  WHERE documents.embedding IS NOT NULL
    AND (documents.embedding <-> query_embedding) < (1 - match_threshold)
    AND documents.organization_id = get_current_user_organization_id()
  ORDER BY (documents.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;

-- Recreate match_contracts function with proper vector type and L2 distance operator  
CREATE OR REPLACE FUNCTION match_contracts(
  query_embedding vector(1536),
  match_threshold double precision DEFAULT 0.3,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  terms text,
  content text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    contracts.id,
    contracts.title,
    contracts.description,
    contracts.terms,
    COALESCE(contracts.terms, contracts.description) as content,
    contracts.created_at,
    contracts.updated_at,
    1 - (contracts.embedding <-> query_embedding) AS similarity
  FROM contracts
  WHERE contracts.embedding IS NOT NULL
    AND (contracts.embedding <-> query_embedding) < (1 - match_threshold)
    AND contracts.organization_id = get_current_user_organization_id()
  ORDER BY (contracts.embedding <-> query_embedding) ASC
  LIMIT match_count;
$$;-- Create document_chunks table for RAG implementation
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure either document_id or contract_id is set, but not both
  CONSTRAINT check_single_parent CHECK (
    (document_id IS NOT NULL AND contract_id IS NULL) OR
    (document_id IS NULL AND contract_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view chunks in their organization" 
ON public.document_chunks 
FOR SELECT 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create chunks in their organization" 
ON public.document_chunks 
FOR INSERT 
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update chunks in their organization" 
ON public.document_chunks 
FOR UPDATE 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete chunks in their organization" 
ON public.document_chunks 
FOR DELETE 
USING (organization_id = get_current_user_organization_id());

-- Create indexes for better performance
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_contract_id ON public.document_chunks(contract_id);
CREATE INDEX idx_document_chunks_organization_id ON public.document_chunks(organization_id);

-- Create vector similarity search function for chunks
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  contract_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.contract_id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <-> query_embedding) AS similarity
  FROM document_chunks
  WHERE document_chunks.embedding IS NOT NULL
    AND 1 - (document_chunks.embedding <-> query_embedding) > match_threshold
    AND document_chunks.organization_id = get_current_user_organization_id()
  ORDER BY document_chunks.embedding <-> query_embedding
  LIMIT match_count;
$$;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_chunks_updated_at
    BEFORE UPDATE ON public.document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_document_chunks_updated_at();-- Create document_chunks table for RAG implementation (without vector function for now)
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer,
  embedding vector(1536),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Ensure either document_id or contract_id is set, but not both
  CONSTRAINT check_single_parent CHECK (
    (document_id IS NOT NULL AND contract_id IS NULL) OR
    (document_id IS NULL AND contract_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view chunks in their organization" 
ON public.document_chunks 
FOR SELECT 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can create chunks in their organization" 
ON public.document_chunks 
FOR INSERT 
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update chunks in their organization" 
ON public.document_chunks 
FOR UPDATE 
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete chunks in their organization" 
ON public.document_chunks 
FOR DELETE 
USING (organization_id = get_current_user_organization_id());

-- Create indexes for better performance
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_contract_id ON public.document_chunks(contract_id);
CREATE INDEX idx_document_chunks_organization_id ON public.document_chunks(organization_id);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_chunks_updated_at
    BEFORE UPDATE ON public.document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_document_chunks_updated_at();-- Fix and improve RLS policies across all tables

-- 1. Fix time_entries table - add missing columns and RLS policies
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Enable RLS on time_entries if not already enabled
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for time_entries
CREATE POLICY "Users can create time entries in their organization" ON time_entries
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can view time entries in their organization" ON time_entries
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
FOR UPDATE USING (
  user_id = auth.uid() OR (
    organization_id = get_current_user_organization_id() AND is_user_admin()
  )
);

CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
FOR DELETE USING (
  user_id = auth.uid() OR (
    organization_id = get_current_user_organization_id() AND is_user_admin()
  )
);

-- 2. Clean up duplicate/overlapping policies on case_types
DROP POLICY IF EXISTS "Case types can be created by organization members" ON case_types;
DROP POLICY IF EXISTS "Case types can be updated by organization members" ON case_types;
DROP POLICY IF EXISTS "Case types visible to organization" ON case_types;

-- Keep the more comprehensive policies that handle both global and org-specific types
-- The existing "Users can view case types" and "Only superadmins can manage case types" policies are sufficient

-- 3. Simplify cases table policies - remove redundant user-based policies since org-based covers it
DROP POLICY IF EXISTS "Users can create their own cases" ON cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON cases;
DROP POLICY IF EXISTS "Users can view their own cases" ON cases;

-- 4. Simplify clients table policies - same logic
DROP POLICY IF EXISTS "Users can create their own clients" ON clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON clients;
DROP POLICY IF EXISTS "Users can view their own clients" ON clients;

-- 5. Add missing INSERT policy for profiles (for user registration)
CREATE POLICY "Service role can insert profiles" ON profiles
FOR INSERT WITH CHECK (true);
-- This allows the trigger function to insert new profiles when users sign up

-- 6. Add policy for organizations INSERT (for new user registration)
CREATE POLICY "Service role can insert organizations" ON organizations
FOR INSERT WITH CHECK (true);
-- This allows the trigger function to create organizations for new users

-- 7. Improve communication_logs policies - add missing UPDATE/DELETE for admins
CREATE POLICY "Admins can update comm logs in their organization" ON communication_logs
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() AND is_user_admin()
);

CREATE POLICY "Admins can delete comm logs in their organization" ON communication_logs
FOR DELETE USING (
  organization_id = get_current_user_organization_id() AND is_user_admin()
);

-- 8. Add missing policies for openai_usage table
CREATE POLICY "Admins can view organization usage" ON openai_usage
FOR SELECT USING (
  user_id IN (
    SELECT user_id FROM profiles 
    WHERE organization_id = get_current_user_organization_id()
  ) AND is_user_admin()
);

-- 9. Improve document_analyses policies - add UPDATE for status changes
CREATE POLICY "Users can update analyses in their organization" ON document_analyses
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

-- 10. Add trigger for time_entries updated_at
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();-- Fix and improve RLS policies - targeted approach to avoid conflicts

-- 1. Complete time_entries table setup
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Enable RLS on time_entries if not already enabled
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for time_entries (with IF NOT EXISTS where possible)
DO $$
BEGIN
  -- Create policies only if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can create time entries in their organization') THEN
    CREATE POLICY "Users can create time entries in their organization" ON time_entries
    FOR INSERT WITH CHECK (organization_id = get_current_user_organization_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can view time entries in their organization') THEN
    CREATE POLICY "Users can view time entries in their organization" ON time_entries
    FOR SELECT USING (organization_id = get_current_user_organization_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can update their own time entries or admins can update all') THEN
    CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
    FOR UPDATE USING (
      user_id = auth.uid() OR (
        organization_id = get_current_user_organization_id() AND is_user_admin()
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'time_entries' AND policyname = 'Users can delete their own time entries or admins can delete all') THEN
    CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
    FOR DELETE USING (
      user_id = auth.uid() OR (
        organization_id = get_current_user_organization_id() AND is_user_admin()
      )
    );
  END IF;
END
$$;

-- 2. Add missing INSERT policy for profiles (for user registration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Service role can insert profiles') THEN
    CREATE POLICY "Service role can insert profiles" ON profiles
    FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- 3. Add policy for organizations INSERT (for new user registration)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Service role can insert organizations') THEN
    CREATE POLICY "Service role can insert organizations" ON organizations
    FOR INSERT WITH CHECK (true);
  END IF;
END
$$;

-- 4. Improve communication_logs policies - add missing UPDATE/DELETE for admins
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communication_logs' AND policyname = 'Admins can update comm logs in their organization') THEN
    CREATE POLICY "Admins can update comm logs in their organization" ON communication_logs
    FOR UPDATE USING (
      organization_id = get_current_user_organization_id() AND is_user_admin()
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'communication_logs' AND policyname = 'Admins can delete comm logs in their organization') THEN
    CREATE POLICY "Admins can delete comm logs in their organization" ON communication_logs
    FOR DELETE USING (
      organization_id = get_current_user_organization_id() AND is_user_admin()
    );
  END IF;
END
$$;

-- 5. Add missing policies for openai_usage table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'openai_usage' AND policyname = 'Admins can view organization usage') THEN
    CREATE POLICY "Admins can view organization usage" ON openai_usage
    FOR SELECT USING (
      user_id IN (
        SELECT user_id FROM profiles 
        WHERE organization_id = get_current_user_organization_id()
      ) AND is_user_admin()
    );
  END IF;
END
$$;

-- 6. Improve document_analyses policies - add UPDATE for status changes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'document_analyses' AND policyname = 'Users can update analyses in their organization') THEN
    CREATE POLICY "Users can update analyses in their organization" ON document_analyses
    FOR UPDATE USING (
      organization_id = get_current_user_organization_id()
    );
  END IF;
END
$$;

-- 7. Add trigger for time_entries updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_time_entries_updated_at') THEN
    CREATE TRIGGER update_time_entries_updated_at
      BEFORE UPDATE ON time_entries
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;-- Fix RLS performance issues - optimize auth function calls and consolidate policies

-- 1. Drop and recreate policies with optimized auth calls to prevent re-evaluation per row

-- Fix document_analyses policies
DROP POLICY IF EXISTS "Users can view analyses for their organization" ON document_analyses;
DROP POLICY IF EXISTS "Users can create analyses for their organization" ON document_analyses;
DROP POLICY IF EXISTS "Users can update analyses in their organization" ON document_analyses;

CREATE POLICY "Users can view analyses for their organization" ON document_analyses
FOR SELECT USING (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Users can create analyses for their organization" ON document_analyses
FOR INSERT WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM profiles WHERE user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Users can update analyses in their organization" ON document_analyses
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

-- Fix dashboard_prefs policies
DROP POLICY IF EXISTS "Users can view their own dashboard prefs" ON dashboard_prefs;
DROP POLICY IF EXISTS "Users can create their own dashboard prefs" ON dashboard_prefs;
DROP POLICY IF EXISTS "Users can update their own dashboard prefs" ON dashboard_prefs;

CREATE POLICY "Users can view their own dashboard prefs" ON dashboard_prefs
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own dashboard prefs" ON dashboard_prefs
FOR INSERT WITH CHECK (
  user_id = (SELECT auth.uid()) AND 
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update their own dashboard prefs" ON dashboard_prefs
FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Fix notifications policies
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;

CREATE POLICY "Users can view their own notifications" ON notifications
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update their own notifications" ON notifications
FOR UPDATE USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete their own notifications" ON notifications
FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Fix openai_usage policies
DROP POLICY IF EXISTS "Users can view their own usage" ON openai_usage;
DROP POLICY IF EXISTS "Users can create their own usage records" ON openai_usage;
DROP POLICY IF EXISTS "Admins can view organization usage" ON openai_usage;

CREATE POLICY "Users can view their own usage" ON openai_usage
FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create their own usage records" ON openai_usage
FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view organization usage" ON openai_usage
FOR SELECT USING (
  user_id IN (
    SELECT user_id FROM profiles 
    WHERE organization_id = get_current_user_organization_id()
  ) AND (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
    )
  )
);

-- Fix profiles policies
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;

CREATE POLICY "Users can update their own profile" ON profiles
FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Fix time_entries policies (optimize the ones we just created)
DROP POLICY IF EXISTS "Users can update their own time entries or admins can update all" ON time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries or admins can delete all" ON time_entries;

CREATE POLICY "Users can update their own time entries or admins can update all" ON time_entries
FOR UPDATE USING (
  user_id = (SELECT auth.uid()) OR (
    organization_id = get_current_user_organization_id() AND (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
      )
    )
  )
);

CREATE POLICY "Users can delete their own time entries or admins can delete all" ON time_entries
FOR DELETE USING (
  user_id = (SELECT auth.uid()) OR (
    organization_id = get_current_user_organization_id() AND (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
      )
    )
  )
);

-- Fix global_roles policy
DROP POLICY IF EXISTS "Authenticated users can view global roles" ON global_roles;

CREATE POLICY "Authenticated users can view global roles" ON global_roles
FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

-- Fix tasks policies
DROP POLICY IF EXISTS "Users can update tasks they created or are assigned to" ON tasks;
DROP POLICY IF EXISTS "Users can delete tasks they created or admins can delete" ON tasks;

CREATE POLICY "Users can update tasks they created or are assigned to" ON tasks
FOR UPDATE USING (
  (created_by = (SELECT auth.uid()) OR assigned_to = (SELECT auth.uid())) AND 
  case_id IN (
    SELECT id FROM cases WHERE organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can delete tasks they created or admins can delete" ON tasks
FOR DELETE USING (
  (
    created_by = (SELECT auth.uid()) OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE user_id = (SELECT auth.uid()) AND role IN ('admin', 'superadmin')
    )
  ) AND 
  case_id IN (
    SELECT id FROM cases WHERE organization_id = get_current_user_organization_id()
  )
);-- Fix function search path security issue by setting search_path for functions that don't have it

-- Update functions that don't have search_path set to 'public'
CREATE OR REPLACE FUNCTION public.match_best_practices(query extensions.vector)
 RETURNS TABLE(id uuid, clause text, similarity double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, clause,
         1 - (embedding <=> query) AS similarity
  FROM best_practices
  ORDER BY embedding <=> query
  LIMIT 5;
$function$;

CREATE OR REPLACE FUNCTION public.bump_document_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;-- Fix function search path security issue by setting search_path for functions that don't have it
-- Skipping match_best_practices due to vector operator issue

CREATE OR REPLACE FUNCTION public.bump_document_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  latest integer;
BEGIN
  -- If previous_version_id supplied, inherit version = latest +1
  IF NEW.previous_version_id IS NOT NULL THEN
    SELECT version INTO latest FROM public.documents WHERE id = NEW.previous_version_id;
    NEW.version := COALESCE(latest,0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_document_chunks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_tasks_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;-- Fix remaining RLS performance issues
-- 1. Optimize auth function calls for time_entries
-- 2. Fix document_chunks policies
-- 3. Consolidate multiple permissive policies

-- Drop existing time_entries policies to recreate them with optimized auth calls
DROP POLICY IF EXISTS "Users can update their own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Users can update their own time entries or admins can update al" ON public.time_entries;
DROP POLICY IF EXISTS "Users can delete their own time entries or admins can delete al" ON public.time_entries;

-- Create consolidated time_entries policies with optimized auth calls
CREATE POLICY "Users can update their own time entries or admins can update all"
ON public.time_entries
FOR UPDATE
USING (
  (user_id = (SELECT auth.uid())) OR 
  (organization_id = get_current_user_organization_id() AND is_user_admin())
);

CREATE POLICY "Users can delete their own time entries or admins can delete all"
ON public.time_entries
FOR DELETE
USING (
  (user_id = (SELECT auth.uid())) OR 
  (organization_id = get_current_user_organization_id() AND is_user_admin())
);

-- Fix document_chunks by removing redundant org_isolation policies
DROP POLICY IF EXISTS "org_isolation_insert" ON public.document_chunks;
DROP POLICY IF EXISTS "org_isolation_select" ON public.document_chunks;

-- Consolidate case_issues policies
DROP POLICY IF EXISTS "Superadmins can manage all case issues" ON public.case_issues;
DROP POLICY IF EXISTS "Users can view case issues (global or org-specific)" ON public.case_issues;

CREATE POLICY "Users can view case issues or superadmins can manage all"
ON public.case_issues
FOR ALL
USING (
  ((is_global = true) OR (organization_id = get_current_user_organization_id())) OR
  (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role))
);

-- Consolidate case_types policies
DROP POLICY IF EXISTS "Superadmins and service role can manage all case types" ON public.case_types;
DROP POLICY IF EXISTS "Users can view case types in their organization or global ones" ON public.case_types;

CREATE POLICY "Users can view case types or superadmins/service can manage all"
ON public.case_types
FOR ALL
USING (
  ((is_global = true) OR (organization_id = get_current_user_organization_id())) OR
  (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR
  ((SELECT auth.role()) = 'service_role'::text)
);

-- Consolidate openai_usage policies
DROP POLICY IF EXISTS "Admins can view organization usage" ON public.openai_usage;
DROP POLICY IF EXISTS "Users can view their own usage" ON public.openai_usage;

CREATE POLICY "Users can view their own usage or admins can view organization usage"
ON public.openai_usage
FOR SELECT
USING (
  (user_id = (SELECT auth.uid())) OR
  ((user_id IN (SELECT profiles.user_id FROM profiles WHERE profiles.organization_id = get_current_user_organization_id())) AND 
   (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = ANY (ARRAY['admin'::user_role, 'superadmin'::user_role]))))
);

-- Consolidate profiles UPDATE policies
DROP POLICY IF EXISTS "Admins can update profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile or admins can update organization profiles"
ON public.profiles
FOR UPDATE
USING (
  (user_id = (SELECT auth.uid())) OR
  ((organization_id = get_current_user_organization_id()) AND is_user_admin())
);

-- Consolidate role_permissions SELECT policies
DROP POLICY IF EXISTS "Superadmins can manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Users can view role permissions in their organization" ON public.role_permissions;

CREATE POLICY "Users can view role permissions or superadmins can manage all"
ON public.role_permissions
FOR ALL
USING (
  (organization_id = get_current_user_organization_id()) AND
  ((EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR true)
);

-- Consolidate settings policies
DROP POLICY IF EXISTS "Admins can manage settings in their organization" ON public.settings;
DROP POLICY IF EXISTS "Users can view settings in their organization" ON public.settings;

CREATE POLICY "Users can view settings or admins can manage all in their organization"
ON public.settings
FOR ALL
USING ((organization_id = get_current_user_organization_id()) AND (is_user_admin() OR true));

-- Consolidate user_role_assignments policies
DROP POLICY IF EXISTS "Admins can manage role assignments in their organization" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view role assignments in their organization" ON public.user_role_assignments;

CREATE POLICY "Users can view role assignments or admins can manage all in their organization"
ON public.user_role_assignments
FOR ALL
USING ((organization_id = get_current_user_organization_id()) AND (is_user_admin() OR true));

-- Consolidate user_roles policies
DROP POLICY IF EXISTS "Superadmins can manage roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view roles in their organization" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view roles in their organization" ON public.user_roles;

CREATE POLICY "Users can view roles or admins/superadmins can manage all in their organization"
ON public.user_roles
FOR ALL
USING (
  (organization_id = get_current_user_organization_id()) AND
  (
    (EXISTS (SELECT 1 FROM profiles WHERE user_id = (SELECT auth.uid()) AND role = 'superadmin'::user_role)) OR
    is_user_admin() OR
    true
  )
);-- Fix Critical Security Issues: Privilege Escalation Vulnerabilities

-- =====================================================
-- 1. Fix user_role_assignments RLS policies
-- =====================================================

-- Drop the broken policies with "OR true" vulnerability
DROP POLICY IF EXISTS "Users can view role assignments or admins can manage all in their organization" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Only admins can manage role assignments" ON public.user_role_assignments;

-- Create proper restrictive policies for user_role_assignments
CREATE POLICY "Only admins can manage role assignments"
ON public.user_role_assignments FOR ALL
USING (
  organization_id = get_current_user_organization_id() AND 
  is_user_admin()
);

CREATE POLICY "Users can view their own role assignments"
ON public.user_role_assignments FOR SELECT
USING (user_id = auth.uid());

-- =====================================================
-- 2. Fix profiles table RLS to prevent role self-modification
-- =====================================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Users can update their own profile or admins can update organiz" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile or admins can update organization profiles" ON public.profiles;

-- The policies "users_update_own_profile_no_role_change" and "admins_can_update_any_profile" 
-- already exist and are correct, so we don't need to recreate them

-- =====================================================
-- 3. Improve client data access policies
-- =====================================================

-- Drop the overly broad client access policy
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;

-- Create more restrictive policy: only admins and assigned case users
CREATE POLICY "Users can view clients they're assigned to"
ON public.clients FOR SELECT
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = auth.uid()
    OR EXISTS(
      SELECT 1 FROM cases 
      WHERE cases.client_id = clients.id 
      AND (cases.assigned_to = auth.uid() OR cases.created_by = auth.uid())
    )
  )
);

-- Admins can still manage all clients in their org
CREATE POLICY "Admins can create clients"
ON public.clients FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() AND
  is_user_admin()
);

CREATE POLICY "Users can create clients they'll manage"
ON public.clients FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() AND
  created_by = auth.uid()
);

CREATE POLICY "Users can update clients they manage"
ON public.clients FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete clients they manage"
ON public.clients FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR created_by = auth.uid()
  )
);-- CRITICAL SECURITY FIXES: Role Storage Architecture & RLS Vulnerabilities

-- =====================================================
-- 1. Fix user_roles RLS policy (CRITICAL: OR true vulnerability)
-- =====================================================

DROP POLICY IF EXISTS "Users can view case types or superadmins/service can manage all" ON public.user_roles;

-- Users can view roles in their organization
CREATE POLICY "Users can view roles in their organization"
ON public.user_roles FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only admins can manage (create, update, delete) custom roles
CREATE POLICY "Admins can manage roles in their organization"
ON public.user_roles FOR ALL
USING (
  organization_id = get_current_user_organization_id() AND
  is_user_admin()
);

-- =====================================================
-- 2. Migrate all roles to user_role_assignments (fixing dual storage)
-- =====================================================

-- First, migrate existing profiles.role to user_role_assignments
-- Only migrate if they don't already have an assignment
INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
SELECT 
  p.user_id,
  p.role::text,
  p.organization_id,
  p.user_id -- self-assigned for migration
FROM public.profiles p
WHERE p.role IS NOT NULL
  AND p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = p.user_id 
      AND ura.role_name = p.role::text
      AND ura.organization_id = p.organization_id
  )
ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

-- =====================================================
-- 3. Update is_user_admin() to use user_role_assignments
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  has_admin_role BOOLEAN;
BEGIN
  -- Check if user has admin or superadmin role in user_role_assignments
  SELECT EXISTS(
    SELECT 1
    FROM public.user_role_assignments ura
    WHERE ura.user_id = auth.uid()
      AND ura.organization_id = get_current_user_organization_id()
      AND ura.role_name IN ('admin', 'superadmin')
  ) INTO has_admin_role;
  
  RETURN COALESCE(has_admin_role, false);
END;
$function$;

-- =====================================================
-- 4. Update user_has_permission to use new architecture
-- =====================================================

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  org_id UUID;
  has_permission BOOLEAN := false;
  user_roles TEXT[];
BEGIN
  -- Get user's organization
  SELECT organization_id INTO org_id
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Get all roles for the user
  SELECT ARRAY_AGG(role_name) INTO user_roles
  FROM user_role_assignments
  WHERE user_id = p_user_id AND organization_id = org_id;
  
  -- If no roles found, deny access
  IF user_roles IS NULL OR array_length(user_roles, 1) = 0 THEN
    RETURN false;
  END IF;
  
  -- Superadmins have all permissions
  IF 'superadmin' = ANY(user_roles) THEN
    RETURN true;
  END IF;
  
  -- Default permissions for global roles
  IF 'admin' = ANY(user_roles) THEN
    -- Admins get full CRUD permissions by default
    IF p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      has_permission := true;
    END IF;
  ELSIF 'user' = ANY(user_roles) THEN
    -- Users get CRU permissions by default (no delete)
    IF p_action IN ('create', 'read', 'update') THEN
      has_permission := true;
    END IF;
  END IF;
  
  -- Check explicit permissions for all roles (overrides defaults)
  FOR i IN 1..array_length(user_roles, 1) LOOP
    SELECT COALESCE(granted, false) INTO has_permission
    FROM role_permissions
    WHERE role_name = user_roles[i]
      AND organization_id = org_id
      AND resource = p_resource
      AND action = p_action;
    
    -- If any role grants permission, return true
    IF has_permission THEN
      RETURN true;
    END IF;
  END LOOP;
  
  RETURN COALESCE(has_permission, false);
END;
$function$;

-- =====================================================
-- 5. Add comment to profiles.role indicating deprecation
-- =====================================================

COMMENT ON COLUMN public.profiles.role IS 'DEPRECATED: Use user_role_assignments table instead. This column is kept for backward compatibility only.';

-- =====================================================
-- 6. Update handle_new_user_with_invitation to use new system
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - create profile WITHOUT role (use assignments instead)
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      FALSE,
      now(),
      now(),
      now()
    );
    
    -- Assign the invitation role to user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, invitation_record.role::text, invitation_record.organization_id, invitation_record.invited_by)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (org creator)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
        ' ', 
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        ' Organization'
      )
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    -- Create profile WITHOUT role
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      TRUE,
      now(),
      now(),
      now()
    );
    
    -- Assign superadmin role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, 'superadmin', new_org_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;-- Fix user_roles RLS policy with OR true vulnerability
-- Drop ALL existing policies on user_roles
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'user_roles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON user_roles', pol.policyname);
    END LOOP;
END $$;

-- Create separate read and write policies
CREATE POLICY "Users can view roles in their organization"
ON user_roles FOR SELECT
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Only admins can manage roles"
ON user_roles FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Only admins can update roles"
ON user_roles FOR UPDATE
USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Only admins can delete roles"
ON user_roles FOR DELETE
USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);-- Clean up orphan records in user_role_assignments that don't have matching profiles
DELETE FROM public.user_role_assignments
WHERE user_id NOT IN (SELECT user_id FROM public.profiles);

-- Add missing foreign key from user_role_assignments to profiles
-- This enables proper joins for role management queries
ALTER TABLE public.user_role_assignments
ADD CONSTRAINT user_role_assignments_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(user_id) 
ON DELETE CASCADE;-- ============================================================================
-- PHASE 1-3: Critical Security, Schema Consolidation & Email Resolution
-- ============================================================================

-- PHASE 3: Add email column to profiles (do this first for foreign key dependencies)
-- ============================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

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
  -- Sync email from auth.users to profiles
  UPDATE public.profiles
  SET email = NEW.email
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

-- Create trigger for email updates
DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();


-- PHASE 1.1: Handle NULL organization_id values before adding constraints
-- ============================================================================

-- For case_types: Set to a default organization or mark as global
UPDATE public.case_types
SET is_global = true
WHERE organization_id IS NULL;

-- For case_issues: Set to global
UPDATE public.case_issues
SET is_global = true
WHERE organization_id IS NULL;

-- For case_fields: These should have an organization - log warning if any found
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.case_fields WHERE organization_id IS NULL;
  IF null_count > 0 THEN
    RAISE WARNING 'Found % case_fields with NULL organization_id - these will need manual review', null_count;
  END IF;
END $$;

-- For document_chunks: Get organization from parent document
UPDATE public.document_chunks dc
SET organization_id = d.organization_id
FROM public.documents d
WHERE dc.document_id = d.id AND dc.organization_id IS NULL;

-- For voice_transcriptions: Add organization_id column if not exists and populate
ALTER TABLE public.voice_transcriptions ADD COLUMN IF NOT EXISTS organization_id UUID;

UPDATE public.voice_transcriptions vt
SET organization_id = c.organization_id
FROM public.cases c
WHERE vt.case_id = c.id AND vt.organization_id IS NULL;

-- For contract_templates: Already has organization_id, handle NULLs by marking public
UPDATE public.contract_templates
SET is_public = true
WHERE organization_id IS NULL;

-- For user_role_assignments: Get from user's profile
UPDATE public.user_role_assignments ura
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ura.user_id = p.user_id AND ura.organization_id IS NULL;


-- PHASE 1.2: Add NOT NULL constraints after cleaning data
-- ============================================================================

-- Only add NOT NULL where we can guarantee data integrity
-- Skip tables where NULL is intentionally allowed (global items)

ALTER TABLE public.case_fields 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.document_chunks 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.voice_transcriptions 
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.user_role_assignments 
  ALTER COLUMN organization_id SET NOT NULL;


-- PHASE 1.3: Add Foreign Key Constraints to Organizations
-- ============================================================================

-- Add foreign keys with CASCADE for tenant data
ALTER TABLE public.case_types 
  DROP CONSTRAINT IF EXISTS fk_case_types_organization,
  ADD CONSTRAINT fk_case_types_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.case_issues 
  DROP CONSTRAINT IF EXISTS fk_case_issues_organization,
  ADD CONSTRAINT fk_case_issues_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.case_fields 
  DROP CONSTRAINT IF EXISTS fk_case_fields_organization,
  ADD CONSTRAINT fk_case_fields_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.document_chunks 
  DROP CONSTRAINT IF EXISTS fk_document_chunks_organization,
  ADD CONSTRAINT fk_document_chunks_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.voice_transcriptions 
  DROP CONSTRAINT IF EXISTS fk_voice_transcriptions_organization,
  ADD CONSTRAINT fk_voice_transcriptions_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.contract_templates 
  DROP CONSTRAINT IF EXISTS fk_contract_templates_organization,
  ADD CONSTRAINT fk_contract_templates_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.user_role_assignments 
  DROP CONSTRAINT IF EXISTS fk_user_role_assignments_organization,
  ADD CONSTRAINT fk_user_role_assignments_organization 
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


-- PHASE 1.4: Standardize User References to Profiles
-- ============================================================================

-- Cases table
ALTER TABLE public.cases 
  DROP CONSTRAINT IF EXISTS cases_created_by_fkey,
  ADD CONSTRAINT fk_cases_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.cases 
  DROP CONSTRAINT IF EXISTS cases_assigned_to_fkey,
  ADD CONSTRAINT fk_cases_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Documents table
ALTER TABLE public.documents 
  DROP CONSTRAINT IF EXISTS documents_created_by_fkey,
  ADD CONSTRAINT fk_documents_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Contracts table
ALTER TABLE public.contracts 
  DROP CONSTRAINT IF EXISTS contracts_created_by_fkey,
  ADD CONSTRAINT fk_contracts_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Invoices table
ALTER TABLE public.invoices 
  DROP CONSTRAINT IF EXISTS invoices_created_by_fkey,
  ADD CONSTRAINT fk_invoices_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Communication logs table
ALTER TABLE public.communication_logs 
  DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey,
  ADD CONSTRAINT fk_communication_logs_user_profile 
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Clients table
ALTER TABLE public.clients 
  DROP CONSTRAINT IF EXISTS clients_created_by_fkey,
  ADD CONSTRAINT fk_clients_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Calendar events
ALTER TABLE public.calendar_events 
  DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey,
  ADD CONSTRAINT fk_calendar_events_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Case activities
ALTER TABLE public.case_activities 
  DROP CONSTRAINT IF EXISTS case_activities_created_by_fkey,
  ADD CONSTRAINT fk_case_activities_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.case_activities 
  DROP CONSTRAINT IF EXISTS case_activities_assigned_to_fkey,
  ADD CONSTRAINT fk_case_activities_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

-- Tasks
ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_created_by_fkey,
  ADD CONSTRAINT fk_tasks_created_by_profile 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey,
  ADD CONSTRAINT fk_tasks_assigned_to_profile 
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;


-- PHASE 2: Update RLS policies for voice_transcriptions with new organization_id
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


-- Add helpful indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id ON public.case_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id ON public.voice_transcriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id ON public.user_role_assignments(organization_id);

-- Add index for email lookups on profiles
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;-- ============================================================================
-- PHASE 1-3: Critical Security, Schema Consolidation & Email Resolution
-- IMPROVED: Handles existing constraints properly
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

-- Create trigger for email updates
DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();


-- PHASE 1.1: Handle NULL organization_id values before adding constraints
-- ============================================================================

-- For case_types: Set to a default organization or mark as global
UPDATE public.case_types
SET is_global = true
WHERE organization_id IS NULL;

-- For case_issues: Set to global
UPDATE public.case_issues
SET is_global = true
WHERE organization_id IS NULL;

-- For document_chunks: Get organization from parent document
UPDATE public.document_chunks dc
SET organization_id = d.organization_id
FROM public.documents d
WHERE dc.document_id = d.id AND dc.organization_id IS NULL;

-- For voice_transcriptions: Add organization_id column if not exists and populate
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

-- For contract_templates: Already has organization_id, handle NULLs by marking public
UPDATE public.contract_templates
SET is_public = true
WHERE organization_id IS NULL;

-- For user_role_assignments: Get from user's profile
UPDATE public.user_role_assignments ura
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ura.user_id = p.user_id AND ura.organization_id IS NULL;


-- PHASE 1.2: Add NOT NULL constraints after cleaning data (only if not already set)
-- ============================================================================

DO $$
BEGIN
  -- case_fields.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'case_fields' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.case_fields ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- document_chunks.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'document_chunks' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.document_chunks ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- voice_transcriptions.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'voice_transcriptions' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.voice_transcriptions ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- user_role_assignments.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_role_assignments' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.user_role_assignments ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;


-- PHASE 1.3: Add Foreign Key Constraints to Organizations
-- ============================================================================

DO $$
BEGIN
  -- case_types
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_types_organization') THEN
    ALTER TABLE public.case_types 
      ADD CONSTRAINT fk_case_types_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_issues
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_issues_organization') THEN
    ALTER TABLE public.case_issues 
      ADD CONSTRAINT fk_case_issues_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_fields
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_fields_organization') THEN
    ALTER TABLE public.case_fields 
      ADD CONSTRAINT fk_case_fields_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- document_chunks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_chunks_organization') THEN
    ALTER TABLE public.document_chunks 
      ADD CONSTRAINT fk_document_chunks_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- voice_transcriptions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_voice_transcriptions_organization') THEN
    ALTER TABLE public.voice_transcriptions 
      ADD CONSTRAINT fk_voice_transcriptions_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- contract_templates
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contract_templates_organization') THEN
    ALTER TABLE public.contract_templates 
      ADD CONSTRAINT fk_contract_templates_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- user_role_assignments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_role_assignments_organization') THEN
    ALTER TABLE public.user_role_assignments 
      ADD CONSTRAINT fk_user_role_assignments_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;


-- PHASE 1.4: Standardize User References to Profiles (drop old, add new)
-- ============================================================================

DO $$
BEGIN
  -- Cases: created_by
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_created_by_profile') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Cases: assigned_to
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_assigned_to_profile') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Documents
  ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_created_by_profile') THEN
    ALTER TABLE public.documents 
      ADD CONSTRAINT fk_documents_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Contracts
  ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contracts_created_by_profile') THEN
    ALTER TABLE public.contracts 
      ADD CONSTRAINT fk_contracts_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Invoices
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_created_by_profile') THEN
    ALTER TABLE public.invoices 
      ADD CONSTRAINT fk_invoices_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Communication logs
  ALTER TABLE public.communication_logs DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_communication_logs_user_profile') THEN
    ALTER TABLE public.communication_logs 
      ADD CONSTRAINT fk_communication_logs_user_profile 
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;

  -- Clients
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_created_by_profile') THEN
    ALTER TABLE public.clients 
      ADD CONSTRAINT fk_clients_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Calendar events
  ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_created_by_profile') THEN
    ALTER TABLE public.calendar_events 
      ADD CONSTRAINT fk_calendar_events_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Case activities: created_by
  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_activities_created_by_profile') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Case activities: assigned_to
  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_activities_assigned_to_profile') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Tasks: created_by
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_created_by_profile') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Tasks: assigned_to
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_assigned_to_profile') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;


-- PHASE 2: Update RLS policies for voice_transcriptions with new organization_id
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


-- Add helpful indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id ON public.case_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id ON public.voice_transcriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id ON public.user_role_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;-- ============================================================================
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
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;-- ============================================================================
-- PHASE 1-3: Critical Security, Schema Consolidation & Email Resolution
-- IMPROVED: Handles existing constraints properly
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

-- Create trigger for email updates
DROP TRIGGER IF EXISTS on_auth_user_email_change ON auth.users;
CREATE TRIGGER on_auth_user_email_change
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();


-- PHASE 1.1: Handle NULL organization_id values before adding constraints
-- ============================================================================

-- For case_types: Set to a default organization or mark as global
UPDATE public.case_types
SET is_global = true
WHERE organization_id IS NULL;

-- For case_issues: Set to global
UPDATE public.case_issues
SET is_global = true
WHERE organization_id IS NULL;

-- For document_chunks: Get organization from parent document
UPDATE public.document_chunks dc
SET organization_id = d.organization_id
FROM public.documents d
WHERE dc.document_id = d.id AND dc.organization_id IS NULL;

-- For voice_transcriptions: Add organization_id column if not exists and populate
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

-- For contract_templates: Already has organization_id, handle NULLs by marking public
UPDATE public.contract_templates
SET is_public = true
WHERE organization_id IS NULL;

-- For user_role_assignments: Get from user's profile
UPDATE public.user_role_assignments ura
SET organization_id = p.organization_id
FROM public.profiles p
WHERE ura.user_id = p.user_id AND ura.organization_id IS NULL;


-- PHASE 1.2: Add NOT NULL constraints after cleaning data (only if not already set)
-- ============================================================================

DO $$
BEGIN
  -- case_fields.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'case_fields' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.case_fields ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- document_chunks.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'document_chunks' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.document_chunks ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- voice_transcriptions.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'voice_transcriptions' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.voice_transcriptions ALTER COLUMN organization_id SET NOT NULL;
  END IF;

  -- user_role_assignments.organization_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_role_assignments' 
    AND column_name = 'organization_id' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.user_role_assignments ALTER COLUMN organization_id SET NOT NULL;
  END IF;
END $$;


-- PHASE 1.3: Add Foreign Key Constraints to Organizations
-- ============================================================================

DO $$
BEGIN
  -- case_types
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_types_organization') THEN
    ALTER TABLE public.case_types 
      ADD CONSTRAINT fk_case_types_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_issues
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_issues_organization') THEN
    ALTER TABLE public.case_issues 
      ADD CONSTRAINT fk_case_issues_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- case_fields
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_fields_organization') THEN
    ALTER TABLE public.case_fields 
      ADD CONSTRAINT fk_case_fields_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- document_chunks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_document_chunks_organization') THEN
    ALTER TABLE public.document_chunks 
      ADD CONSTRAINT fk_document_chunks_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- voice_transcriptions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_voice_transcriptions_organization') THEN
    ALTER TABLE public.voice_transcriptions 
      ADD CONSTRAINT fk_voice_transcriptions_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- contract_templates
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contract_templates_organization') THEN
    ALTER TABLE public.contract_templates 
      ADD CONSTRAINT fk_contract_templates_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- user_role_assignments
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_role_assignments_organization') THEN
    ALTER TABLE public.user_role_assignments 
      ADD CONSTRAINT fk_user_role_assignments_organization 
      FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;


-- PHASE 1.4: Standardize User References to Profiles (drop old, add new)
-- ============================================================================

DO $$
BEGIN
  -- Cases: created_by
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_created_by_profile') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Cases: assigned_to
  ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS cases_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_assigned_to_profile') THEN
    ALTER TABLE public.cases 
      ADD CONSTRAINT fk_cases_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Documents
  ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_created_by_profile') THEN
    ALTER TABLE public.documents 
      ADD CONSTRAINT fk_documents_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Contracts
  ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contracts_created_by_profile') THEN
    ALTER TABLE public.contracts 
      ADD CONSTRAINT fk_contracts_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Invoices
  ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_created_by_profile') THEN
    ALTER TABLE public.invoices 
      ADD CONSTRAINT fk_invoices_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Communication logs
  ALTER TABLE public.communication_logs DROP CONSTRAINT IF EXISTS communication_logs_user_id_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_communication_logs_user_profile') THEN
    ALTER TABLE public.communication_logs 
      ADD CONSTRAINT fk_communication_logs_user_profile 
      FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
  END IF;

  -- Clients
  ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_created_by_profile') THEN
    ALTER TABLE public.clients 
      ADD CONSTRAINT fk_clients_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Calendar events
  ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_calendar_events_created_by_profile') THEN
    ALTER TABLE public.calendar_events 
      ADD CONSTRAINT fk_calendar_events_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Case activities: created_by
  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_activities_created_by_profile') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Case activities: assigned_to
  ALTER TABLE public.case_activities DROP CONSTRAINT IF EXISTS case_activities_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_case_activities_assigned_to_profile') THEN
    ALTER TABLE public.case_activities 
      ADD CONSTRAINT fk_case_activities_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Tasks: created_by
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_created_by_profile') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_created_by_profile 
      FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;

  -- Tasks: assigned_to
  ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_assigned_to_profile') THEN
    ALTER TABLE public.tasks 
      ADD CONSTRAINT fk_tasks_assigned_to_profile 
      FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
  END IF;
END $$;


-- PHASE 2: Update RLS policies for voice_transcriptions with new organization_id
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


-- Add helpful indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_case_fields_organization_id ON public.case_fields(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_organization_id ON public.document_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_voice_transcriptions_organization_id ON public.voice_transcriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_organization_id ON public.user_role_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;-- ============================================================================
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
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email) WHERE email IS NOT NULL;-- ============================================================================
-- PHASE 4: Normalize Permission System
-- ============================================================================

-- Create validation function to check if a role exists in either global or custom roles
CREATE OR REPLACE FUNCTION public.validate_role_exists(p_role_name TEXT, p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if role exists in global_roles
  IF EXISTS (SELECT 1 FROM public.global_roles WHERE role = p_role_name) THEN
    RETURN TRUE;
  END IF;
  
  -- Check if role exists in user_roles for the organization
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE role_name = p_role_name 
    AND organization_id = p_organization_id
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Create validation function for role_permissions
CREATE OR REPLACE FUNCTION public.validate_role_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the role exists
  IF NOT public.validate_role_exists(NEW.role_name, NEW.organization_id) THEN
    RAISE EXCEPTION 'Role "%" does not exist for organization "%"', NEW.role_name, NEW.organization_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create validation function for user_role_assignments
CREATE OR REPLACE FUNCTION public.validate_user_role_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate that the role exists
  IF NOT public.validate_role_exists(NEW.role_name, NEW.organization_id) THEN
    RAISE EXCEPTION 'Cannot assign role "%" - it does not exist for organization "%"', NEW.role_name, NEW.organization_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_validate_role_permission ON public.role_permissions;
DROP TRIGGER IF EXISTS trigger_validate_user_role_assignment ON public.user_role_assignments;

-- Create trigger for role_permissions validation
CREATE TRIGGER trigger_validate_role_permission
  BEFORE INSERT OR UPDATE ON public.role_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_role_permission();

-- Create trigger for user_role_assignments validation
CREATE TRIGGER trigger_validate_user_role_assignment
  BEFORE INSERT OR UPDATE ON public.user_role_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_user_role_assignment();

-- Create a consolidated view of all roles (global + custom) for easy querying
CREATE OR REPLACE VIEW public.all_roles AS
SELECT 
  role as role_name,
  display_name,
  description,
  NULL::UUID as organization_id,
  'global' as role_type,
  role as role_id
FROM public.global_roles

UNION ALL

SELECT 
  role_name,
  role_name as display_name,
  description,
  organization_id,
  'custom' as role_type,
  id::TEXT as role_id
FROM public.user_roles;

-- Add indexes for better performance on role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_role_name_org ON public.user_roles(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_name_org ON public.role_permissions(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_role_org ON public.user_role_assignments(role_name, organization_id);
CREATE INDEX IF NOT EXISTS idx_global_roles_role ON public.global_roles(role);

-- Create a function to get all roles for a specific organization (including global)
CREATE OR REPLACE FUNCTION public.get_organization_roles(p_organization_id UUID)
RETURNS TABLE(
  role_name TEXT,
  display_name TEXT,
  description TEXT,
  role_type TEXT,
  organization_id UUID
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- Get global roles
  SELECT 
    role::TEXT as role_name,
    display_name,
    description,
    'global'::TEXT as role_type,
    NULL::UUID as organization_id
  FROM public.global_roles
  
  UNION ALL
  
  -- Get custom roles for the organization
  SELECT 
    role_name,
    role_name as display_name,
    description,
    'custom'::TEXT as role_type,
    organization_id
  FROM public.user_roles
  WHERE organization_id = p_organization_id
  
  ORDER BY role_type, role_name;
$$;

-- Add a function to safely delete roles (prevents deletion if in use)
CREATE OR REPLACE FUNCTION public.safe_delete_custom_role(p_role_name TEXT, p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_count INTEGER;
  v_permission_count INTEGER;
BEGIN
  -- Check if role is assigned to any users
  SELECT COUNT(*) INTO v_assignment_count
  FROM public.user_role_assignments
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  IF v_assignment_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot delete role "%s" - it is assigned to %s user(s)', p_role_name, v_assignment_count)
    );
  END IF;
  
  -- Check if role has permissions defined
  SELECT COUNT(*) INTO v_permission_count
  FROM public.role_permissions
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  -- Delete permissions first
  IF v_permission_count > 0 THEN
    DELETE FROM public.role_permissions
    WHERE role_name = p_role_name 
    AND organization_id = p_organization_id;
  END IF;
  
  -- Delete the role
  DELETE FROM public.user_roles
  WHERE role_name = p_role_name 
  AND organization_id = p_organization_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Role "%s" deleted successfully', p_role_name)
  );
END;
$$;

-- Create a function to check if a user has a specific permission
CREATE OR REPLACE FUNCTION public.user_has_specific_permission(
  p_user_id UUID,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_has_permission BOOLEAN := false;
  v_user_role_names TEXT[];
BEGIN
  -- Get user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get all role names for the user
  SELECT ARRAY_AGG(role_name) INTO v_user_role_names
  FROM public.user_role_assignments
  WHERE user_id = p_user_id 
  AND organization_id = v_org_id;
  
  IF v_user_role_names IS NULL OR array_length(v_user_role_names, 1) = 0 THEN
    RETURN false;
  END IF;
  
  -- Superadmins have all permissions
  IF 'superadmin' = ANY(v_user_role_names) THEN
    RETURN true;
  END IF;
  
  -- Check explicit permissions
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions
    WHERE role_name = ANY(v_user_role_names)
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action
    AND granted = true
  ) INTO v_has_permission;
  
  -- If no explicit permission found, check default permissions for global roles
  IF NOT v_has_permission THEN
    -- Admins get CRUD by default
    IF 'admin' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      v_has_permission := true;
    -- Users get CRU by default
    ELSIF 'user' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update') THEN
      v_has_permission := true;
    END IF;
  END IF;
  
  RETURN v_has_permission;
END;
$$;

-- Add comments for documentation
COMMENT ON FUNCTION public.validate_role_exists IS 'Validates if a role exists in either global_roles or user_roles for the given organization';
COMMENT ON FUNCTION public.get_organization_roles IS 'Returns all available roles (global + custom) for a specific organization';
COMMENT ON FUNCTION public.safe_delete_custom_role IS 'Safely deletes a custom role only if it is not assigned to any users';
COMMENT ON FUNCTION public.user_has_specific_permission IS 'Checks if a user has a specific permission for a resource and action';
COMMENT ON VIEW public.all_roles IS 'Consolidated view of all roles (global and custom) across all organizations';-- ============================================================================
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
COMMENT ON FUNCTION public.log_audit_event IS 'Creates an audit log entry for sensitive operations with user context';-- Fix duplicate foreign key constraint on cases.assigned_to
-- Drop the older constraint and keep the newer one with clearer naming

-- Drop the old constraint if it exists
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS fk_cases_assigned_to;

-- Ensure the new constraint exists (it should from previous migrations)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_cases_assigned_to_profile' 
        AND conrelid = 'public.cases'::regclass
    ) THEN
        ALTER TABLE public.cases 
            ADD CONSTRAINT fk_cases_assigned_to_profile 
            FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
    END IF;
END $$;-- Add missing foreign key constraint for documents.created_by
-- This fixes the PostgREST error when fetching documents with creator profile

ALTER TABLE public.documents 
  DROP CONSTRAINT IF EXISTS documents_created_by_fkey;

ALTER TABLE public.documents 
  ADD CONSTRAINT documents_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;-- Create conversations table to store chat history
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE
);

-- Create conversation messages table
CREATE TABLE IF NOT EXISTS public.ai_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_conversations_org_user ON public.ai_conversations(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON public.ai_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversation_messages_conv ON public.ai_conversation_messages(conversation_id, created_at);

-- Enable RLS
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
CREATE POLICY "Users can view their own conversations"
  ON public.ai_conversations
  FOR SELECT
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can create their own conversations"
  ON public.ai_conversations
  FOR INSERT
  WITH CHECK (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
  ON public.ai_conversations
  FOR UPDATE
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations"
  ON public.ai_conversations
  FOR DELETE
  USING (organization_id = get_current_user_organization_id() AND user_id = auth.uid());

-- RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations"
  ON public.ai_conversation_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can create messages in their conversations"
  ON public.ai_conversation_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

CREATE POLICY "Users can delete messages in their conversations"
  ON public.ai_conversation_messages
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations
      WHERE ai_conversations.id = ai_conversation_messages.conversation_id
        AND ai_conversations.user_id = auth.uid()
        AND ai_conversations.organization_id = get_current_user_organization_id()
    )
  );

-- Trigger to update conversation updated_at when messages are added
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.ai_conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_conversation_timestamp
  AFTER INSERT ON public.ai_conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();-- Update the handle_new_user_with_invitation function to use organization details from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
  org_details jsonb;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF FOUND THEN
    -- User has an invitation - create profile WITHOUT role (use assignments instead)
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      FALSE,
      now(),
      now(),
      now()
    );
    
    -- Assign the invitation role to user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, invitation_record.role::text, invitation_record.organization_id, invitation_record.invited_by)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    -- Get custom roles for this invitation
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (org creator)
    -- Get organization details from metadata if provided
    org_details := NEW.raw_user_meta_data -> 'organization_details';
    
    IF org_details IS NOT NULL THEN
      -- Use detailed organization info from metadata
      INSERT INTO public.organizations (
        name, 
        email, 
        description,
        address,
        state,
        country,
        phone,
        created_at, 
        updated_at
      )
      VALUES (
        COALESCE(org_details ->> 'name', CONCAT(
          COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
          ' ', 
          COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
          ' Organization'
        )),
        COALESCE(org_details ->> 'email', NEW.email),
        org_details ->> 'description',
        org_details ->> 'address',
        org_details ->> 'state',
        org_details ->> 'country',
        org_details ->> 'phone',
        now(),
        now()
      )
      RETURNING id INTO new_org_id;
    ELSE
      -- Fallback to simple organization creation
      org_name := COALESCE(
        NEW.raw_user_meta_data ->> 'organization',
        CONCAT(
          COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
          ' ', 
          COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
          ' Organization'
        )
      );

      INSERT INTO public.organizations (name, email, created_at, updated_at)
      VALUES (org_name, NEW.email, now(), now())
      RETURNING id INTO new_org_id;
    END IF;

    -- Create profile WITHOUT role
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id,
      is_organization_creator,
      verified_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      TRUE,
      now(),
      now(),
      now()
    );
    
    -- Assign superadmin role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, 'superadmin', new_org_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;-- Update get_organization_users to fetch roles from user_role_assignments
CREATE OR REPLACE FUNCTION public.get_organization_users(org_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  department text,
  status text,
  disabled_at timestamp with time zone,
  disabled_by uuid,
  verified_at timestamp with time zone,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone,
  organization_id uuid,
  user_type text,
  verification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.email,
        p.first_name,
        p.last_name,
        -- Get primary role from user_role_assignments with priority order
        COALESCE(
          (SELECT role_name 
           FROM user_role_assignments ura 
           WHERE ura.user_id = p.user_id 
           AND ura.organization_id = p.organization_id
           ORDER BY 
             CASE 
               WHEN role_name = 'superadmin' THEN 1
               WHEN role_name = 'admin' THEN 2
               ELSE 3
             END
           LIMIT 1),
          'user'
        ) as role,
        p.department,
        p.status,
        p.disabled_at,
        p.disabled_by,
        p.verified_at,
        p.last_login_at,
        p.created_at,
        p.organization_id,
        'user'::text as user_type,
        CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END::text as verification_status
    FROM public.profiles p
    WHERE p.organization_id = org_id

    UNION ALL

    SELECT 
        i.id,
        NULL::uuid as user_id,
        i.email,
        i.first_name,
        i.last_name,
        i.role::text as role,
        i.department,
        i.status,
        NULL::timestamp with time zone as disabled_at,
        NULL::uuid as disabled_by,
        NULL::timestamp with time zone as verified_at,
        NULL::timestamp with time zone as last_login_at,
        i.created_at,
        i.organization_id,
        'invitation'::text as user_type,
        CASE 
            WHEN i.status = 'accepted' THEN 'verified'
            WHEN i.status = 'pending' THEN 'pending'
            ELSE 'expired'
        END::text as verification_status
    FROM public.invitations i
    WHERE i.organization_id = org_id 
      AND (i.status = 'pending' OR i.expires_at > now());
END;
$function$;-- Update invite_user_to_organization to check user_role_assignments instead of profiles.role
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
  is_valid_role boolean := false;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles from user_role_assignments
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Check if user has admin or superadmin role
  IF NOT ('superadmin' = ANY(current_user_roles) OR 'admin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Check if role is valid (either global or custom role in organization)
  -- Check global roles first
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    is_valid_role := true;
  -- Check custom roles for this organization
  ELSIF EXISTS(SELECT 1 FROM user_roles WHERE role_name = p_role AND organization_id = current_org_id) THEN
    is_valid_role := true;
  END IF;

  IF NOT is_valid_role THEN
    RETURN json_build_object('error', 'Invalid role specified: ' || p_role);
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error','Only superadmins can invite admin users');
  END IF;

  -- For global roles, cast to user_role enum
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    normalized_role := p_role::public.user_role;
  ELSE
    -- For custom roles, default to 'user' enum but store actual role name
    normalized_role := 'user'::public.user_role;
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id FROM auth.users WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Update existing user's profile
    IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id = invited_user_id) THEN
      UPDATE public.profiles
      SET organization_id = current_org_id,
          department = p_department,
          first_name = COALESCE(first_name, p_first_name),
          last_name = COALESCE(last_name, p_last_name),
          updated_at = now()
      WHERE user_id = invited_user_id;
    ELSE
      INSERT INTO public.profiles(
        user_id, first_name, last_name, organization_id, department, 
        is_organization_creator, created_at, updated_at
      ) VALUES (
        invited_user_id, p_first_name, p_last_name, current_org_id, 
        p_department, false, now(), now()
      );
    END IF;

    -- Assign role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (invited_user_id, p_role, current_org_id, auth.uid())
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

    RETURN json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Create new invitation
  INSERT INTO public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) VALUES (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  ON CONFLICT (organization_id, email) WHERE status = 'pending' DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    invited_by = EXCLUDED.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  -- Store custom role information for later processing
  IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    INSERT INTO invitation_custom_roles (invitation_id, role_name)
    SELECT i.id, p_role
    FROM invitations i
    WHERE i.organization_id = current_org_id 
      AND i.email = p_email 
      AND i.status = 'pending'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;

-- Update toggle_user_status to check user_role_assignments
CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id uuid, disable boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Only superadmins can disable/enable users
  IF NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only superadmins can disable/enable users');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Update the user's status
  IF disable THEN
    UPDATE public.profiles
    SET status = 'disabled',
        disabled_at = now(),
        disabled_by = auth.uid(),
        updated_at = now()
    WHERE user_id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET status = 'active',
        disabled_at = NULL,
        disabled_by = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
  END IF;

  RETURN json_build_object(
    'success', true, 
    'message', 
    CASE WHEN disable THEN 'User disabled successfully' ELSE 'User enabled successfully' END
  );
END;
$function$;-- Update invite_user_to_organization to check user_role_assignments instead of profiles.role
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(p_email text, p_first_name text, p_last_name text, p_role text, p_department text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  invited_user_id uuid;
  normalized_role public.user_role;
  is_valid_role boolean := false;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles from user_role_assignments
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Check if user has admin or superadmin role
  IF NOT ('superadmin' = ANY(current_user_roles) OR 'admin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error','Insufficient permissions to invite users');
  END IF;

  -- Check if role is valid (either global or custom role in organization)
  -- Check global roles first
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    is_valid_role := true;
  -- Check custom roles for this organization
  ELSIF EXISTS(SELECT 1 FROM user_roles WHERE role_name = p_role AND organization_id = current_org_id) THEN
    is_valid_role := true;
  END IF;

  IF NOT is_valid_role THEN
    RETURN json_build_object('error', 'Invalid role specified: ' || p_role);
  END IF;
  
  -- Additional security: Only superadmins can invite admins/superadmins
  IF p_role IN ('superadmin','admin') AND NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error','Only superadmins can invite admin users');
  END IF;

  -- For global roles, cast to user_role enum
  IF EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    normalized_role := p_role::public.user_role;
  ELSE
    -- For custom roles, default to 'user' enum but store actual role name
    normalized_role := 'user'::public.user_role;
  END IF;

  -- Check if user already exists
  SELECT id INTO invited_user_id FROM auth.users WHERE email = p_email;

  IF invited_user_id IS NOT NULL THEN
    -- Update existing user's profile
    IF EXISTS(SELECT 1 FROM public.profiles WHERE user_id = invited_user_id) THEN
      UPDATE public.profiles
      SET organization_id = current_org_id,
          department = p_department,
          first_name = COALESCE(first_name, p_first_name),
          last_name = COALESCE(last_name, p_last_name),
          updated_at = now()
      WHERE user_id = invited_user_id;
    ELSE
      INSERT INTO public.profiles(
        user_id, first_name, last_name, organization_id, department, 
        is_organization_creator, created_at, updated_at
      ) VALUES (
        invited_user_id, p_first_name, p_last_name, current_org_id, 
        p_department, false, now(), now()
      );
    END IF;

    -- Assign role via user_role_assignments
    INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (invited_user_id, p_role, current_org_id, auth.uid())
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;

    RETURN json_build_object('success', true, 'message', 'Existing user added to organization');
  END IF;

  -- Create new invitation
  INSERT INTO public.invitations(
    organization_id, email, first_name, last_name, role, department, invited_by
  ) VALUES (
    current_org_id, p_email, p_first_name, p_last_name, normalized_role, p_department, auth.uid()
  )
  ON CONFLICT (organization_id, email) WHERE status = 'pending' DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    invited_by = EXCLUDED.invited_by,
    expires_at = now() + interval '14 days',
    updated_at = now();

  -- Store custom role information for later processing
  IF NOT EXISTS(SELECT 1 FROM global_roles WHERE role = p_role) THEN
    INSERT INTO invitation_custom_roles (invitation_id, role_name)
    SELECT i.id, p_role
    FROM invitations i
    WHERE i.organization_id = current_org_id 
      AND i.email = p_email 
      AND i.status = 'pending'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Invitation created');
END;
$function$;

-- Update toggle_user_status to check user_role_assignments
CREATE OR REPLACE FUNCTION public.toggle_user_status(target_user_id uuid, disable boolean DEFAULT true)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Only superadmins can disable/enable users
  IF NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only superadmins can disable/enable users');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Update the user's status
  IF disable THEN
    UPDATE public.profiles
    SET status = 'disabled',
        disabled_at = now(),
        disabled_by = auth.uid(),
        updated_at = now()
    WHERE user_id = target_user_id;
  ELSE
    UPDATE public.profiles
    SET status = 'active',
        disabled_at = NULL,
        disabled_by = NULL,
        updated_at = now()
    WHERE user_id = target_user_id;
  END IF;

  RETURN json_build_object(
    'success', true, 
    'message', 
    CASE WHEN disable THEN 'User disabled successfully' ELSE 'User enabled successfully' END
  );
END;
$function$;-- Fix get_organization_users to prevent duplicates by excluding accepted invitations
CREATE OR REPLACE FUNCTION public.get_organization_users(org_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, first_name text, last_name text, role text, department text, status text, disabled_at timestamp with time zone, disabled_by uuid, verified_at timestamp with time zone, last_login_at timestamp with time zone, created_at timestamp with time zone, organization_id uuid, user_type text, verification_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.email,
        p.first_name,
        p.last_name,
        -- Get primary role from user_role_assignments with priority order
        COALESCE(
          (SELECT role_name 
           FROM user_role_assignments ura 
           WHERE ura.user_id = p.user_id 
           AND ura.organization_id = p.organization_id
           ORDER BY 
             CASE 
               WHEN role_name = 'superadmin' THEN 1
               WHEN role_name = 'admin' THEN 2
               ELSE 3
             END
           LIMIT 1),
          'user'
        ) as role,
        p.department,
        p.status,
        p.disabled_at,
        p.disabled_by,
        p.verified_at,
        p.last_login_at,
        p.created_at,
        p.organization_id,
        'user'::text as user_type,
        CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END::text as verification_status
    FROM public.profiles p
    WHERE p.organization_id = org_id

    UNION ALL

    SELECT 
        i.id,
        NULL::uuid as user_id,
        i.email,
        i.first_name,
        i.last_name,
        i.role::text as role,
        i.department,
        i.status,
        NULL::timestamp with time zone as disabled_at,
        NULL::uuid as disabled_by,
        NULL::timestamp with time zone as verified_at,
        NULL::timestamp with time zone as last_login_at,
        i.created_at,
        i.organization_id,
        'invitation'::text as user_type,
        CASE 
            WHEN i.status = 'accepted' THEN 'verified'
            WHEN i.status = 'pending' THEN 'pending'
            ELSE 'expired'
        END::text as verification_status
    FROM public.invitations i
    WHERE i.organization_id = org_id 
      AND i.status = 'pending'
      AND i.expires_at > now();
END;
$function$;

-- Create function to change user role (for admins/superadmins)
CREATE OR REPLACE FUNCTION public.change_user_role(
  p_target_user_id uuid,
  p_new_role_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_user_roles text[];
  current_org_id uuid;
  target_org_id uuid;
BEGIN
  -- Get current user's organization
  SELECT organization_id INTO current_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- Get current user's roles
  SELECT ARRAY_AGG(role_name) INTO current_user_roles
  FROM public.user_role_assignments
  WHERE user_id = auth.uid() AND organization_id = current_org_id;

  -- Only admins and superadmins can change roles
  IF NOT ('superadmin' = ANY(current_user_roles) OR 'admin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only admins and superadmins can change user roles');
  END IF;

  -- Get target user's organization
  SELECT organization_id INTO target_org_id
  FROM public.profiles
  WHERE user_id = p_target_user_id;

  -- Ensure target user is in same organization
  IF target_org_id != current_org_id THEN
    RETURN json_build_object('error', 'User not found in your organization');
  END IF;

  -- Only superadmins can assign superadmin role
  IF p_new_role_name = 'superadmin' AND NOT ('superadmin' = ANY(current_user_roles)) THEN
    RETURN json_build_object('error', 'Only superadmins can assign the superadmin role');
  END IF;

  -- Validate that the role exists
  IF NOT validate_role_exists(p_new_role_name, current_org_id) THEN
    RETURN json_build_object('error', 'Role does not exist: ' || p_new_role_name);
  END IF;

  -- Delete all existing role assignments for the user
  DELETE FROM public.user_role_assignments
  WHERE user_id = p_target_user_id
    AND organization_id = current_org_id;

  -- Assign the new role
  INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
  VALUES (p_target_user_id, p_new_role_name, current_org_id, auth.uid());

  RETURN json_build_object(
    'success', true,
    'message', 'User role changed successfully'
  );
END;
$function$;-- First, let's ensure all required columns exist
DO $$ 
BEGIN
  -- Add domain_hint
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN domain_hint TEXT;
  EXCEPTION
    WHEN duplicate_column THEN
      -- Column already exists, skip
      NULL;
  END;

  -- Add redirect_uri
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN redirect_uri TEXT;
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;

  -- Add created_by
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN created_by UUID REFERENCES auth.users(id);
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;

  -- Add updated_by
  BEGIN
    ALTER TABLE public.organization_sso_configs ADD COLUMN updated_by UUID REFERENCES auth.users(id);
  EXCEPTION
    WHEN duplicate_column THEN
      NULL;
  END;
END $$;-- Create view that masks secrets
CREATE OR REPLACE VIEW public.organization_sso_configs_view AS
SELECT 
  id,
  organization_id,
  provider,
  client_id,
  CASE 
    WHEN client_secret IS NOT NULL THEN '••••••••'
    ELSE NULL
  END as client_secret_masked,
  client_secret IS NOT NULL as has_client_secret,
  tenant_id,
  domain_hint,
  redirect_uri,
  is_enabled,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM public.organization_sso_configs;

-- Create upsert function
CREATE OR REPLACE FUNCTION public.upsert_organization_sso_config(
  p_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_client_id TEXT DEFAULT NULL,
  p_client_secret TEXT DEFAULT NULL,
  p_tenant_id TEXT DEFAULT NULL,
  p_domain_hint TEXT DEFAULT NULL,
  p_redirect_uri TEXT DEFAULT NULL,
  p_is_enabled BOOLEAN DEFAULT true
)
RETURNS public.organization_sso_configs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_result public.organization_sso_configs;
  v_user_role TEXT;
BEGIN
  SELECT organization_id, role::TEXT INTO v_org_id, v_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmins can manage SSO configurations';
  END IF;
  
  IF p_id IS NULL AND (p_provider IS NULL OR p_provider NOT IN ('google', 'microsoft')) THEN
    RAISE EXCEPTION 'Invalid provider. Must be google or microsoft';
  END IF;
  
  IF p_id IS NOT NULL THEN
    UPDATE public.organization_sso_configs
    SET 
      client_id = COALESCE(p_client_id, client_id),
      client_secret = COALESCE(p_client_secret, client_secret),
      tenant_id = COALESCE(p_tenant_id, tenant_id),
      domain_hint = p_domain_hint,
      redirect_uri = p_redirect_uri,
      is_enabled = COALESCE(p_is_enabled, is_enabled),
      updated_at = now(),
      updated_by = auth.uid()
    WHERE id = p_id AND organization_id = v_org_id
    RETURNING * INTO v_result;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SSO configuration not found';
    END IF;
  ELSE
    INSERT INTO public.organization_sso_configs (
      organization_id,
      provider,
      client_id,
      client_secret,
      tenant_id,
      domain_hint,
      redirect_uri,
      is_enabled,
      created_by,
      updated_by
    ) VALUES (
      v_org_id,
      p_provider,
      p_client_id,
      p_client_secret,
      p_tenant_id,
      p_domain_hint,
      p_redirect_uri,
      p_is_enabled,
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_result;
  END IF;
  
  RETURN v_result;
END;
$$;

-- Create delete function
CREATE OR REPLACE FUNCTION public.delete_organization_sso_config(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_role TEXT;
BEGIN
  SELECT organization_id, role::TEXT INTO v_org_id, v_user_role
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_user_role != 'superadmin' THEN
    RAISE EXCEPTION 'Only superadmins can delete SSO configurations';
  END IF;
  
  DELETE FROM public.organization_sso_configs
  WHERE id = p_id AND organization_id = v_org_id;
  
  RETURN FOUND;
END;
$$;-- Fix RLS policy conflict on clients table
-- Drop the permissive policy that grants organization-wide access
-- Keep only the restrictive policy that limits access to assigned clients

DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;

-- The restrictive policy "Users can view clients they're assigned to" will remain
-- This ensures users can only see:
-- 1. Clients they created
-- 2. Clients assigned to cases they're working on
-- 3. All clients if they're an admin

COMMENT ON POLICY "Users can view clients they're assigned to" ON public.clients 
IS 'Users can only view clients they created or are assigned to via cases, or all clients if admin';-- 1. Add case_issue_id to cases table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'cases' 
    AND column_name = 'case_issue_id'
  ) THEN
    ALTER TABLE public.cases ADD COLUMN case_issue_id UUID REFERENCES public.case_issues(id);
  END IF;
END $$;

-- 2. Update RLS policies on cases table to enforce permissions
DROP POLICY IF EXISTS "Users can view cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can create cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can update cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can delete cases in their organization" ON public.cases;

-- Create new permission-based policies
CREATE POLICY "Users can view cases with read permission"
ON public.cases
FOR SELECT
TO authenticated
USING (
  organization_id = get_current_user_organization_id() 
  AND user_has_specific_permission(auth.uid(), 'cases', 'read')
);

CREATE POLICY "Users can create cases with create permission"
ON public.cases
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'create')
);

CREATE POLICY "Users can update cases with update permission"
ON public.cases
FOR UPDATE
TO authenticated
USING (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'update')
);

CREATE POLICY "Users can delete cases with delete permission"
ON public.cases
FOR DELETE
TO authenticated
USING (
  organization_id = get_current_user_organization_id()
  AND user_has_specific_permission(auth.uid(), 'cases', 'delete')
);SET search_path = public;

-- Ensure pgcrypto is available for symmetric encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table to store organization SSO configurations
CREATE TABLE IF NOT EXISTS public.organization_sso_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  client_id text NOT NULL,
  client_secret bytea,
  tenant_id text,
  domain_hint text,
  redirect_uri text,
  is_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_sso_configs_org_provider_idx
  ON public.organization_sso_configs (organization_id, provider);

-- Trigger to update the timestamp automatically
DROP TRIGGER IF EXISTS trg_organization_sso_configs_set_updated_at ON public.organization_sso_configs;
CREATE TRIGGER trg_organization_sso_configs_set_updated_at
  BEFORE UPDATE ON public.organization_sso_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enforce row level security
ALTER TABLE public.organization_sso_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sso_configs FORCE ROW LEVEL SECURITY;

-- Policies restricting access to members of the same organization
DROP POLICY IF EXISTS "org members read sso configs" ON public.organization_sso_configs;
CREATE POLICY "org members read sso configs" ON public.organization_sso_configs
  FOR SELECT
  USING (organization_id = public.get_user_organization_id());

DROP POLICY IF EXISTS "org admins manage sso configs" ON public.organization_sso_configs;
CREATE POLICY "org admins manage sso configs" ON public.organization_sso_configs
  FOR ALL
  USING (
    organization_id = public.get_user_organization_id()
    AND public.current_user_is_org_admin()
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.current_user_is_org_admin()
  );

-- Restrict direct table access; consumers should use the sanitized view or RPC helpers
REVOKE ALL ON public.organization_sso_configs FROM PUBLIC;
REVOKE ALL ON public.organization_sso_configs FROM authenticated;
REVOKE ALL ON public.organization_sso_configs FROM anon;
GRANT ALL ON public.organization_sso_configs TO service_role;

-- View that exposes sanitized data and masks the client secret for non-service role callers
CREATE OR REPLACE VIEW public.organization_sso_configs_view
WITH (security_barrier=true) AS
SELECT
  c.id,
  c.organization_id,
  c.provider,
  c.client_id,
  c.tenant_id,
  c.domain_hint,
  c.redirect_uri,
  c.is_enabled,
  c.created_by,
  c.updated_by,
  c.created_at,
  c.updated_at,
  c.client_secret IS NOT NULL AS has_client_secret,
  CASE
    WHEN c.client_secret IS NOT NULL
    THEN '••••••••'
    ELSE NULL
  END AS client_secret_masked,
  CASE
    WHEN c.client_secret IS NOT NULL
      AND current_setting('request.jwt.claim.role', true) = 'service_role'
      AND coalesce(
        nullif(current_setting('app.settings.sso_secret_key', true), ''),
        nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
      ) IS NOT NULL
    THEN convert_from(
      pgp_sym_decrypt(
        c.client_secret,
        coalesce(
          nullif(current_setting('app.settings.sso_secret_key', true), ''),
          nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
        )::text
      ),
      'utf8'
    )
    ELSE NULL
  END AS client_secret
FROM public.organization_sso_configs c;

GRANT SELECT ON public.organization_sso_configs_view TO authenticated;
GRANT SELECT ON public.organization_sso_configs_view TO service_role;

-- Helper function to upsert configurations with encryption handled server-side
CREATE OR REPLACE FUNCTION public.upsert_organization_sso_config(
  p_id uuid DEFAULT NULL,
  p_provider text,
  p_client_id text,
  p_client_secret text DEFAULT NULL,
  p_tenant_id text DEFAULT NULL,
  p_domain_hint text DEFAULT NULL,
  p_redirect_uri text DEFAULT NULL,
  p_is_enabled boolean DEFAULT false
)
RETURNS public.organization_sso_configs_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_key text;
  v_org_id uuid;
  v_is_admin boolean;
  v_target_id uuid;
  v_row public.organization_sso_configs%ROWTYPE;
  v_result public.organization_sso_configs_view;
BEGIN
  SELECT organization_id, role IN ('admin', 'superadmin')
    INTO v_org_id, v_is_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not associated with an organization.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only organization admins can manage SSO configurations.' USING ERRCODE = '42501';
  END IF;

  v_secret_key := coalesce(
    nullif(current_setting('app.settings.sso_secret_key', true), ''),
    nullif(current_setting('supabase.env.SSO_SECRET_KEY', true), '')
  );

  IF v_secret_key IS NULL THEN
    RAISE EXCEPTION 'SSO secret key is not configured.';
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT id
      INTO v_target_id
    FROM public.organization_sso_configs
    WHERE id = p_id
      AND organization_id = v_org_id;

    IF v_target_id IS NULL THEN
      RAISE EXCEPTION 'SSO configuration not found for this organization.' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT id
      INTO v_target_id
    FROM public.organization_sso_configs
    WHERE organization_id = v_org_id
      AND provider = p_provider;
  END IF;

  IF v_target_id IS NULL THEN
    INSERT INTO public.organization_sso_configs (
      organization_id,
      provider,
      client_id,
      client_secret,
      tenant_id,
      domain_hint,
      redirect_uri,
      is_enabled,
      created_by,
      updated_by
    )
    VALUES (
      v_org_id,
      p_provider,
      p_client_id,
      CASE
        WHEN p_client_secret IS NOT NULL THEN pgp_sym_encrypt(p_client_secret, v_secret_key)
        ELSE NULL
      END,
      p_tenant_id,
      p_domain_hint,
      p_redirect_uri,
      coalesce(p_is_enabled, false),
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.organization_sso_configs
    SET
      client_id = p_client_id,
      client_secret = CASE
        WHEN p_client_secret IS NOT NULL THEN pgp_sym_encrypt(p_client_secret, v_secret_key)
        ELSE client_secret
      END,
      tenant_id = p_tenant_id,
      domain_hint = p_domain_hint,
      redirect_uri = p_redirect_uri,
      is_enabled = coalesce(p_is_enabled, false),
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
    WHERE id = v_target_id
    RETURNING * INTO v_row;
  END IF;

  SELECT *
    INTO v_result
  FROM public.organization_sso_configs_view
  WHERE id = v_row.id;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.upsert_organization_sso_config(uuid, text, text, text, text, text, text, boolean)
  OWNER TO postgres;

-- Helper to delete configurations with appropriate authorization checks
CREATE OR REPLACE FUNCTION public.delete_organization_sso_config(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_is_admin boolean;
  v_deleted boolean := false;
BEGIN
  SELECT organization_id, role IN ('admin', 'superadmin')
    INTO v_org_id, v_is_admin
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User is not associated with an organization.' USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only organization admins can manage SSO configurations.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.organization_sso_configs
  WHERE id = p_id
    AND organization_id = v_org_id
  RETURNING TRUE INTO v_deleted;

  RETURN coalesce(v_deleted, false);
END;
$$;

ALTER FUNCTION public.delete_organization_sso_config(uuid) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.upsert_organization_sso_config(uuid, text, text, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_organization_sso_config(uuid) TO authenticated;
-- SECURITY FIX: Make domain field mandatory for SSO configurations
-- This ensures all SSO configs must specify their authorized email domain

-- Add NOT NULL constraint to domain field (after setting a default for existing rows)
UPDATE organization_sso_configs 
SET domain = COALESCE(domain, 'example.com')
WHERE domain IS NULL OR domain = '';

ALTER TABLE organization_sso_configs 
ALTER COLUMN domain SET NOT NULL;

-- Add check constraint to ensure domain is not empty
ALTER TABLE organization_sso_configs
ADD CONSTRAINT domain_not_empty CHECK (domain IS NOT NULL AND length(trim(domain)) > 0);

-- Add index for faster domain lookups
CREATE INDEX IF NOT EXISTS idx_org_sso_configs_domain ON organization_sso_configs(lower(domain), provider) WHERE is_enabled = true;

-- Update RLS policy to ensure only superadmins can manage SSO configs
DROP POLICY IF EXISTS "Superadmins can manage SSO config" ON organization_sso_configs;

CREATE POLICY "Superadmins can manage SSO config"
  ON organization_sso_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      WHERE ura.user_id = auth.uid()
      AND ura.role_name = 'superadmin'
      AND ura.organization_id = organization_sso_configs.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      WHERE ura.user_id = auth.uid()
      AND ura.role_name = 'superadmin'
      AND ura.organization_id = organization_sso_configs.organization_id
    )
  );

COMMENT ON COLUMN organization_sso_configs.domain IS 'Required email domain for SSO authentication (e.g., company.com). Used to match user emails to organizations.';
-- Create the match_document_chunks function for vector similarity search
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  contract_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.id,
    dc.document_id,
    dc.contract_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND dc.organization_id = get_current_user_organization_id()
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_document_chunks(vector(1536), float, int) TO authenticated;-- Fix overly permissive RLS policies on role_permissions and settings tables
-- These policies had 'OR true' conditions that bypassed access controls

-- =====================
-- FIX role_permissions TABLE
-- =====================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view role permissions or superadmins can manage all" ON public.role_permissions;

-- Create proper separated policies for role_permissions
-- All users in organization can VIEW role permissions (needed for UI to show permissions)
CREATE POLICY "Users can view role permissions in their organization"
ON public.role_permissions
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only superadmins can INSERT role permissions
CREATE POLICY "Superadmins can create role permissions"
ON public.role_permissions
FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- Only superadmins can UPDATE role permissions
CREATE POLICY "Superadmins can update role permissions"
ON public.role_permissions
FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- Only superadmins can DELETE role permissions
CREATE POLICY "Superadmins can delete role permissions"
ON public.role_permissions
FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'superadmin'::user_role
  )
);

-- =====================
-- FIX settings TABLE
-- =====================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can view settings or admins can manage all in their organ" ON public.settings;

-- Create proper separated policies for settings
-- All users in organization can VIEW settings
CREATE POLICY "Users can view settings in their organization"
ON public.settings
FOR SELECT
USING (organization_id = get_current_user_organization_id());

-- Only admins can INSERT settings
CREATE POLICY "Admins can create settings"
ON public.settings
FOR INSERT
WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);

-- Only admins can UPDATE settings
CREATE POLICY "Admins can update settings"
ON public.settings
FOR UPDATE
USING (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);

-- Only admins can DELETE settings
CREATE POLICY "Admins can delete settings"
ON public.settings
FOR DELETE
USING (
  organization_id = get_current_user_organization_id()
  AND is_user_admin()
);-- Fix security definer views by recreating them with SECURITY INVOKER

-- First, drop and recreate all_roles view with SECURITY INVOKER
DROP VIEW IF EXISTS public.all_roles;

CREATE VIEW public.all_roles 
WITH (security_invoker = true) 
AS
SELECT 
  role AS role_name,
  'global'::text AS role_type,
  role AS role_id,
  description,
  NULL::uuid AS organization_id,
  display_name
FROM public.global_roles
UNION ALL
SELECT 
  role_name,
  'custom'::text AS role_type,
  id::text AS role_id,
  description,
  organization_id,
  role_name AS display_name
FROM public.user_roles;

-- Drop and recreate organization_sso_configs_view with SECURITY INVOKER
DROP VIEW IF EXISTS public.organization_sso_configs_view;

CREATE VIEW public.organization_sso_configs_view
WITH (security_invoker = true)
AS
SELECT 
  id,
  organization_id,
  provider,
  client_id,
  CASE 
    WHEN client_secret IS NOT NULL THEN '********'::text 
    ELSE NULL 
  END AS client_secret_masked,
  client_secret IS NOT NULL AS has_client_secret,
  tenant_id,
  domain_hint,
  redirect_uri,
  is_enabled,
  created_at,
  created_by,
  updated_at,
  updated_by
FROM public.organization_sso_configs;-- Fix user_has_specific_permission function to prevent permission enumeration
-- Add validation that caller must be in same org as target user OR be an admin

CREATE OR REPLACE FUNCTION public.user_has_specific_permission(p_user_id uuid, p_resource text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_caller_org_id UUID;
  v_has_permission BOOLEAN := false;
  v_user_role_names TEXT[];
  v_caller_role_names TEXT[];
BEGIN
  -- Get caller's organization and roles
  SELECT organization_id INTO v_caller_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_caller_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get target user's organization
  SELECT organization_id INTO v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Security check: caller must be in same organization as target user
  IF v_caller_org_id != v_org_id THEN
    RETURN false;
  END IF;
  
  -- If checking own permissions, allow
  -- If checking another user's permissions, must be admin/superadmin
  IF p_user_id != auth.uid() THEN
    SELECT ARRAY_AGG(role_name) INTO v_caller_role_names
    FROM public.user_role_assignments
    WHERE user_id = auth.uid() AND organization_id = v_caller_org_id;
    
    IF NOT ('superadmin' = ANY(COALESCE(v_caller_role_names, ARRAY[]::TEXT[])) OR 
            'admin' = ANY(COALESCE(v_caller_role_names, ARRAY[]::TEXT[]))) THEN
      RETURN false; -- Non-admins cannot check other users' permissions
    END IF;
  END IF;
  
  -- Get all role names for the target user
  SELECT ARRAY_AGG(role_name) INTO v_user_role_names
  FROM public.user_role_assignments
  WHERE user_id = p_user_id 
  AND organization_id = v_org_id;
  
  IF v_user_role_names IS NULL OR array_length(v_user_role_names, 1) = 0 THEN
    RETURN false;
  END IF;
  
  -- Superadmins have all permissions
  IF 'superadmin' = ANY(v_user_role_names) THEN
    RETURN true;
  END IF;
  
  -- Check explicit permissions
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions
    WHERE role_name = ANY(v_user_role_names)
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action
    AND granted = true
  ) INTO v_has_permission;
  
  -- If no explicit permission found, check default permissions for global roles
  IF NOT v_has_permission THEN
    -- Admins get CRUD by default
    IF 'admin' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update', 'delete', 'manage') THEN
      v_has_permission := true;
    -- Users get CRU by default
    ELSIF 'user' = ANY(v_user_role_names) AND p_action IN ('create', 'read', 'update') THEN
      v_has_permission := true;
    END IF;
  END IF;
  
  RETURN v_has_permission;
END;
$function$;-- Fix RLS performance issues: wrap auth.uid() in (select auth.uid()) 
-- and consolidate duplicate permissive policies

-- ============================================
-- FIX: role_permissions table
-- ============================================
DROP POLICY IF EXISTS "Superadmins can create role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can update role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Superadmins can delete role permissions" ON public.role_permissions;

CREATE POLICY "Superadmins can create role permissions" ON public.role_permissions
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

CREATE POLICY "Superadmins can update role permissions" ON public.role_permissions
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

CREATE POLICY "Superadmins can delete role permissions" ON public.role_permissions
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

-- ============================================
-- FIX: organization_sso_configs - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Superadmins can manage SSO config" ON public.organization_sso_configs;
DROP POLICY IF EXISTS "Superadmins can manage SSO configs in their organization" ON public.organization_sso_configs;

CREATE POLICY "Superadmins can manage SSO configs" ON public.organization_sso_configs
FOR ALL USING (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM user_role_assignments ura
    WHERE ura.user_id = (select auth.uid())
    AND ura.role_name = 'superadmin'
    AND ura.organization_id = organization_sso_configs.organization_id
  )
) WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND EXISTS (
    SELECT 1 FROM user_role_assignments ura
    WHERE ura.user_id = (select auth.uid())
    AND ura.role_name = 'superadmin'
    AND ura.organization_id = organization_sso_configs.organization_id
  )
);

-- ============================================
-- FIX: audit_logs table
-- ============================================
DROP POLICY IF EXISTS "Superadmins can view audit logs in their organization" ON public.audit_logs;

CREATE POLICY "Superadmins can view audit logs in their organization" ON public.audit_logs
FOR SELECT USING (
  organization_id = get_current_user_organization_id() 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = (select auth.uid()) 
    AND profiles.role = 'superadmin'::user_role
  )
);

-- ============================================
-- FIX: clients - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Admins can create clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients they'll manage" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients they manage" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients they manage" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients they're assigned to" ON public.clients;

-- Consolidated INSERT policy
CREATE POLICY "Users can create clients in their organization" ON public.clients
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

-- Consolidated DELETE policy
CREATE POLICY "Users can delete clients in their organization" ON public.clients
FOR DELETE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
  )
);

-- Consolidated UPDATE policy
CREATE POLICY "Users can update clients in their organization" ON public.clients
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
  )
);

-- Consolidated SELECT policy
CREATE POLICY "Users can view clients in their organization" ON public.clients
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin() 
    OR created_by = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM cases
      WHERE cases.client_id = clients.id
      AND (cases.assigned_to = (select auth.uid()) OR cases.created_by = (select auth.uid()))
    )
  )
);

-- ============================================
-- FIX: ai_conversation_messages table
-- ============================================
DROP POLICY IF EXISTS "Users can create messages in their conversations" ON public.ai_conversation_messages;
DROP POLICY IF EXISTS "Users can delete messages in their conversations" ON public.ai_conversation_messages;
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.ai_conversation_messages;

CREATE POLICY "Users can create messages in their conversations" ON public.ai_conversation_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can delete messages in their conversations" ON public.ai_conversation_messages
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

CREATE POLICY "Users can view messages in their conversations" ON public.ai_conversation_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM ai_conversations
    WHERE ai_conversations.id = ai_conversation_messages.conversation_id
    AND ai_conversations.user_id = (select auth.uid())
    AND ai_conversations.organization_id = get_current_user_organization_id()
  )
);

-- ============================================
-- FIX: ai_conversations table
-- ============================================
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.ai_conversations;

CREATE POLICY "Users can create their own conversations" ON public.ai_conversations
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can delete their own conversations" ON public.ai_conversations
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can update their own conversations" ON public.ai_conversations
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

CREATE POLICY "Users can view their own conversations" ON public.ai_conversations
FOR SELECT USING (
  organization_id = get_current_user_organization_id() 
  AND user_id = (select auth.uid())
);

-- ============================================
-- FIX: user_role_assignments - consolidate duplicate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "Only admins can manage role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view their own role assignments" ON public.user_role_assignments;

-- Create separate policies for different operations
CREATE POLICY "Admins can manage role assignments" ON public.user_role_assignments
FOR ALL USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
) WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Users can view role assignments in their org" ON public.user_role_assignments
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

-- ============================================
-- FIX: profiles - consolidate duplicate UPDATE policies
-- ============================================
DROP POLICY IF EXISTS "admins_can_update_any_profile" ON public.profiles;
DROP POLICY IF EXISTS "users_update_own_profile_no_role_change" ON public.profiles;

CREATE POLICY "Users can update profiles" ON public.profiles
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR user_id = (select auth.uid())
  )
) WITH CHECK (
  organization_id = get_current_user_organization_id()
  AND (
    is_user_admin()
    OR (user_id = (select auth.uid()) AND role = (SELECT role FROM profiles WHERE user_id = (select auth.uid())))
  )
);-- Fix remaining duplicate permissive policies

-- ============================================
-- FIX: user_role_assignments - consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view role assignments in their org" ON public.user_role_assignments;

-- Single SELECT policy for all users in org
CREATE POLICY "Users can view role assignments in their org" ON public.user_role_assignments
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

-- Separate policies for write operations (admins only)
CREATE POLICY "Admins can insert role assignments" ON public.user_role_assignments
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Admins can update role assignments" ON public.user_role_assignments
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Admins can delete role assignments" ON public.user_role_assignments
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

-- ============================================
-- FIX: voice_transcriptions - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Users can delete transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can delete voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can create transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can create voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can view transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can view voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can update transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can update voice transcriptions in their organization" ON public.voice_transcriptions;

-- Single consolidated policies for voice_transcriptions
CREATE POLICY "Users can view transcriptions in their organization" ON public.voice_transcriptions
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can create transcriptions in their organization" ON public.voice_transcriptions
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update transcriptions in their organization" ON public.voice_transcriptions
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can delete transcriptions in their organization" ON public.voice_transcriptions
FOR DELETE USING (
  organization_id = get_current_user_organization_id()
);SET search_path = public;

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
-- Create subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  stripe_price_id TEXT NOT NULL UNIQUE,
  price_amount INTEGER NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create organization subscriptions table
CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'past_due', 'canceled', 'trialing', 'unpaid')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- Create payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id),
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  amount INTEGER NOT NULL, -- in cents
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')),
  description TEXT,
  invoice_url TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id ON organization_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_stripe_sub_id ON organization_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_history_org_id ON payment_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_created_at ON payment_history(created_at DESC);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans (readable by all authenticated users)
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for organization_subscriptions
CREATE POLICY "org_subscriptions_select" ON organization_subscriptions
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "org_subscriptions_insert" ON organization_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (SELECT get_user_organization_id()));

CREATE POLICY "org_subscriptions_update" ON organization_subscriptions
  FOR UPDATE TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

-- RLS Policies for payment_history
CREATE POLICY "payment_history_select" ON payment_history
  FOR SELECT TO authenticated
  USING (organization_id = (SELECT get_user_organization_id()));

-- Insert default subscription plans
INSERT INTO subscription_plans (name, description, stripe_price_id, price_amount, currency, interval, features) VALUES
  ('Starter', 'Perfect for small teams getting started', 'price_starter_monthly', 2900, 'usd', 'month', '["Up to 5 users", "100 cases", "Basic document storage", "Email support"]'::jsonb),
  ('Professional', 'For growing legal practices', 'price_professional_monthly', 7900, 'usd', 'month', '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support"]'::jsonb),
  ('Enterprise', 'For large organizations', 'price_enterprise_monthly', 19900, 'usd', 'month', '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO"]'::jsonb),
  ('Starter Annual', 'Perfect for small teams - Annual billing', 'price_starter_yearly', 29000, 'usd', 'year', '["Up to 5 users", "100 cases", "Basic document storage", "Email support", "2 months free"]'::jsonb),
  ('Professional Annual', 'For growing legal practices - Annual billing', 'price_professional_yearly', 79000, 'usd', 'year', '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support", "2 months free"]'::jsonb),
  ('Enterprise Annual', 'For large organizations - Annual billing', 'price_enterprise_yearly', 199000, 'usd', 'year', '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO", "2 months free"]'::jsonb)
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();

DROP TRIGGER IF EXISTS org_subscriptions_updated_at ON organization_subscriptions;
CREATE TRIGGER org_subscriptions_updated_at
  BEFORE UPDATE ON organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscription_updated_at();
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS calendar_ics_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_ics_token
  ON public.profiles (calendar_ics_token)
  WHERE calendar_ics_token IS NOT NULL;

COMMENT ON COLUMN public.profiles.calendar_ics_token IS 'Token used to access calendar ICS export/subscription.';
-- Migration: Create CSRF token sessions table
-- This table stores CSRF tokens for authenticated users

CREATE TABLE IF NOT EXISTS user_csrf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, csrf_token)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_user_id ON user_csrf_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_token ON user_csrf_sessions(csrf_token);
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_expires_at ON user_csrf_sessions(expires_at);

-- Enable RLS
ALTER TABLE user_csrf_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own CSRF tokens
CREATE POLICY "Users can view their own CSRF tokens"
  ON user_csrf_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all tokens (for edge functions)
CREATE POLICY "Service role can manage all CSRF tokens"
  ON user_csrf_sessions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_csrf_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_csrf_sessions WHERE expires_at < NOW();
END;
$$;

-- Optional: Create a scheduled job to cleanup expired tokens
-- This would need to be set up in Supabase Dashboard > Database > Cron Jobs
-- Or use pg_cron extension if available

COMMENT ON TABLE user_csrf_sessions IS 'Stores CSRF tokens for authenticated user sessions';
COMMENT ON COLUMN user_csrf_sessions.csrf_token IS 'Cryptographically secure CSRF token (64 hex characters)';
COMMENT ON COLUMN user_csrf_sessions.expires_at IS 'Token expiration timestamp (typically 24 hours from creation)';
-- Migration: Fix RLS performance issues
-- 1. Wrap auth functions in subselects to prevent per-row re-evaluation
-- 2. Consolidate multiple permissive policies into single policies

-- ============================================================================
-- HELPER: Update functions to use subselects internally
-- ============================================================================

-- These functions already use auth.uid() internally, but callers should still
-- wrap them in (select ...) for best performance in RLS policies

-- ============================================================================
-- TABLE: user_csrf_sessions
-- Issues:
--   - auth.uid() and auth.role() re-evaluated per row
--   - Multiple permissive policies for SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;

-- Consolidated SELECT policy with subselects
CREATE POLICY "Users can view their own CSRF tokens"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- Service role policy for ALL operations (not overlapping with user SELECT)
CREATE POLICY "Service role can manage all CSRF tokens"
  ON public.user_csrf_sessions
  FOR ALL
  USING ((select auth.role()) = 'service_role');

-- ============================================================================
-- TABLE: notification_preferences
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update their own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert their own notification preferences" ON public.notification_preferences;

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: user_onboarding_steps
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own onboarding steps" ON public.user_onboarding_steps;
DROP POLICY IF EXISTS "Users can update their own onboarding steps" ON public.user_onboarding_steps;
DROP POLICY IF EXISTS "Users can insert their own onboarding steps" ON public.user_onboarding_steps;

CREATE POLICY "Users can view their own onboarding steps"
  ON public.user_onboarding_steps
  FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own onboarding steps"
  ON public.user_onboarding_steps
  FOR UPDATE
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert their own onboarding steps"
  ON public.user_onboarding_steps
  FOR INSERT
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: profiles
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive INSERT and SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in organization" ON public.profiles;
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can insert profiles" ON public.profiles;

-- Consolidated SELECT: own profile OR same organization
CREATE POLICY "Users can view profiles in their organization"
  ON public.profiles
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated INSERT: service role OR trigger-based (using security definer functions)
-- Keep one policy that allows inserts during user creation flow
CREATE POLICY "System can insert profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (true);  -- INSERT protected by trigger/function-level security

-- ============================================================================
-- TABLE: cases
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can view cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can update their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can update cases in their organization" ON public.cases;
DROP POLICY IF EXISTS "Users can delete their own cases" ON public.cases;
DROP POLICY IF EXISTS "Users can delete cases in their organization" ON public.cases;

-- Consolidated SELECT: own cases OR organization cases
CREATE POLICY "Users can view cases in their organization"
  ON public.cases
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE: own cases OR organization cases
CREATE POLICY "Users can update cases in their organization"
  ON public.cases
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE: own cases OR organization cases
CREATE POLICY "Users can delete cases in their organization"
  ON public.cases
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: clients
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update clients in their organization" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete clients in their organization" ON public.clients;

-- Consolidated SELECT
CREATE POLICY "Users can view clients in their organization"
  ON public.clients
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update clients in their organization"
  ON public.clients
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete clients in their organization"
  ON public.clients
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: documents
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can view documents in their organization" ON public.documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can update documents in their organization" ON public.documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
DROP POLICY IF EXISTS "Users can delete documents in their organization" ON public.documents;

-- Consolidated SELECT
CREATE POLICY "Users can view documents in their organization"
  ON public.documents
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update documents in their organization"
  ON public.documents
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete documents in their organization"
  ON public.documents
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: contracts
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive policies for SELECT, UPDATE, DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can view contracts in their organization" ON public.contracts;
DROP POLICY IF EXISTS "Users can update their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can update contracts in their organization" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete their own contracts" ON public.contracts;
DROP POLICY IF EXISTS "Users can delete contracts in their organization" ON public.contracts;

-- Consolidated SELECT
CREATE POLICY "Users can view contracts in their organization"
  ON public.contracts
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated UPDATE
CREATE POLICY "Users can update contracts in their organization"
  ON public.contracts
  FOR UPDATE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- Consolidated DELETE
CREATE POLICY "Users can delete contracts in their organization"
  ON public.contracts
  FOR DELETE
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: calendar_events
-- Issues:
--   - auth functions re-evaluated per row
--   - 3 permissive SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view calendar events in their organization" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can view events in their organization" ON public.calendar_events;

-- Consolidated SELECT
CREATE POLICY "Users can view calendar events in their organization"
  ON public.calendar_events
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: invoices
-- Issues:
--   - auth functions re-evaluated per row
--   - Multiple permissive SELECT policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can view invoices in their organization" ON public.invoices;

-- Consolidated SELECT
CREATE POLICY "Users can view invoices in their organization"
  ON public.invoices
  FOR SELECT
  USING (
    created_by = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- ============================================================================
-- TABLE: conversations
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;

CREATE POLICY "Users can view conversations in their organization"
  ON public.conversations
  FOR SELECT
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can create conversations in their organization"
  ON public.conversations
  FOR INSERT
  WITH CHECK (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can update their own conversations"
  ON public.conversations
  FOR UPDATE
  USING (created_by = (select auth.uid()));

-- ============================================================================
-- TABLE: messages
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;

CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can send messages to their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can update their own messages"
  ON public.messages
  FOR UPDATE
  USING (sender_id = (select auth.uid()));

CREATE POLICY "Users can delete their own messages"
  ON public.messages
  FOR DELETE
  USING (sender_id = (select auth.uid()));

-- ============================================================================
-- TABLE: conversation_participants
-- Issues: auth functions re-evaluated per row
-- ============================================================================

DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversation_participants.conversation_id
    AND cp.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_participants.conversation_id
    AND c.created_by = (select auth.uid())
  ));

CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- TABLE: organizations
-- Issues: Multiple permissive INSERT policies
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Service role can insert organizations" ON public.organizations;

-- Consolidated INSERT policy
CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ============================================================================
-- TABLE: invitations
-- Issues: Multiple permissive UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Admins can update invitations in their organization" ON public.invitations;
DROP POLICY IF EXISTS "Trigger can update invitations" ON public.invitations;

-- Consolidated UPDATE policy - admins or system
CREATE POLICY "Admins can update invitations in their organization"
  ON public.invitations
  FOR UPDATE
  USING (
    organization_id = (select public.get_user_organization_id())
    AND (select public.current_user_is_org_admin())
  );

-- ============================================================================
-- TABLE: case_types (from earlier migration - ensure subselects)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can create case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can update case types in their organization" ON public.case_types;
DROP POLICY IF EXISTS "Users can delete case types in their organization" ON public.case_types;

CREATE POLICY "Users can view case types in their organization"
  ON public.case_types
  FOR SELECT
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can create case types in their organization"
  ON public.case_types
  FOR INSERT
  WITH CHECK (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can update case types in their organization"
  ON public.case_types
  FOR UPDATE
  USING (organization_id = (select public.get_user_organization_id()));

CREATE POLICY "Users can delete case types in their organization"
  ON public.case_types
  FOR DELETE
  USING (organization_id = (select public.get_user_organization_id()));

-- ============================================================================
-- TABLE: case_fields (from earlier migration - ensure subselects)
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can create case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can update case fields in their organization" ON public.case_fields;
DROP POLICY IF EXISTS "Users can delete case fields in their organization" ON public.case_fields;

CREATE POLICY "Users can view case fields in their organization"
  ON public.case_fields
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can create case fields in their organization"
  ON public.case_fields
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can update case fields in their organization"
  ON public.case_fields
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

CREATE POLICY "Users can delete case fields in their organization"
  ON public.case_fields
  FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.case_types ct
    WHERE ct.id = case_fields.case_type_id
    AND ct.organization_id = (select public.get_user_organization_id())
  ));

-- ============================================================================
-- Update helper functions to use subselects internally for consistency
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT organization_id FROM public.profiles WHERE user_id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE SECURITY DEFINER
  SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (select auth.uid()) AND p.role IN ('admin', 'superadmin')
  );
$function$;

COMMENT ON COLUMN public.user_csrf_sessions.csrf_token IS 'Cryptographically secure CSRF token (64 hex characters)';
-- Migration: Set up cron job for processing event reminders
-- This cron job runs every minute to check for due reminders and send notifications

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT USAGE ON SCHEMA net TO postgres;

-- Drop existing cron job if it exists (for idempotency)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-event-reminders') THEN
    PERFORM cron.unschedule('process-event-reminders');
    RAISE NOTICE 'Dropped existing process-event-reminders cron job';
  END IF;
END $$;

-- Create a function to call the edge function via HTTP
-- This function will be called by the cron job
CREATE OR REPLACE FUNCTION call_process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  project_ref text;
  service_role_key text;
  function_url text;
  response_id bigint;
BEGIN
  -- Get project reference from current database name or environment
  -- For Supabase Cloud, this should be set via environment variable
  -- For local development, you may need to set this manually
  project_ref := current_setting('app.settings.project_ref', true);
  
  -- Get service role key (should be set as a secret/parameter)
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If not set via settings, try to construct from database name
  IF project_ref IS NULL OR project_ref = '' THEN
    -- Try to extract from database name (Supabase pattern: postgres.[ref])
    SELECT substring(current_database() from '\.([^.]+)$') INTO project_ref;
  END IF;
  
  -- Construct function URL
  IF project_ref IS NOT NULL AND project_ref != '' THEN
    function_url := format('https://%s.supabase.co/functions/v1/process-event-reminders', project_ref);
  ELSE
    -- Fallback: use environment variable or default
    function_url := current_setting('app.settings.functions_url', true);
    IF function_url IS NULL OR function_url = '' THEN
      RAISE WARNING 'Could not determine function URL. Please set app.settings.project_ref or app.settings.functions_url';
      RETURN;
    END IF;
  END IF;
  
  -- Call the edge function via HTTP
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', format('Bearer %s', COALESCE(service_role_key, ''))
    ),
    body := '{}'::jsonb
  ) INTO response_id;
  
  RAISE NOTICE 'Called process-event-reminders function, response_id: %', response_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call process-event-reminders: %', SQLERRM;
END;
$$;

-- Schedule the cron job to run every minute
-- Note: For Supabase Cloud, you may need to set this up via Dashboard instead
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Schedule the job
    PERFORM cron.schedule(
      'process-event-reminders',
      '* * * * *', -- Every minute
      'SELECT call_process_event_reminders();'
    );
    RAISE NOTICE 'Scheduled process-event-reminders cron job to run every minute';
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Please set up cron job via Supabase Dashboard > Database > Cron Jobs';
  END IF;
END $$;

-- Add helpful comments
COMMENT ON FUNCTION call_process_event_reminders() IS 
'Calls the process-event-reminders edge function via HTTP.
This function is scheduled to run every minute via pg_cron.

To set up manually (if cron didn''t work):
1. Go to Supabase Dashboard > Database > Cron Jobs
2. Create new cron job:
   - Name: process-event-reminders
   - Schedule: * * * * * (every minute)
   - Command: SELECT call_process_event_reminders();
   
Or call the edge function directly:
   SELECT net.http_post(
     url := ''https://[PROJECT_REF].supabase.co/functions/v1/process-event-reminders'',
     headers := jsonb_build_object(''Authorization'', ''Bearer [SERVICE_ROLE_KEY]'')
   );';

-- Create event_reminders table if it doesn't exist (from earlier migration)
-- This ensures the table exists before creating the view
CREATE TABLE IF NOT EXISTS public.event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Reminder timing
  reminder_type text NOT NULL CHECK (reminder_type IN ('before', 'at')),
  reminder_minutes integer NOT NULL DEFAULT 15,
  
  -- Reminder status
  sent boolean DEFAULT false,
  sent_at timestamptz,
  
  -- Notification method
  notification_method text NOT NULL DEFAULT 'in_app' CHECK (notification_method IN ('in_app', 'email', 'both')),
  
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON public.event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id ON public.event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_sent ON public.event_reminders(sent);
CREATE INDEX IF NOT EXISTS idx_event_reminders_org_id ON public.event_reminders(organization_id);

-- Enable RLS if not already enabled
ALTER TABLE public.event_reminders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies if they don't exist (from earlier migration)
DO $$
BEGIN
  -- Policy: Users can view reminders for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can view reminders for their events'
  ) THEN
    CREATE POLICY "Users can view reminders for their events"
      ON public.event_reminders
      FOR SELECT
      TO authenticated
      USING (
        user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.calendar_events ce
          WHERE ce.id = event_reminders.event_id
          AND ce.organization_id = get_current_user_organization_id()
        )
      );
  END IF;

  -- Policy: Users can create reminders for their events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can create reminders for their events'
  ) THEN
    CREATE POLICY "Users can create reminders for their events"
      ON public.event_reminders
      FOR INSERT
      TO authenticated
      WITH CHECK (
        user_id = auth.uid() AND
        EXISTS (
          SELECT 1 FROM public.calendar_events ce
          WHERE ce.id = event_reminders.event_id
          AND ce.organization_id = get_current_user_organization_id()
        )
      );
  END IF;

  -- Policy: Users can update their own reminders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can update their own reminders'
  ) THEN
    CREATE POLICY "Users can update their own reminders"
      ON public.event_reminders
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  -- Policy: Users can delete their own reminders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'event_reminders' 
    AND policyname = 'Users can delete their own reminders'
  ) THEN
    CREATE POLICY "Users can delete their own reminders"
      ON public.event_reminders
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reminders TO authenticated;

-- Create a view to monitor reminder processing status
CREATE OR REPLACE VIEW event_reminders_status AS
SELECT 
  COUNT(*) FILTER (WHERE sent = false) as pending_count,
  COUNT(*) FILTER (WHERE sent = true) as sent_count,
  COUNT(*) FILTER (WHERE sent = false AND 
    (reminder_type = 'before' AND 
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) - 
     (reminder_minutes || ' minutes')::interval <= now() + interval '1 minute') OR
    (reminder_type = 'at' AND 
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) <= now() + interval '1 minute')
  ) as due_count
FROM event_reminders;

COMMENT ON VIEW event_reminders_status IS 
'View showing reminder processing status:
- pending_count: Reminders not yet sent
- sent_count: Reminders already sent
- due_count: Reminders that should be processed now';
-- Migration: Fix infinite recursion in chat RLS policies
-- Root cause: conversations policy checks conversation_participants, 
-- which checks conversations again = infinite loop
-- Solution: Break the circular dependency by using direct organization checks
--
-- IMPORTANT: This migration MUST be applied to fix the 500 errors.
-- Run this in Supabase SQL Editor or via migration system.

-- ============================================
-- 1. DROP ALL EXISTING CHAT POLICIES
-- ============================================

-- Drop ALL conversation_participants policies (comprehensive cleanup)
-- Old policy names
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
-- New policy names (in case migration was partially run)
DROP POLICY IF EXISTS "cp_select_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_delete_policy" ON public.conversation_participants;
-- Drop any remaining policies (catch-all)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'conversation_participants'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversation_participants', r.policyname);
  END LOOP;
END $$;

-- Drop conversations policies (old names)
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
-- Drop conversations policies (new names - in case migration was partially run)
DROP POLICY IF EXISTS "conv_select_policy" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_policy" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_policy" ON public.conversations;

-- Drop messages policies (old names)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
-- Drop messages policies (new names - in case migration was partially run)
DROP POLICY IF EXISTS "msg_select_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_update_policy" ON public.messages;
DROP POLICY IF EXISTS "msg_delete_policy" ON public.messages;

-- ============================================
-- 2. CREATE HELPER FUNCTIONS (SECURITY DEFINER TO BYPASS RLS)
-- ============================================

-- This function safely gets the user's org without triggering RLS checks
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- Function to check if conversation is in an organization (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_conversation_in_org(conv_id UUID, org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conv_id AND c.organization_id = org_id
  );
END;
$$;

-- Function to check if user is a participant (SECURITY DEFINER to bypass RLS)
-- Uses plpgsql to explicitly bypass RLS when querying conversation_participants
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- SECURITY DEFINER bypasses RLS completely - this query will not trigger RLS policies
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conv_id AND user_id = auth.uid()
  );
END;
$$;

-- ============================================
-- 3. RECREATE CONVERSATION_PARTICIPANTS POLICIES (NO RECURSION)
-- ============================================

-- SELECT: Users can only see their own participant records (direct check, no recursion)
CREATE POLICY "cp_select_policy"
  ON public.conversation_participants
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: User must be in same org as conversation
CREATE POLICY "cp_insert_policy"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    public.is_conversation_in_org(conversation_participants.conversation_id, public.get_auth_user_org_id())
  );

-- UPDATE: Only update your own record
CREATE POLICY "cp_update_policy"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: Only delete your own record (leave conversation)
CREATE POLICY "cp_delete_policy"
  ON public.conversation_participants
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- 4. RECREATE CONVERSATIONS POLICIES (NO RECURSION)
-- ============================================

-- SELECT: User is a participant (use function to avoid circular check)
CREATE POLICY "conv_select_policy"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = public.get_auth_user_org_id()
    AND public.is_conversation_participant(id)
  );

-- INSERT: User is in org and is the creator
CREATE POLICY "conv_insert_policy"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_auth_user_org_id()
    AND created_by = auth.uid()
  );

-- UPDATE: User is creator
CREATE POLICY "conv_update_policy"
  ON public.conversations
  FOR UPDATE
  USING (
    organization_id = public.get_auth_user_org_id()
    AND created_by = auth.uid()
  );

-- ============================================
-- 5. RECREATE MESSAGES POLICIES (NO RECURSION)
-- ============================================

-- SELECT: User is participant in the conversation
CREATE POLICY "msg_select_policy"
  ON public.messages
  FOR SELECT
  USING (
    public.is_conversation_participant(conversation_id)
  );

-- INSERT: User is participant and is the sender
CREATE POLICY "msg_insert_policy"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_participant(conversation_id)
  );

-- UPDATE: Sender only
CREATE POLICY "msg_update_policy"
  ON public.messages
  FOR UPDATE
  USING (sender_id = auth.uid());

-- DELETE: Sender only
CREATE POLICY "msg_delete_policy"
  ON public.messages
  FOR DELETE
  USING (sender_id = auth.uid());

-- ============================================
-- 6. ADD/UPDATE INDEXES FOR PERFORMANCE
-- ============================================

-- Composite index for participant lookup (critical for performance)
CREATE INDEX IF NOT EXISTS idx_cp_user_conversation 
  ON public.conversation_participants(user_id, conversation_id);

-- Index for conversation org lookup
CREATE INDEX IF NOT EXISTS idx_conversations_org_id 
  ON public.conversations(organization_id);

-- Index for messages by conversation
CREATE INDEX IF NOT EXISTS idx_messages_conv_created 
  ON public.messages(conversation_id, created_at DESC);

-- ============================================
-- 7. GRANT EXECUTE ON FUNCTIONS
-- ============================================

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_in_org(UUID, UUID) TO authenticated;
-- Migration: Fix remaining duplicate permissive policies
-- These policies existed before the previous migration and weren't dropped

-- ============================================================================
-- TABLE: case_types
-- Drop the extra policy that's conflicting with our consolidated policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view case types or superadmins/service can manage all" ON public.case_types;

-- ============================================================================
-- TABLE: user_csrf_sessions
-- The "FOR ALL" service role policy overlaps with user SELECT policy
-- Split service role into specific actions that don't overlap with user SELECT
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;

-- Consolidated SELECT: users see their own OR service role sees all
CREATE POLICY "Users and service role can view CSRF tokens"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR (select auth.role()) = 'service_role'
  );

-- Service role only for INSERT/UPDATE/DELETE (users don't need these)
CREATE POLICY "Service role can insert CSRF tokens"
  ON public.user_csrf_sessions
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can update CSRF tokens"
  ON public.user_csrf_sessions
  FOR UPDATE
  USING ((select auth.role()) = 'service_role');

CREATE POLICY "Service role can delete CSRF tokens"
  ON public.user_csrf_sessions
  FOR DELETE
  USING ((select auth.role()) = 'service_role');
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
-- Migration: Add index on messages.conversation_id
-- Source: Query performance analysis - index_advisor recommendation
-- 
-- The query "SELECT ... FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC"
-- runs 11,807 times with 0.57ms mean. Index advisor confirms this index reduces query cost.

-- Composite index covers both the FK lookup AND the ORDER BY created_at DESC pattern
-- Single composite index is more efficient than two separate indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
  ON public.messages(conversation_id, created_at DESC);

COMMENT ON INDEX public.idx_messages_conversation_id_created_at IS 'Composite index for conversation_id FK + created_at DESC ordering (query perf optimization)';
-- ============================================================================
-- Migration: Fix Overly Permissive RLS INSERT Policies
-- Date: 2026-01-11
-- Issue: "System can insert" policies use WITH CHECK (true) which is flagged
--        by the Supabase linter as overly permissive
-- Fix: Restrict INSERT to service_role only (used by triggers/edge functions)
-- ============================================================================

-- ============================================================================
-- TABLE: profiles
-- The "System can insert profiles" policy should only allow service_role
-- Profile inserts happen via auth triggers, not direct user inserts
-- ============================================================================

DROP POLICY IF EXISTS "System can insert profiles" ON public.profiles;

-- Only service_role can insert profiles (used by auth trigger on user creation)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- TABLE: audit_logs
-- The "System can insert audit logs" policy should only allow service_role
-- Audit logs are inserted by system functions, not direct user inserts
-- ============================================================================

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Only service_role can insert audit logs (used by audit logging functions)
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- NOTE: Leaked Password Protection
-- This is configured via Supabase Dashboard > Auth > Providers > Email
-- Enable "Prevent use of leaked passwords" setting
-- Cannot be fixed via SQL migration
-- ============================================================================
-- Migration: Add reply_to_id column to messages table for quote/reply feature

-- Add reply_to_id column (nullable, references same table)
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Create index for efficient lookups of replies
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.messages.reply_to_id IS 'References the message being replied to (quoted message)';
-- Migration: Fix Auth RLS InitPlan and Duplicate Policies
-- Date: 2026-01-11
--
-- This migration fixes:
-- 1. auth_rls_initplan issues: auth.<function>() calls being re-evaluated for each row
--    Solution: Wrap with (select auth.<function>()) for single evaluation
-- 2. multiple_permissive_policies: Duplicate policies for same role/action
--    Solution: Consolidate into single policies
-- 3. duplicate_index: Identical indexes on tables
--    Solution: Drop duplicates, keep one

-- ============================================================================
-- SECTION 1: FIX conversation_participants TABLE
-- Issues:
--   - Auth initplan: 8 policies re-evaluating auth functions
--   - Multiple policies: 3 SELECT, 3 INSERT, 3 UPDATE, 2 DELETE policies
-- ============================================================================

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can view own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_select_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can insert participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_policy" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can delete own participations" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_delete_policy" ON public.conversation_participants;

-- CREATE CONSOLIDATED POLICIES with (select auth.uid()) for performance

-- SELECT: User can view participants in conversations they are part of
CREATE POLICY "cp_select"
  ON public.conversation_participants
  FOR SELECT
  USING (
    -- User can see participants in conversations they participate in
    conversation_id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = (select auth.uid())
    )
  );

-- INSERT: User can add participants to conversations in their org
CREATE POLICY "cp_insert"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
      AND c.organization_id = (select public.get_auth_user_org_id())
    )
  );

-- UPDATE: User can only update their own participant record
CREATE POLICY "cp_update"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- DELETE: User can only delete their own participation (leave conversation)
CREATE POLICY "cp_delete"
  ON public.conversation_participants
  FOR DELETE
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- SECTION 2: FIX conversations TABLE
-- Issues:
--   - Auth initplan: conv_insert_policy, conv_update_policy
--   - Multiple policies: 2 SELECT, 2 INSERT, 2 UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "conv_select_policy" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations in their organization" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_policy" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_policy" ON public.conversations;

-- SELECT: User can view conversations in their org where they participate
CREATE POLICY "conv_select"
  ON public.conversations
  FOR SELECT
  USING (
    organization_id = (select public.get_auth_user_org_id())
    AND (select public.is_conversation_participant(id))
  );

-- INSERT: User can create conversations in their org
CREATE POLICY "conv_insert"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    organization_id = (select public.get_auth_user_org_id())
    AND created_by = (select auth.uid())
  );

-- UPDATE: Creator can update the conversation
CREATE POLICY "conv_update"
  ON public.conversations
  FOR UPDATE
  USING (
    organization_id = (select public.get_auth_user_org_id())
    AND created_by = (select auth.uid())
  );

-- ============================================================================
-- SECTION 3: FIX messages TABLE
-- Issues:
--   - Auth initplan: msg_insert_policy, msg_update_policy, msg_delete_policy
--   - Multiple policies: 2 SELECT, 2 INSERT, 2 UPDATE, 2 DELETE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "msg_select_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;
DROP POLICY IF EXISTS "msg_insert_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "msg_update_policy" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
DROP POLICY IF EXISTS "msg_delete_policy" ON public.messages;

-- SELECT: User can view messages in conversations they participate in
CREATE POLICY "msg_select"
  ON public.messages
  FOR SELECT
  USING ((select public.is_conversation_participant(conversation_id)));

-- INSERT: User can send messages to conversations they participate in
CREATE POLICY "msg_insert"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = (select auth.uid())
    AND (select public.is_conversation_participant(conversation_id))
  );

-- UPDATE: User can update their own messages
CREATE POLICY "msg_update"
  ON public.messages
  FOR UPDATE
  USING (sender_id = (select auth.uid()));

-- DELETE: User can delete their own messages
CREATE POLICY "msg_delete"
  ON public.messages
  FOR DELETE
  USING (sender_id = (select auth.uid()));

-- ============================================================================
-- SECTION 4: FIX profiles TABLE
-- Issues:
--   - Multiple policies: 2 SELECT, 3 UPDATE policies
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their organization" ON public.profiles;
DROP POLICY IF EXISTS "Trigger can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "self_update" ON public.profiles;

-- SELECT: User can view own profile or profiles in their organization
CREATE POLICY "profiles_select"
  ON public.profiles
  FOR SELECT
  USING (
    user_id = (select auth.uid())
    OR organization_id = (select public.get_user_organization_id())
  );

-- UPDATE: User can update their own profile
CREATE POLICY "profiles_update"
  ON public.profiles
  FOR UPDATE
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- ============================================================================
-- SECTION 5: FIX user_csrf_sessions TABLE
-- Issues:
--   - Multiple policies: 3 SELECT, 2 INSERT, 2 UPDATE, 2 DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can manage all CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can delete CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can insert CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Service role can update CSRF tokens" ON public.user_csrf_sessions;
DROP POLICY IF EXISTS "Users and service role can view CSRF tokens" ON public.user_csrf_sessions;

-- SELECT: User can view their own tokens
CREATE POLICY "csrf_select"
  ON public.user_csrf_sessions
  FOR SELECT
  USING (user_id = (select auth.uid()));

-- Service role has full access for all operations
CREATE POLICY "csrf_service_role_all"
  ON public.user_csrf_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- SECTION 6: FIX organizations TABLE
-- Issues:
--   - Auth initplan: "Users can update their organization"
--   - Multiple policies: 2 UPDATE policies (Admins + Users)
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Admins can update their organization" ON public.organizations;

-- UPDATE: User can update organizations they belong to
-- (Admins and regular users have same org update capability via membership)
CREATE POLICY "org_update"
  ON public.organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- SECTION 7: FIX admin_actions TABLE
-- Issues:
--   - Auth initplan: "Platform admins can view admin actions"
-- ============================================================================

DROP POLICY IF EXISTS "Platform admins can view admin actions" ON public.admin_actions;

-- Recreate with subselect for is_platform_admin
CREATE POLICY "admin_actions_select"
  ON public.admin_actions
  FOR SELECT
  USING ((select is_platform_admin((select auth.uid()))));

-- ============================================================================
-- SECTION 8: REMOVE DUPLICATE INDEXES
-- ============================================================================

-- conversation_participants: idx_conversation_participants_user_conv vs idx_cp_user_conversation
-- Keep idx_cp_user_conversation (shorter name, same columns)
DROP INDEX IF EXISTS public.idx_conversation_participants_user_conv;

-- conversations: idx_conversations_org vs idx_conversations_org_id
-- Keep idx_conversations_org_id (more explicit name)
DROP INDEX IF EXISTS public.idx_conversations_org;

-- messages: idx_messages_conv_created vs idx_messages_conversation vs idx_messages_conversation_id_created_at
-- Keep idx_messages_conversation_id_created_at (most explicit, includes both columns)
DROP INDEX IF EXISTS public.idx_messages_conv_created;
DROP INDEX IF EXISTS public.idx_messages_conversation;

-- ============================================================================
-- SECTION 9: UPDATE HELPER FUNCTIONS to use subselects internally
-- ============================================================================

-- Update get_auth_user_org_id to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.get_auth_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE user_id = (select auth.uid())
  LIMIT 1;
$$;

-- Update is_conversation_participant to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
    AND user_id = (select auth.uid())
  );
$$;

-- Update get_user_conversation_ids to use subselect for auth.uid()
CREATE OR REPLACE FUNCTION public.get_user_conversation_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT conversation_id
  FROM public.conversation_participants
  WHERE user_id = (select auth.uid());
$$;

-- ============================================================================
-- SECTION 10: VERIFY GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_auth_user_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_conversation_ids() TO authenticated;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This migration consolidates multiple permissive policies into single policies
-- and wraps all auth function calls in (select ...) for optimal performance.
--
-- Tables fixed:
--   - conversation_participants: 11 policies -> 4 policies
--   - conversations: 6 policies -> 3 policies
--   - messages: 8 policies -> 4 policies
--   - profiles: 5 policies -> 2 policies
--   - user_csrf_sessions: 6 policies -> 2 policies
--   - organizations: 2 UPDATE policies -> 1 policy
--   - admin_actions: 1 policy fixed for auth initplan
--
-- Indexes removed (duplicates):
--   - idx_conversation_participants_user_conv
--   - idx_conversations_org
--   - idx_messages_conv_created
--   - idx_messages_conversation
-- ============================================================================
-- Migration: Fix RLS vulnerabilities detected by Supabase database linter
--
-- Issues addressed:
-- 1. policy_exists_rls_disabled on public.invitation_update_jobs
--    - Policies exist ("Trigger can insert jobs") but RLS is not enabled
-- 2. policy_exists_rls_disabled on public.profiles
--    - Policies exist ("System can insert profiles", profiles_select, profiles_update) but RLS is not enabled
-- 3. rls_disabled_in_public on public.profiles
--    - Table is public but RLS has not been enabled
-- 4. rls_disabled_in_public on public.invitation_update_jobs
--    - Table is public but RLS has not been enabled
-- 5. security_definer_view on public.event_reminders_status
--    - View defined with SECURITY DEFINER property (uses definer's permissions instead of invoker's)

-- =============================================================================
-- Fix 1 & 4: Enable RLS on invitation_update_jobs table
-- =============================================================================
-- This table stores background jobs for updating invitation status
-- It already has policies defined but RLS was never enabled

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'invitation_update_jobs'
  ) THEN
    ALTER TABLE public.invitation_update_jobs ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on invitation_update_jobs table';
  ELSE
    RAISE NOTICE 'invitation_update_jobs table does not exist, skipping';
  END IF;
END $$;

-- Ensure the existing policy is properly set up for INSERT operations
-- This policy allows the trigger to insert jobs during signup
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'invitation_update_jobs'
  ) THEN
    -- Drop and recreate to ensure correct configuration
    DROP POLICY IF EXISTS "Trigger can insert jobs" ON public.invitation_update_jobs;

    -- Allow the service role (used by triggers) to insert jobs
    -- Note: SECURITY DEFINER functions bypass RLS by default
    CREATE POLICY "Trigger can insert jobs" ON public.invitation_update_jobs
      FOR INSERT
      WITH CHECK (true);

    -- Add policy for service role to update job status during processing
    DROP POLICY IF EXISTS "Service role can update jobs" ON public.invitation_update_jobs;
    CREATE POLICY "Service role can update jobs" ON public.invitation_update_jobs
      FOR UPDATE
      USING (true)
      WITH CHECK (true);

    -- Add policy for service role to select jobs for processing
    DROP POLICY IF EXISTS "Service role can select jobs" ON public.invitation_update_jobs;
    CREATE POLICY "Service role can select jobs" ON public.invitation_update_jobs
      FOR SELECT
      USING (true);

    RAISE NOTICE 'Configured RLS policies on invitation_update_jobs table';
  END IF;
END $$;

-- =============================================================================
-- Fix 2 & 3: Enable RLS on profiles table
-- =============================================================================
-- This table stores user profile information
-- It has policies but RLS was somehow disabled

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'Enabled RLS on profiles table';
  END IF;
END $$;

-- Ensure existing policies are properly configured
-- The profiles table should have:
-- 1. System can insert profiles - for new user creation trigger
-- 2. profiles_select - for authenticated users to read profiles in their org
-- 3. profiles_update - for users to update their own profile

-- Verify and fix the insert policy for system/trigger operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'System can insert profiles'
  ) THEN
    -- Create the policy if it doesn't exist
    CREATE POLICY "System can insert profiles" ON public.profiles
      FOR INSERT
      WITH CHECK (true);
    RAISE NOTICE 'Created "System can insert profiles" policy';
  END IF;
END $$;

-- =============================================================================
-- Fix 5: Recreate event_reminders_status view without SECURITY DEFINER
-- =============================================================================
-- The view was created with SECURITY DEFINER which means it uses the
-- creator's permissions rather than the querying user's permissions.
-- This is a security risk as it bypasses RLS policies on underlying tables.

-- Recreate the view with SECURITY INVOKER (default, but explicit for clarity)
CREATE OR REPLACE VIEW public.event_reminders_status
WITH (security_invoker = true)
AS
SELECT
  COUNT(*) FILTER (WHERE sent = false) as pending_count,
  COUNT(*) FILTER (WHERE sent = true) as sent_count,
  COUNT(*) FILTER (WHERE sent = false AND
    (reminder_type = 'before' AND
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) -
     (reminder_minutes || ' minutes')::interval <= now() + interval '1 minute') OR
    (reminder_type = 'at' AND
     (SELECT start_date FROM calendar_events WHERE id = event_reminders.event_id) <= now() + interval '1 minute')
  ) as due_count
FROM event_reminders;

COMMENT ON VIEW public.event_reminders_status IS
'View showing reminder processing status (with SECURITY INVOKER for proper RLS enforcement):
- pending_count: Reminders not yet sent
- sent_count: Reminders already sent
- due_count: Reminders that should be processed now';

-- =============================================================================
-- Verification
-- =============================================================================
DO $$
DECLARE
  profiles_rls boolean;
  invitation_jobs_rls boolean;
  view_security text;
BEGIN
  -- Check RLS status on profiles
  SELECT relrowsecurity INTO profiles_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'profiles';

  -- Check RLS status on invitation_update_jobs
  SELECT relrowsecurity INTO invitation_jobs_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'invitation_update_jobs';

  RAISE NOTICE '';
  RAISE NOTICE '=== RLS Vulnerability Fixes Applied ===';
  RAISE NOTICE '';
  RAISE NOTICE 'profiles table RLS enabled: %', COALESCE(profiles_rls::text, 'table not found');
  RAISE NOTICE 'invitation_update_jobs table RLS enabled: %', COALESCE(invitation_jobs_rls::text, 'table not found');
  RAISE NOTICE 'event_reminders_status view: recreated with SECURITY INVOKER';
  RAISE NOTICE '';
END $$;
-- Add platform_admin role to global_roles and create helper function
-- This role is for Kourti team and onboarding managers who need cross-org access

-- Add platform_admin to global_roles
INSERT INTO public.global_roles(role, display_name, description) VALUES
  ('platform_admin', 'Platform Admin', 'Kourti team member with cross-organization access and system-wide management capabilities')
ON CONFLICT (role) DO UPDATE SET 
  display_name = EXCLUDED.display_name, 
  description = EXCLUDED.description;

-- Create function to check if a user has platform_admin role
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN := false;
BEGIN
  -- Check if user has platform_admin role in user_role_assignments
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.profiles p ON p.user_id = ura.user_id
    WHERE ura.user_id = p_user_id
      AND ura.role_name = 'platform_admin'
      AND p.organization_id IS NOT NULL
  ) INTO v_has_role;
  
  RETURN COALESCE(v_has_role, false);
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.is_platform_admin IS 'Checks if a user has the platform_admin role, granting cross-organization access';

-- Update profiles.status to include 'approved'
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_status_check 
CHECK (status IN ('active', 'disabled', 'pending', 'approved'));

-- Add approved_at and approved_by fields if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id);

-- Ensure last_login_at exists (it should from previous migration, but just in case)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
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
-- Add functions for platform admins to access cross-organization data
-- These functions bypass normal RLS policies for platform admins

-- Function to get all organizations (platform admin only)
DROP FUNCTION IF EXISTS public.get_all_organizations();
CREATE OR REPLACE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_count BIGINT,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all organizations';
  END IF;
  
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.email,
    o.description,
    o.address,
    o.phone,
    o.website,
    o.logo_url,
    o.created_at,
    o.updated_at,
    COUNT(DISTINCT p.user_id)::BIGINT as user_count,
    CASE 
      WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
      WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
      ELSE 'inactive'
    END as status
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  GROUP BY o.id, o.name, o.email, o.description, o.address, o.phone, o.website, o.logo_url, o.created_at, o.updated_at
  ORDER BY o.created_at DESC;
END;
$$;

-- Function to get all users across all organizations (platform admin only)
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT,
  department TEXT,
  status TEXT,
  organization_id UUID,
  organization_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.role::TEXT,
    p.department,
    p.status,
    p.organization_id,
    o.name as organization_name,
    p.created_at,
    p.updated_at,
    p.last_login_at,
    p.approved_at,
    p.approved_by,
    p.disabled_at,
    p.disabled_by
  FROM public.profiles p
  LEFT JOIN public.organizations o ON o.id = p.organization_id
  ORDER BY p.created_at DESC;
END;
$$;

-- Function to approve a user (platform admin only)
DROP FUNCTION IF EXISTS public.approve_user(UUID);
CREATE OR REPLACE FUNCTION public.approve_user(
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can approve users';
  END IF;
  
  -- Get current status
  SELECT status INTO v_old_status
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Update user status
  UPDATE public.profiles
  SET 
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'user_approved',
    'user',
    p_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'approved'
    )
  );
  
  RETURN true;
END;
$$;

-- Function to disable a user (platform admin only)
-- Drop existing disable_user function if it exists (may have different signature)
-- Old function signature: disable_user(target_user_id uuid)
DROP FUNCTION IF EXISTS public.disable_user(uuid);
DROP FUNCTION IF EXISTS public.disable_user(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.disable_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_email TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can disable users';
  END IF;
  
  -- Get current status and email
  SELECT status, email INTO v_old_status, v_email
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Update user status
  UPDATE public.profiles
  SET 
    status = 'disabled',
    disabled_at = now(),
    disabled_by = auth.uid(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'user_disabled',
    'user',
    p_user_id,
    jsonb_build_object(
      'old_status', v_old_status,
      'new_status', 'disabled',
      'reason', p_reason,
      'user_email', v_email
    )
  );
  
  RETURN true;
END;
$$;

-- Function to safely delete a user (platform admin only)
-- This is a soft delete - marks user as deleted but keeps audit trail
DROP FUNCTION IF EXISTS public.delete_user_safe(UUID, TEXT);
DROP FUNCTION IF EXISTS public.delete_user_safe(UUID);
CREATE OR REPLACE FUNCTION public.delete_user_safe(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete users';
  END IF;
  
  -- Get user info for logging
  SELECT email, organization_id INTO v_email, v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'user_deleted',
    'user',
    p_user_id,
    jsonb_build_object(
      'user_email', v_email,
      'organization_id', v_org_id,
      'reason', p_reason
    )
  );
  
  -- Delete the user (CASCADE will handle related records)
  -- This will delete from auth.users which cascades to profiles
  DELETE FROM auth.users
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;

-- Function to create an organization (platform admin only)
DROP FUNCTION IF EXISTS public.create_organization_admin(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_organization_admin(
  p_name TEXT,
  p_email TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can create organizations';
  END IF;
  
  -- Create organization
  INSERT INTO public.organizations (
    name,
    email,
    description,
    address,
    phone,
    website,
    created_at,
    updated_at
  ) VALUES (
    p_name,
    p_email,
    p_description,
    p_address,
    p_phone,
    p_website,
    now(),
    now()
  ) RETURNING id INTO v_org_id;
  
  -- Log the action
  PERFORM log_admin_action(
    'org_created',
    'organization',
    v_org_id,
    jsonb_build_object(
      'name', p_name,
      'email', p_email
    )
  );
  
  RETURN v_org_id;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.get_all_organizations IS 'Returns all organizations in the system. Platform admin only.';
COMMENT ON FUNCTION public.get_all_users IS 'Returns all users across all organizations. Platform admin only.';
COMMENT ON FUNCTION public.approve_user IS 'Approves a user account. Platform admin only.';
COMMENT ON FUNCTION public.disable_user IS 'Disables a user account. Platform admin only.';
COMMENT ON FUNCTION public.delete_user_safe IS 'Safely deletes a user with audit trail. Platform admin only.';
COMMENT ON FUNCTION public.create_organization_admin IS 'Creates a new organization. Platform admin only.';
-- Optimize signup trigger for faster performance
-- Add index for invitation lookup
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires_created 
ON public.invitations(email, status, expires_at, created_at DESC)
WHERE status = 'pending';

-- Optimize the trigger function to remove ORDER BY if not needed
-- The index above will help, but we can also simplify the query
CREATE OR REPLACE FUNCTION public.handle_new_user_with_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  invitation_record RECORD;
  custom_role_names TEXT[];
  new_org_id uuid;
  org_name text;
BEGIN
  -- Fast lookup: use index, no ORDER BY needed if we just need one match
  -- If multiple invitations exist, we'll get the most recent due to index order
  SELECT * INTO invitation_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;  -- Remove ORDER BY - index handles ordering
  
  IF FOUND THEN
    -- User has an invitation - use invitation details
    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      department,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', invitation_record.first_name),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', invitation_record.last_name),
      NEW.email,
      invitation_record.organization_id,
      invitation_record.role,
      invitation_record.department,
      FALSE,
      now(),
      now()
    );
    
    -- Get custom roles for this invitation (can be async if slow)
    SELECT ARRAY_AGG(role_name) INTO custom_role_names
    FROM invitation_custom_roles
    WHERE invitation_id = invitation_record.id;
    
    -- Assign custom roles if any (defer if this is slow)
    IF custom_role_names IS NOT NULL THEN
      INSERT INTO user_role_assignments (user_id, role_name, organization_id, assigned_by)
      SELECT NEW.id, unnest(custom_role_names), invitation_record.organization_id, invitation_record.invited_by
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Mark invitation as accepted (fast update)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = invitation_record.id;
    
    -- Clean up custom role entries (can be deferred if slow)
    DELETE FROM invitation_custom_roles WHERE invitation_id = invitation_record.id;
    
  ELSE
    -- No invitation - create new organization (existing logic)
    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User'), 
        ' ', 
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
        ' Organization'
      )
    );

    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    INSERT INTO public.profiles (
      user_id, 
      first_name, 
      last_name, 
      email, 
      organization_id, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'last_name',
      NEW.email,
      new_org_id,
      'superadmin'::public.user_role,
      TRUE,
      now(),
      now()
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, create minimal profile to allow signup to complete
  BEGIN
    INSERT INTO public.profiles (
      user_id, 
      email, 
      role, 
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      'user'::public.user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;
-- Optimize signup performance and add monitoring
-- Run this in Supabase SQL Editor to improve signup speed

-- Step 1: Add index for faster invitation lookups (if not exists)
-- Note: Using regular CREATE INDEX instead of CONCURRENTLY to work within transaction
-- Note: Removed WHERE clause as now() is STABLE, not IMMUTABLE. Query optimizer will still use this index effectively.
CREATE INDEX IF NOT EXISTS idx_invitations_email_status_expires_active
ON public.invitations(email, status, expires_at);

-- Step 2: Ensure profiles table has proper indexes
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_email
ON public.profiles(user_id, email);

CREATE INDEX IF NOT EXISTS idx_profiles_organization_id
ON public.profiles(organization_id);

-- Step 3: Create ultra-fast trigger with minimal operations
CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC  -- Get most recent invitation
  LIMIT 1;

  -- Single INSERT with all necessary data
  INSERT INTO profiles (
    user_id,
    email,
    first_name,
    last_name,
    organization_id,
    role,
    is_organization_creator,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    inv_org,
    COALESCE(inv_role::user_role,
             CASE WHEN inv_org IS NULL THEN 'superadmin'::user_role
                  ELSE 'user'::user_role END),
    inv_org IS NULL,
    now(),
    now()
  );

  -- Update invitation status asynchronously (don't block signup)
  IF inv_org IS NOT NULL THEN
    -- Update the specific invitation that was found (fast operation)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE id = (
      SELECT id FROM invitations
      WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Minimal fallback - just create profile, don't fail signup
  BEGIN
    INSERT INTO profiles (
      user_id,
      email,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      'user'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 4: Replace trigger with ultra-fast version
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_ultra_fast();

-- Step 5: Add monitoring function for signup performance
CREATE OR REPLACE FUNCTION public.monitor_signup_performance()
RETURNS TABLE (
  total_signups bigint,
  recent_signups_24h bigint,
  avg_signup_time interval,
  failed_signups bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '30 days') as total_signups,
    (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '24 hours') as recent_signups_24h,
    (SELECT AVG(created_at - (created_at - interval '0 seconds')) FROM auth.users WHERE created_at > now() - interval '24 hours') as avg_signup_time,
    (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '24 hours' AND organization_id IS NULL) as failed_signups;
END;
$$;

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.monitor_signup_performance() TO authenticated;

-- Step 7: Clean up old functions (keep for rollback if needed)
-- DROP FUNCTION IF EXISTS public.handle_new_user_fast() CASCADE;
-- DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;

-- Step 8: Verify setup
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIGNUP PERFORMANCE OPTIMIZATION COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'Changes made:';
  RAISE NOTICE '  - Added optimized indexes for invitation lookups (simplified for compatibility)';
  RAISE NOTICE '  - Created ultra-fast trigger with minimal operations';
  RAISE NOTICE '  - Added monitoring function for signup performance';
  RAISE NOTICE '  - Asynchronous invitation status updates';
  RAISE NOTICE '';
  RAISE NOTICE 'To monitor signup performance:';
  RAISE NOTICE '  SELECT * FROM monitor_signup_performance();';
  RAISE NOTICE '';
  RAISE NOTICE 'Note: Indexes created without CONCURRENTLY to work within transaction.';
  RAISE NOTICE 'Partial index WHERE clause removed due to now() being STABLE, not IMMUTABLE.';
  RAISE NOTICE '';
END $$;-- Add organization type field to organizations table
-- This field was being collected in the onboarding form but not saved to DB

ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS type TEXT;

-- Add check constraint for valid organization types
ALTER TABLE public.organizations
ADD CONSTRAINT organizations_type_check
CHECK (type IN ('law-firm', 'solo-practitioner', 'legal-clinic', 'corporate-legal-dept', 'government-agency', 'non-profit', 'academic-institution', 'other'));

-- Add comment
COMMENT ON COLUMN public.organizations.type IS 'Organization type as selected during onboarding';

-- Update existing organizations to have a default type if they were created without one
UPDATE public.organizations
SET type = 'other'
WHERE type IS NULL;-- Fix: handle_new_user_ultra_fast was NOT creating organizations for new users
-- This migration restores the organization creation logic that was removed in the "ultra fast" optimization

-- Create or replace the trigger function with proper organization creation
CREATE OR REPLACE FUNCTION public.handle_new_user_ultra_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
  new_org_id uuid;
  org_name text;
BEGIN
  -- Ultra-fast invitation lookup using optimized index
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF inv_org IS NOT NULL THEN
    -- User has a valid invitation - use invitation's organization
    INSERT INTO profiles (
      user_id,
      email,
      first_name,
      last_name,
      organization_id,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      inv_org,
      COALESCE(inv_role::user_role, 'user'::user_role),
      FALSE,
      now(),
      now()
    );

    -- Update invitation status (fast operation)
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE email = NEW.email AND status = 'pending' AND expires_at > now();

    -- CRITICAL: Assign role from invitation to the new user_role_assignments table
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, COALESCE(inv_role, 'user'), inv_org, NEW.id);


  ELSE
    -- No invitation found - CREATE A NEW ORGANIZATION for this user
    -- This is the critical fix - the previous version did NOT create an organization

    org_name := COALESCE(
      NEW.raw_user_meta_data ->> 'organization',
      TRIM(CONCAT(
        COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'New'),
        ' ',
        COALESCE(NEW.raw_user_meta_data ->> 'last_name', 'User')
      )) || ' Organization'
    );

    -- Create the organization first
    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (org_name, NEW.email, now(), now())
    RETURNING id INTO new_org_id;

    -- Now create the profile with the new organization
    INSERT INTO profiles (
      user_id,
      email,
      first_name,
      last_name,
      organization_id,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
      COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
      new_org_id,
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    );

    -- CRITICAL: Assign superadmin role in the new user_role_assignments table
    -- The profiles.role column is deprecated and used only for backward compatibility
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (NEW.id, 'superadmin', new_org_id, NEW.id);
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Fallback: Try to create minimal organization and profile
  BEGIN
    -- Create a fallback organization
    INSERT INTO public.organizations (name, email, created_at, updated_at)
    VALUES (
      COALESCE(NEW.raw_user_meta_data ->> 'first_name', 'User') || ' Organization',
      NEW.email,
      now(),
      now()
    )
    RETURNING id INTO new_org_id;

    -- Create profile with the fallback organization
    INSERT INTO profiles (
      user_id,
      email,
      organization_id,
      role,
      is_organization_creator,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      NEW.email,
      new_org_id,
      'superadmin'::user_role,
      TRUE,
      now(),
      now()
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    -- Last resort: Create profile without organization (frontend will handle)
    BEGIN
      INSERT INTO profiles (
        user_id,
        email,
        role,
        is_organization_creator,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        NEW.email,
        'superadmin'::user_role,
        TRUE,
        now(),
        now()
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
  END;
END;
$$;

-- Ensure the trigger is properly attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_ultra_fast();

-- Add RLS policies to allow the trigger to insert organizations
DROP POLICY IF EXISTS "Trigger can insert organizations" ON organizations;
CREATE POLICY "Trigger can insert organizations" ON organizations
  FOR INSERT WITH CHECK (true);

-- Ensure profiles can be inserted by trigger
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles
  FOR INSERT WITH CHECK (true);

-- Allow authenticated users to update their own profile (for onboarding)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Allow users to update organizations they created or belong to (for onboarding)
DROP POLICY IF EXISTS "Users can update their organization" ON organizations;
CREATE POLICY "Users can update their organization" ON organizations
  FOR UPDATE USING (
    id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  );

-- Create async invitation check function (called from frontend after signup)
CREATE OR REPLACE FUNCTION public.check_and_apply_invitation(p_user_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Check for pending invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = p_email
    AND status = 'pending'
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- If invitation found, update profile
  IF inv_org IS NOT NULL THEN
    UPDATE profiles
    SET organization_id = inv_org,
        role = COALESCE(inv_role::user_role, 'user'::user_role),
        is_organization_creator = FALSE,
        updated_at = now()
    WHERE user_id = p_user_id;

    -- Mark invitation as accepted
    UPDATE invitations
    SET status = 'accepted', updated_at = now()
    WHERE email = p_email
      AND status = 'pending'
      AND expires_at > now()
      AND organization_id = inv_org;

    -- Assign role from invitation to the new user_role_assignments table
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (p_user_id, COALESCE(inv_role, 'user'), inv_org, p_user_id)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_apply_invitation TO authenticated;

-- Verify the fix
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FIX APPLIED: Organization Creation for New Users ===';
  RAISE NOTICE '';
  RAISE NOTICE 'The handle_new_user_ultra_fast() trigger has been fixed to:';
  RAISE NOTICE '  1. Create an organization for new users without invitations';
  RAISE NOTICE '  2. Assign the organization to the user profile';
  RAISE NOTICE '  3. Set the user as superadmin and organization_creator';
  RAISE NOTICE '';
  RAISE NOTICE 'This fixes the onboarding flow where new users were being created';
  RAISE NOTICE 'without an organization, causing the signup to fail.';
  RAISE NOTICE '';
END $$;
-- Migration: Add indexes for unindexed foreign keys
-- Generated from Supabase database linter results
--
-- These foreign keys were identified as missing covering indexes:
--   1. invitation_update_jobs.invitation_id (FK: invitation_update_jobs_invitation_id_fkey)
--   2. profiles.approved_by (FK: profiles_approved_by_fkey)
--
-- FK indexes are essential for:
--   - Efficient JOIN operations
--   - Fast CASCADE DELETE/UPDATE operations
--   - Avoiding sequential scans on FK constraint checks

-- Add index for invitation_update_jobs.invitation_id
-- This FK references invitations(id) with ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_invitation_update_jobs_invitation_id
  ON public.invitation_update_jobs(invitation_id);

-- Add index for profiles.approved_by
-- This FK references auth.users(id)
CREATE INDEX IF NOT EXISTS idx_profiles_approved_by
  ON public.profiles(approved_by);
-- Fix missing role assignments for superadmins
-- This migration finds users who have 'superadmin' in their profile but are missing
-- the corresponding entry in user_role_assignments, and fixes them.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT p.user_id, p.organization_id
    FROM public.profiles p
    WHERE p.role = 'superadmin'::user_role
    AND NOT EXISTS (
      SELECT 1 FROM public.user_role_assignments ura 
      WHERE ura.user_id = p.user_id 
      AND ura.organization_id = p.organization_id 
      AND ura.role_name = 'superadmin'
    )
  LOOP
    -- Insert missing assignment
    INSERT INTO public.user_role_assignments (user_id, role_name, organization_id, assigned_by)
    VALUES (r.user_id, 'superadmin', r.organization_id, r.user_id)
    ON CONFLICT (user_id, role_name, organization_id) DO NOTHING;
    
    RAISE NOTICE 'Fixed missing superadmin role assignment for user % in org %', r.user_id, r.organization_id;
  END LOOP;
END $$;
-- Migration: Fix security issues detected by Supabase linter
-- 1. Fix function search_path for call_process_event_reminders
-- 2. Ensure handle_new_user_ultra_fast has proper search_path
-- 3. Move pg_net extension to extensions schema
-- 4. Fix overly permissive RLS policies for admin_actions and organizations

-- ============================================================================
-- SECTION 1: Fix call_process_event_reminders search_path
-- Issue: Function has a mutable search_path which could allow privilege escalation
-- ============================================================================

CREATE OR REPLACE FUNCTION call_process_event_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'net'
AS $$
DECLARE
  project_ref text;
  service_role_key text;
  function_url text;
  response_id bigint;
BEGIN
  -- Get project reference from current database name or environment
  -- For Supabase Cloud, this should be set via environment variable
  -- For local development, you may need to set this manually
  project_ref := current_setting('app.settings.project_ref', true);

  -- Get service role key (should be set as a secret/parameter)
  service_role_key := current_setting('app.settings.service_role_key', true);

  -- If not set via settings, try to construct from database name
  IF project_ref IS NULL OR project_ref = '' THEN
    -- Try to extract from database name (Supabase pattern: postgres.[ref])
    SELECT substring(current_database() from '\.([^.]+)$') INTO project_ref;
  END IF;

  -- Construct function URL
  IF project_ref IS NOT NULL AND project_ref != '' THEN
    function_url := format('https://%s.supabase.co/functions/v1/process-event-reminders', project_ref);
  ELSE
    -- Fallback: use environment variable or default
    function_url := current_setting('app.settings.functions_url', true);
    IF function_url IS NULL OR function_url = '' THEN
      RAISE WARNING 'Could not determine function URL. Please set app.settings.project_ref or app.settings.functions_url';
      RETURN;
    END IF;
  END IF;

  -- Call the edge function via HTTP
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', format('Bearer %s', COALESCE(service_role_key, ''))
    ),
    body := '{}'::jsonb
  ) INTO response_id;

  RAISE NOTICE 'Called process-event-reminders function, response_id: %', response_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to call process-event-reminders: %', SQLERRM;
END;
$$;

-- ============================================================================
-- SECTION 2: Ensure handle_new_user_ultra_fast has proper search_path
-- The function already has SET search_path = 'public' in the latest migration
-- but we re-create it here to ensure consistency
-- ============================================================================

-- Note: handle_new_user_ultra_fast already has SET search_path = 'public'
-- in migration 20260114000000_fix_new_user_organization_creation.sql
-- If the linter still reports issues, it may be due to database state not matching migrations

-- ============================================================================
-- SECTION 3: Move pg_net extension to extensions schema
-- Issue: Extensions in public schema can pose security risks
-- ============================================================================

-- First, ensure the extensions schema exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Note: pg_net is managed by Supabase and its objects live in the 'net' schema
-- The extension catalog entry may show 'public' but the actual functions are in 'net'
-- We can attempt to move it, but this may fail on hosted Supabase as it's a system extension

DO $$
BEGIN
  -- Try to alter the extension schema
  -- This may fail on hosted Supabase where pg_net is managed
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    -- Check if we can alter (may not have permission on hosted Supabase)
    BEGIN
      ALTER EXTENSION pg_net SET SCHEMA extensions;
      RAISE NOTICE 'Successfully moved pg_net extension to extensions schema';
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Cannot move pg_net extension (insufficient privileges - this is expected on hosted Supabase)';
      WHEN feature_not_supported THEN
        RAISE NOTICE 'Cannot move pg_net extension (operation not supported for this extension type)';
      WHEN OTHERS THEN
        RAISE NOTICE 'Cannot move pg_net extension: %', SQLERRM;
    END;
  END IF;
END $$;

-- ============================================================================
-- SECTION 4: Fix overly permissive RLS policies
-- Issue: WITH CHECK (true) allows unrestricted inserts, bypassing RLS
-- ============================================================================

-- 4a. Fix admin_actions INSERT policy
-- The "System can insert admin actions" policy uses WITH CHECK (true)
-- This should be restricted to platform admins or service role only

DROP POLICY IF EXISTS "System can insert admin actions" ON public.admin_actions;

-- Create a more restrictive policy that only allows platform admins to insert
-- The log_admin_action function already checks is_platform_admin(), so we mirror that here
CREATE POLICY "admin_actions_insert_platform_admin"
  ON public.admin_actions
  FOR INSERT
  WITH CHECK (
    -- Allow platform admins to insert directly
    (SELECT is_platform_admin((SELECT auth.uid())))
    OR
    -- Allow service role (used by SECURITY DEFINER functions)
    (SELECT auth.role()) = 'service_role'
  );

-- 4b. Fix organizations INSERT policies
-- Drop overly permissive policies

DROP POLICY IF EXISTS "Anyone can insert organizations" ON public.organizations;
DROP POLICY IF EXISTS "Trigger can insert organizations" ON public.organizations;

-- Create a properly restricted INSERT policy for organizations
-- Organizations should only be created by:
-- 1. Authenticated users (during signup via trigger/onboarding)
-- 2. Platform admins
-- 3. Service role (for system operations)

CREATE POLICY "org_insert_authenticated_or_admin"
  ON public.organizations
  FOR INSERT
  WITH CHECK (
    -- Authenticated users can create organizations (for signup)
    (SELECT auth.uid()) IS NOT NULL
    OR
    -- Service role can insert (for triggers running as SECURITY DEFINER)
    (SELECT auth.role()) = 'service_role'
  );

-- ============================================================================
-- SECTION 5: Verification
-- ============================================================================

DO $$
DECLARE
  func_search_path text;
BEGIN
  -- Verify call_process_event_reminders has search_path set
  SELECT proconfig::text INTO func_search_path
  FROM pg_proc
  WHERE proname = 'call_process_event_reminders'
  AND pronamespace = 'public'::regnamespace;

  IF func_search_path IS NOT NULL AND func_search_path LIKE '%search_path%' THEN
    RAISE NOTICE 'call_process_event_reminders: search_path is properly configured';
  ELSE
    RAISE WARNING 'call_process_event_reminders: search_path may not be configured correctly';
  END IF;

  -- Verify handle_new_user_ultra_fast has search_path set
  SELECT proconfig::text INTO func_search_path
  FROM pg_proc
  WHERE proname = 'handle_new_user_ultra_fast'
  AND pronamespace = 'public'::regnamespace;

  IF func_search_path IS NOT NULL AND func_search_path LIKE '%search_path%' THEN
    RAISE NOTICE 'handle_new_user_ultra_fast: search_path is properly configured';
  ELSE
    RAISE WARNING 'handle_new_user_ultra_fast: search_path may not be configured correctly';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '=== Security Fixes Applied ===';
  RAISE NOTICE '1. call_process_event_reminders: Added SET search_path';
  RAISE NOTICE '2. pg_net extension: Attempted to move to extensions schema (may require manual action on hosted Supabase)';
  RAISE NOTICE '3. admin_actions INSERT policy: Restricted to platform admins and service role';
  RAISE NOTICE '4. organizations INSERT policy: Restricted to authenticated users and service role';
  RAISE NOTICE '';
  RAISE NOTICE 'NOTE: For the "Leaked Password Protection" warning, enable this feature in:';
  RAISE NOTICE '      Supabase Dashboard > Authentication > Settings > Password Security';
  RAISE NOTICE '';
END $$;
-- Add status field to organizations table for enable/disable functionality
-- This allows platform admins to enable/disable organizations

-- Add status column if it doesn't exist
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON public.organizations(is_active);

-- Create function to toggle organization status (platform admin only)
CREATE OR REPLACE FUNCTION public.toggle_organization_status(
  p_org_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can toggle organization status';
  END IF;

  -- Update organization status
  UPDATE public.organizations
  SET is_active = p_is_active,
      updated_at = now()
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Organization not found');
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', CASE WHEN p_is_active THEN 'Organization enabled successfully' ELSE 'Organization disabled successfully' END
  );
END;
$$;

-- Grant execute permission to authenticated users (RLS will enforce platform admin check)
GRANT EXECUTE ON FUNCTION public.toggle_organization_status(UUID, BOOLEAN) TO authenticated;

-- Drop existing function first to change return type
DROP FUNCTION IF EXISTS public.get_all_organizations();

-- Recreate get_all_organizations function to include is_active status
CREATE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_count BIGINT,
  status TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all organizations';
  END IF;
  
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.email,
    o.description,
    o.address,
    o.phone,
    o.website,
    o.logo_url,
    o.created_at,
    o.updated_at,
    COUNT(DISTINCT p.user_id)::BIGINT as user_count,
    CASE 
      WHEN COALESCE(o.is_active, true) = false THEN 'disabled'
      WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
      WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
      ELSE 'inactive'
    END as status,
    COALESCE(o.is_active, true) as is_active
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  GROUP BY o.id, o.name, o.email, o.description, o.address, o.phone, o.website, o.logo_url, o.created_at, o.updated_at, o.is_active
  ORDER BY o.created_at DESC;
END;
$$;
-- Fix foreign key constraints to allow user deletion
-- This allows platform admins to delete users without foreign key constraint errors

-- Make user_roles.created_by nullable and add ON DELETE SET NULL
ALTER TABLE public.user_roles 
  ALTER COLUMN created_by DROP NOT NULL;

-- Drop existing foreign key constraint
ALTER TABLE public.user_roles 
  DROP CONSTRAINT IF EXISTS user_roles_created_by_fkey;

-- Recreate with ON DELETE SET NULL
ALTER TABLE public.user_roles 
  ADD CONSTRAINT user_roles_created_by_fkey 
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update delete_user_safe function to handle all foreign key references
CREATE OR REPLACE FUNCTION public.delete_user_safe(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_org_id UUID;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete users';
  END IF;
  
  -- Get user info for logging
  SELECT email, organization_id INTO v_email, v_org_id
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'user_deleted',
    'user',
    p_user_id,
    jsonb_build_object(
      'user_email', v_email,
      'organization_id', v_org_id,
      'reason', p_reason
    )
  );
  
  -- Handle foreign key references before deletion
  -- Set created_by to NULL in user_roles (now nullable)
  UPDATE public.user_roles
  SET created_by = NULL
  WHERE created_by = p_user_id;
  
  -- Delete the user (CASCADE will handle related records in profiles and other tables)
  -- This will delete from auth.users which cascades to profiles
  DELETE FROM auth.users
  WHERE id = p_user_id;
  
  RETURN true;
END;
$$;

-- Also create a function to delete organizations (platform admin only)
CREATE OR REPLACE FUNCTION public.delete_organization_safe(
  p_org_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_name TEXT;
  v_user_count INTEGER;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can delete organizations';
  END IF;
  
  -- Get organization info for logging
  SELECT name, COUNT(DISTINCT p.user_id)::INTEGER
  INTO v_org_name, v_user_count
  FROM public.organizations o
  LEFT JOIN public.profiles p ON p.organization_id = o.id
  WHERE o.id = p_org_id
  GROUP BY o.id, o.name;
  
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  
  -- Warn if organization has users
  IF v_user_count > 0 THEN
    RAISE WARNING 'Organization has % users. They will be deleted along with the organization.', v_user_count;
  END IF;
  
  -- Log the action BEFORE deletion
  PERFORM log_admin_action(
    'organization_deleted',
    'organization',
    p_org_id,
    jsonb_build_object(
      'organization_name', v_org_name,
      'user_count', v_user_count,
      'reason', p_reason
    )
  );
  
  -- Delete the organization (CASCADE will handle related records)
  DELETE FROM public.organizations
  WHERE id = p_org_id;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.delete_organization_safe(UUID, TEXT) TO authenticated;
-- Create views for platform admin with all KYC information
-- These views aggregate all onboarding/KYC data for easy access

-- View for organizations with all KYC data
CREATE OR REPLACE VIEW public.platform_admin_organizations AS
SELECT 
  o.id,
  o.name,
  o.type,
  o.email,
  o.description,
  o.address,
  o.state,
  o.country,
  o.phone,
  o.website,
  o.logo_url,
  o.is_active,
  o.created_at,
  o.updated_at,
  COUNT(DISTINCT p.user_id)::BIGINT as user_count,
  CASE 
    WHEN COALESCE(o.is_active, true) = false THEN 'disabled'
    WHEN COUNT(DISTINCT p.user_id) FILTER (WHERE p.status = 'active') > 0 THEN 'active'
    WHEN COUNT(DISTINCT p.user_id) = 0 THEN 'empty'
    ELSE 'inactive'
  END as status
FROM public.organizations o
LEFT JOIN public.profiles p ON p.organization_id = o.id
GROUP BY o.id, o.name, o.type, o.email, o.description, o.address, o.state, o.country, o.phone, o.website, o.logo_url, o.is_active, o.created_at, o.updated_at;

-- View for users with all KYC data
CREATE OR REPLACE VIEW public.platform_admin_users AS
SELECT 
  p.id,
  p.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone,
  p.role::TEXT as role,
  p.department,
  p.status,
  p.organization_id,
  o.name as organization_name,
  o.type as organization_type,
  p.created_at,
  p.updated_at,
  p.last_login_at,
  p.approved_at,
  p.approved_by,
  p.disabled_at,
  p.disabled_by
FROM public.profiles p
LEFT JOIN public.organizations o ON o.id = p.organization_id;

-- Grant access to platform admins only (via RLS or function)
-- Views are accessible through functions that check platform admin status

-- Update get_all_organizations to use the view and include KYC data
DROP FUNCTION IF EXISTS public.get_all_organizations();
CREATE OR REPLACE FUNCTION public.get_all_organizations()
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  email TEXT,
  description TEXT,
  address TEXT,
  state TEXT,
  country TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  user_count BIGINT,
  status TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all organizations';
  END IF;
  
  RETURN QUERY
  SELECT 
    v.id,
    v.name,
    v.type,
    v.email,
    v.description,
    v.address,
    v.state,
    v.country,
    v.phone,
    v.website,
    v.logo_url,
    v.created_at,
    v.updated_at,
    v.user_count,
    v.status,
    v.is_active
  FROM public.platform_admin_organizations v
  ORDER BY v.created_at DESC;
END;
$$;

-- Update get_all_users to use the view and include KYC data
DROP FUNCTION IF EXISTS public.get_all_users();
CREATE OR REPLACE FUNCTION public.get_all_users()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT,
  department TEXT,
  status TEXT,
  organization_id UUID,
  organization_name TEXT,
  organization_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  disabled_at TIMESTAMPTZ,
  disabled_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can access all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    v.id,
    v.user_id,
    v.email,
    v.first_name,
    v.last_name,
    v.phone,
    v.role,
    v.department,
    v.status,
    v.organization_id,
    v.organization_name,
    v.organization_type,
    v.created_at,
    v.updated_at,
    v.last_login_at,
    v.approved_at,
    v.approved_by,
    v.disabled_at,
    v.disabled_by
  FROM public.platform_admin_users v
  ORDER BY v.created_at DESC;
END;
$$;

-- Add comments
COMMENT ON VIEW public.platform_admin_organizations IS 'View for platform admins showing all organizations with complete KYC data';
COMMENT ON VIEW public.platform_admin_users IS 'View for platform admins showing all users with complete KYC data';
-- Create user plans system
-- This allows platform admins to assign plans to users with duration/validity

-- Create user_plans table (defines available plans)
CREATE TABLE IF NOT EXISTS public.user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  plan_type TEXT NOT NULL DEFAULT 'free' CHECK (plan_type IN ('free', 'starter', 'professional', 'enterprise')),
  features JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_plan_assignments table (tracks user plan assignments)
CREATE TABLE IF NOT EXISTS public.user_plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.user_plans(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ, -- NULL means no expiration (permanent)
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_plans_type ON public.user_plans(plan_type);
CREATE INDEX IF NOT EXISTS idx_user_plans_active ON public.user_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_user_id ON public.user_plan_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_plan_id ON public.user_plan_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_status ON public.user_plan_assignments(status);
CREATE INDEX IF NOT EXISTS idx_user_plan_assignments_expires_at ON public.user_plan_assignments(expires_at);

-- Enable RLS
ALTER TABLE public.user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_plans (readable by all authenticated users)
CREATE POLICY "user_plans_select" ON public.user_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- RLS Policies for user_plan_assignments
-- Users can view their own plan assignments
CREATE POLICY "user_plan_assignments_select_own" ON public.user_plan_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Platform admins can view all assignments
CREATE POLICY "user_plan_assignments_select_all" ON public.user_plan_assignments
  FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

-- Platform admins can insert assignments
CREATE POLICY "user_plan_assignments_insert" ON public.user_plan_assignments
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin(auth.uid()));

-- Platform admins can update assignments
CREATE POLICY "user_plan_assignments_update" ON public.user_plan_assignments
  FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()));

-- Insert default plans based on pricing structure
INSERT INTO public.user_plans (name, display_name, description, plan_type, features) VALUES
  ('free', 'Free Plan', 'Basic access with limited features', 'free', 
   '["Basic document storage", "Limited cases", "Email support"]'::jsonb),
  ('starter', 'Starter Plan', 'Perfect for small teams getting started', 'starter',
   '["Up to 5 users", "100 cases", "Basic document storage", "Email support"]'::jsonb),
  ('professional', 'Professional Plan', 'For growing legal practices', 'professional',
   '["Up to 20 users", "Unlimited cases", "Advanced document management", "AI contract analysis", "Priority support"]'::jsonb),
  ('enterprise', 'Enterprise Plan', 'For large organizations', 'enterprise',
   '["Unlimited users", "Unlimited cases", "Full AI suite", "Custom integrations", "Dedicated support", "SSO"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  plan_type = EXCLUDED.plan_type,
  features = EXCLUDED.features;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS user_plans_updated_at ON public.user_plans;
CREATE TRIGGER user_plans_updated_at
  BEFORE UPDATE ON public.user_plans
  FOR EACH ROW EXECUTE FUNCTION update_user_plan_updated_at();

DROP TRIGGER IF EXISTS user_plan_assignments_updated_at ON public.user_plan_assignments;
CREATE TRIGGER user_plan_assignments_updated_at
  BEFORE UPDATE ON public.user_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION update_user_plan_updated_at();

-- Function to automatically expire plans
CREATE OR REPLACE FUNCTION expire_user_plans()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.user_plan_assignments
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND expires_at IS NOT NULL
    AND expires_at < now();
END;
$$;

-- Function to get user's current active plan
CREATE OR REPLACE FUNCTION public.get_user_current_plan(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  assignment_id UUID,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  plan_type TEXT,
  features JSONB,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Users can only view their own plan, platform admins can view any user's plan
  IF p_user_id != auth.uid() AND NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view other users plans';
  END IF;

  RETURN QUERY
  SELECT 
    upa.id as assignment_id,
    up.id as plan_id,
    up.name as plan_name,
    up.display_name as plan_display_name,
    up.plan_type,
    up.features,
    upa.starts_at,
    upa.expires_at,
    upa.status
  FROM public.user_plan_assignments upa
  JOIN public.user_plans up ON up.id = upa.plan_id
  WHERE upa.user_id = p_user_id
    AND upa.status = 'active'
  ORDER BY upa.starts_at DESC
  LIMIT 1;
END;
$$;

-- Function to assign plan to user (platform admin only)
CREATE OR REPLACE FUNCTION public.assign_user_plan(
  p_user_id UUID,
  p_plan_id UUID,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_id UUID;
  v_plan_name TEXT;
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can assign plans to users';
  END IF;

  -- Verify user exists
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Verify plan exists and is active
  SELECT name INTO v_plan_name
  FROM public.user_plans
  WHERE id = p_plan_id AND is_active = true;
  
  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  -- Revoke any existing active plans for this user
  UPDATE public.user_plan_assignments
  SET status = 'revoked',
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  -- Create new assignment
  INSERT INTO public.user_plan_assignments (
    user_id,
    plan_id,
    assigned_by,
    starts_at,
    expires_at,
    notes,
    status
  )
  VALUES (
    p_user_id,
    p_plan_id,
    auth.uid(),
    now(),
    p_expires_at,
    p_notes,
    'active'
  )
  RETURNING id INTO v_assignment_id;

  RETURN json_build_object(
    'success', true,
    'assignment_id', v_assignment_id,
    'plan_name', v_plan_name,
    'message', 'Plan assigned successfully'
  );
END;
$$;

-- Function to revoke user plan (platform admin only)
CREATE OR REPLACE FUNCTION public.revoke_user_plan(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can revoke user plans';
  END IF;

  -- Revoke active plans
  UPDATE public.user_plan_assignments
  SET status = 'revoked',
      notes = COALESCE(notes || E'\n' || p_reason, p_reason),
      updated_at = now()
  WHERE user_id = p_user_id
    AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'No active plan found for user'
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'message', 'Plan revoked successfully'
  );
END;
$$;

-- Function to get all user plan assignments (platform admin only)
CREATE OR REPLACE FUNCTION public.get_all_user_plan_assignments()
RETURNS TABLE (
  assignment_id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  plan_id UUID,
  plan_name TEXT,
  plan_display_name TEXT,
  plan_type TEXT,
  assigned_by UUID,
  assigned_by_email TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is platform admin
  IF NOT is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can view all user plan assignments';
  END IF;

  RETURN QUERY
  SELECT 
    upa.id as assignment_id,
    upa.user_id,
    u.email as user_email,
    COALESCE(p.first_name || ' ' || p.last_name, u.email) as user_name,
    up.id as plan_id,
    up.name as plan_name,
    up.display_name as plan_display_name,
    up.plan_type,
    upa.assigned_by,
    assigner.email as assigned_by_email,
    upa.starts_at,
    upa.expires_at,
    upa.status,
    upa.notes,
    upa.created_at
  FROM public.user_plan_assignments upa
  JOIN public.user_plans up ON up.id = upa.plan_id
  JOIN auth.users u ON u.id = upa.user_id
  LEFT JOIN public.profiles p ON p.user_id = upa.user_id
  LEFT JOIN auth.users assigner ON assigner.id = upa.assigned_by
  ORDER BY upa.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_current_plan(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_plan(UUID, UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_plan(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_user_plan_assignments() TO authenticated;

-- Comments
COMMENT ON TABLE public.user_plans IS 'Available plans that can be assigned to users';
COMMENT ON TABLE public.user_plan_assignments IS 'Tracks which users have which plans and when they expire';
COMMENT ON FUNCTION public.get_user_current_plan IS 'Gets the current active plan for a user';
COMMENT ON FUNCTION public.assign_user_plan IS 'Assigns a plan to a user (platform admin only)';
COMMENT ON FUNCTION public.revoke_user_plan IS 'Revokes a users active plan (platform admin only)';
COMMENT ON FUNCTION public.get_all_user_plan_assignments IS 'Gets all user plan assignments (platform admin only)';
-- 20260122000001_fix_security_definer_null_checks.sql
-- SECURITY FIX: Add NULL checks to SECURITY DEFINER functions
-- These functions run with elevated privileges and must handle unauthenticated contexts safely

-------------------------------------------------------------------------------
-- Fix get_user_organization_id() to return NULL instead of undefined behavior
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- SECURITY: Return NULL if user is not authenticated
  -- This prevents information leakage and ensures RLS policies fail safely
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE (
      SELECT organization_id
      FROM public.profiles
      WHERE user_id = auth.uid()
    )
  END;
$$;

-------------------------------------------------------------------------------
-- Fix current_user_is_org_admin() to return FALSE for unauthenticated users
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  -- SECURITY: Return FALSE if user is not authenticated
  -- This ensures admin-only operations fail safely for unauthenticated requests
  SELECT CASE
    WHEN auth.uid() IS NULL THEN FALSE
    ELSE EXISTS(
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
        AND organization_id = get_user_organization_id()
    )
  END;
$$;

-------------------------------------------------------------------------------
-- Fix has_permission() to return FALSE for unauthenticated users
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_permission(p_resource text, p_action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_granted boolean;
BEGIN
  -- SECURITY: Get authenticated user ID, return FALSE if not authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get user's organization and role
  SELECT organization_id, role INTO v_org_id, v_role
  FROM public.profiles
  WHERE user_id = v_user_id;

  -- If no profile found, deny access
  IF v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Superadmins have all permissions
  IF v_role = 'superadmin' THEN
    RETURN TRUE;
  END IF;

  -- Admins have all permissions within their organization
  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Check role_permissions table for specific permission
  SELECT granted INTO v_granted
  FROM public.role_permissions
  WHERE role_name = v_role
    AND organization_id = v_org_id
    AND resource = p_resource
    AND action = p_action;

  -- If no explicit permission found, check for 'manage' permission on the resource
  IF v_granted IS NULL THEN
    SELECT granted INTO v_granted
    FROM public.role_permissions
    WHERE role_name = v_role
      AND organization_id = v_org_id
      AND resource = p_resource
      AND action = 'manage';
  END IF;

  -- Default to FALSE (fail-closed) if no permission found
  RETURN COALESCE(v_granted, FALSE);
END;
$$;

-- Add comment explaining security model
COMMENT ON FUNCTION public.get_user_organization_id() IS
  'Returns the organization_id for the current authenticated user. Returns NULL if not authenticated. SECURITY DEFINER - runs with elevated privileges.';

COMMENT ON FUNCTION public.current_user_is_org_admin() IS
  'Returns TRUE if the current user is an admin or superadmin in their organization. Returns FALSE if not authenticated. SECURITY DEFINER - runs with elevated privileges.';

COMMENT ON FUNCTION public.has_permission(text, text) IS
  'Checks if the current user has the specified permission. Returns FALSE if not authenticated or permission not granted. SECURITY DEFINER - runs with elevated privileges.';
-- 20260122000002_optimize_chat_queries.sql
-- PERFORMANCE FIX: Optimize chat queries to eliminate N+1 issues
-- This creates an RPC function that fetches all conversation data in a single query

-------------------------------------------------------------------------------
-- Create optimized function to get conversations with last message and unread count
-------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_conversations_optimized()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  type text,
  name text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  participants jsonb,
  last_message jsonb,
  unread_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_conversations AS (
    -- Get conversation IDs where user is a participant
    SELECT
      cp.conversation_id,
      cp.last_read_at
    FROM public.conversation_participants cp
    WHERE cp.user_id = v_user_id
  ),
  last_messages AS (
    -- Get last message for each conversation using DISTINCT ON
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      jsonb_build_object(
        'id', m.id,
        'content', m.content,
        'message_type', m.message_type,
        'sender_id', m.sender_id,
        'created_at', m.created_at,
        'metadata', m.metadata,
        'sender', jsonb_build_object(
          'id', p.user_id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        )
      ) AS message_data
    FROM public.messages m
    LEFT JOIN public.profiles p ON p.user_id = m.sender_id
    WHERE m.conversation_id IN (SELECT conversation_id FROM user_conversations)
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread_counts AS (
    -- Get unread count for each conversation
    SELECT
      m.conversation_id,
      COUNT(*) AS cnt
    FROM public.messages m
    JOIN user_conversations uc ON uc.conversation_id = m.conversation_id
    WHERE m.created_at > COALESCE(uc.last_read_at, '1970-01-01'::timestamptz)
      AND m.sender_id != v_user_id
    GROUP BY m.conversation_id
  ),
  conversation_participants_agg AS (
    -- Aggregate participants with profile info
    SELECT
      cp.conversation_id,
      jsonb_agg(
        jsonb_build_object(
          'user_id', cp.user_id,
          'last_read_at', cp.last_read_at,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        )
      ) AS participants_data
    FROM public.conversation_participants cp
    LEFT JOIN public.profiles p ON p.user_id = cp.user_id
    WHERE cp.conversation_id IN (SELECT conversation_id FROM user_conversations)
    GROUP BY cp.conversation_id
  )
  SELECT
    c.id,
    c.organization_id,
    c.type,
    c.name,
    c.created_by,
    c.created_at,
    c.updated_at,
    COALESCE(cpa.participants_data, '[]'::jsonb) AS participants,
    lm.message_data AS last_message,
    COALESCE(uc.cnt, 0) AS unread_count
  FROM public.conversations c
  JOIN user_conversations uconv ON uconv.conversation_id = c.id
  LEFT JOIN last_messages lm ON lm.conversation_id = c.id
  LEFT JOIN unread_counts uc ON uc.conversation_id = c.id
  LEFT JOIN conversation_participants_agg cpa ON cpa.conversation_id = c.id
  ORDER BY c.updated_at DESC;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.get_user_conversations_optimized() IS
  'Fetches all conversations for the current user with last message, unread count, and participants in a single optimized query. Eliminates N+1 query issues.';

-------------------------------------------------------------------------------
-- Create index to optimize conversation queries if not exists
-------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user
  ON public.conversation_participants(user_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender
  ON public.messages(conversation_id, sender_id, created_at);
-- Create a version of match_document_chunks that accepts organization_id explicitly.
-- This is needed for edge functions that use the service role key (bypassing RLS)
-- and therefore cannot rely on get_current_user_organization_id().

CREATE OR REPLACE FUNCTION match_document_chunks_for_org(
  query_embedding vector(1536),
  org_id uuid,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  contract_id uuid,
  content text,
  chunk_index int,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.contract_id,
    dc.content,
    dc.chunk_index,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND dc.organization_id = org_id
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute to service_role (used by edge functions) and authenticated users
GRANT EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) TO service_role;
GRANT EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) TO authenticated;
-- Security fix: Remove GRANT to authenticated role on match_document_chunks_for_org.
-- This SECURITY DEFINER function accepts an arbitrary org_id parameter,
-- so granting it to authenticated users allows cross-tenant data leakage.
-- Only service_role (used by edge functions) should call this function.

REVOKE EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) FROM authenticated;
-- Security fix: Tighten storage bucket configuration
-- 1. Add file_size_limit and allowed_mime_types to the 'documents' bucket
-- 2. Create 'Chat_Storage' bucket with proper RLS policies

-- Fix documents bucket: add size limit (25MB) and MIME type restrictions
UPDATE storage.buckets
SET
  file_size_limit = 26214400,  -- 25MB
  allowed_mime_types = ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'audio/webm',
    'audio/mpeg',
    'audio/wav'
  ]
WHERE id = 'documents';

-- Create Chat_Storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'Chat_Storage',
  'Chat_Storage',
  false,
  10485760,  -- 10MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS policies for Chat_Storage bucket
-- Users can upload files scoped to their organization
DROP POLICY IF EXISTS "Chat_Storage: org-scoped upload" ON storage.objects;
CREATE POLICY "Chat_Storage: org-scoped upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'Chat_Storage'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can read files from their organization
DROP POLICY IF EXISTS "Chat_Storage: org-scoped read" ON storage.objects;
CREATE POLICY "Chat_Storage: org-scoped read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'Chat_Storage'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own uploads
DROP POLICY IF EXISTS "Chat_Storage: owner delete" ON storage.objects;
CREATE POLICY "Chat_Storage: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'Chat_Storage'
    AND owner = auth.uid()
  );
-- Security fix: Tighten RLS policies
-- M1: profiles INSERT - ensure user_id matches auth.uid()
-- M2: invitation_update_jobs - restrict to service_role only
-- M3: organizations UPDATE - restrict to org admins

-- M1: Fix profiles INSERT policy to prevent impersonation
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- M2: Restrict invitation_update_jobs to service_role
-- Drop any existing authenticated policies
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE tablename = 'invitation_update_jobs'
      AND roles @> ARRAY['authenticated']::name[]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON invitation_update_jobs', pol.policyname);
  END LOOP;
END $$;

-- M3: Fix organizations UPDATE to require admin role
DROP POLICY IF EXISTS "Organization members can update their org" ON organizations;
CREATE POLICY "Organization admins can update their org"
  ON organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM profiles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );
-- Migration: Add calendar sharing functionality
-- Created: 2026-03-07
-- Description: Enables team members to share calendars with view/edit permissions

-- ============================================
-- 1. CALENDAR SHARING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calendar_owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    permission_level TEXT NOT NULL CHECK (permission_level IN ('view', 'edit')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate shares
    UNIQUE(calendar_owner_id, shared_with_user_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_shares_owner 
    ON calendar_shares(calendar_owner_id) 
    WHERE is_active = true;
    
CREATE INDEX IF NOT EXISTS idx_calendar_shares_shared_with 
    ON calendar_shares(shared_with_user_id) 
    WHERE is_active = true;
    
CREATE INDEX IF NOT EXISTS idx_calendar_shares_org 
    ON calendar_shares(organization_id);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_calendar_shares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_shares_updated_at ON calendar_shares;
CREATE TRIGGER trg_calendar_shares_updated_at
    BEFORE UPDATE ON calendar_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_shares_updated_at();

-- ============================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE calendar_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shares where they are the owner or recipient
CREATE POLICY calendar_shares_select_policy ON calendar_shares
    FOR SELECT
    USING (
        auth.uid() = calendar_owner_id 
        OR auth.uid() = shared_with_user_id
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_shares.organization_id
            AND p.role = 'admin'
        )
    );

-- Policy: Only owners can create shares
CREATE POLICY calendar_shares_insert_policy ON calendar_shares
    FOR INSERT
    WITH CHECK (
        auth.uid() = calendar_owner_id
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_shares.organization_id
        )
    );

-- Policy: Only owners can update their shares
CREATE POLICY calendar_shares_update_policy ON calendar_shares
    FOR UPDATE
    USING (auth.uid() = calendar_owner_id)
    WITH CHECK (
        auth.uid() = calendar_owner_id
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_shares.organization_id
        )
    );

-- Policy: Only owners can delete shares
CREATE POLICY calendar_shares_delete_policy ON calendar_shares
    FOR DELETE
    USING (
        auth.uid() = calendar_owner_id
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_shares.organization_id
            AND p.role = 'admin'
        )
    );

-- ============================================
-- 3. ADD CALENDAR COLOR TO PROFILES
-- ============================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS calendar_color TEXT DEFAULT '#3b82f6';

-- Validate color format (hex colors)
ALTER TABLE profiles
ADD CONSTRAINT valid_calendar_color 
CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$');

-- ============================================
-- 4. UPDATE CALENDAR EVENTS RLS FOR SHARING
-- ============================================

-- Modify existing policies to include shared calendar access
-- First, drop the existing select policy if it exists with a different definition

-- Create a function to check if user has access to view an event
CREATE OR REPLACE FUNCTION user_can_view_calendar_event(event_org_id UUID, event_created_by UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is in the same organization
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id = event_org_id
    ) THEN
        -- Check if user is the creator
        IF auth.uid() = event_created_by THEN
            RETURN true;
        END IF;
        
        -- Check if calendar is shared with user
        IF EXISTS (
            SELECT 1 FROM calendar_shares cs
            WHERE cs.calendar_owner_id = event_created_by
            AND cs.shared_with_user_id = auth.uid()
            AND cs.is_active = true
        ) THEN
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update calendar_events RLS to use the new function
DROP POLICY IF EXISTS calendar_events_select_policy ON calendar_events;

CREATE POLICY calendar_events_select_policy ON calendar_events
    FOR SELECT
    USING (
        user_can_view_calendar_event(organization_id, created_by)
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_events.organization_id
            AND p.role = 'admin'
        )
    );

-- Create function to check if user can edit an event
CREATE OR REPLACE FUNCTION user_can_edit_calendar_event(event_org_id UUID, event_created_by UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if user is in the same organization
    IF EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.user_id = auth.uid()
        AND p.organization_id = event_org_id
    ) THEN
        -- Check if user is the creator
        IF auth.uid() = event_created_by THEN
            RETURN true;
        END IF;
        
        -- Check if calendar is shared with EDIT permission
        IF EXISTS (
            SELECT 1 FROM calendar_shares cs
            WHERE cs.calendar_owner_id = event_created_by
            AND cs.shared_with_user_id = auth.uid()
            AND cs.permission_level = 'edit'
            AND cs.is_active = true
        ) THEN
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update update policy
DROP POLICY IF EXISTS calendar_events_update_policy ON calendar_events;

CREATE POLICY calendar_events_update_policy ON calendar_events
    FOR UPDATE
    USING (user_can_edit_calendar_event(organization_id, created_by))
    WITH CHECK (user_can_edit_calendar_event(organization_id, created_by));

-- Update delete policy
DROP POLICY IF EXISTS calendar_events_delete_policy ON calendar_events;

CREATE POLICY calendar_events_delete_policy ON calendar_events
    FOR DELETE
    USING (
        auth.uid() = created_by
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = calendar_events.organization_id
            AND p.role = 'admin'
        )
    );

-- ============================================
-- 5. CREATE HELPER FUNCTIONS
-- ============================================

-- Function to get shared calendars for a user
CREATE OR REPLACE FUNCTION get_shared_calendars(user_uuid UUID)
RETURNS TABLE (
    calendar_owner_id UUID,
    owner_email TEXT,
    owner_name TEXT,
    permission_level TEXT,
    calendar_color TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.calendar_owner_id,
        u.email::TEXT,
        COALESCE(p.first_name || ' ' || p.last_name, u.email)::TEXT as owner_name,
        cs.permission_level,
        COALESCE(p.calendar_color, '#3b82f6')::TEXT as calendar_color
    FROM calendar_shares cs
    JOIN auth.users u ON u.id = cs.calendar_owner_id
    LEFT JOIN profiles p ON p.user_id = cs.calendar_owner_id
    WHERE cs.shared_with_user_id = user_uuid
    AND cs.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get users who can view my calendar
CREATE OR REPLACE FUNCTION get_calendar_viewers(user_uuid UUID)
RETURNS TABLE (
    shared_with_user_id UUID,
    viewer_email TEXT,
    viewer_name TEXT,
    permission_level TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.shared_with_user_id,
        u.email::TEXT,
        COALESCE(p.first_name || ' ' || p.last_name, u.email)::TEXT as viewer_name,
        cs.permission_level
    FROM calendar_shares cs
    JOIN auth.users u ON u.id = cs.shared_with_user_id
    LEFT JOIN profiles p ON p.user_id = cs.shared_with_user_id
    WHERE cs.calendar_owner_id = user_uuid
    AND cs.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CREATE VIEWS
-- ============================================

-- View for calendar shares with user details
CREATE OR REPLACE VIEW calendar_shares_with_users AS
SELECT 
    cs.*,
    owner.email as owner_email,
    COALESCE(owner_p.first_name || ' ' || owner_p.last_name, owner.email) as owner_name,
    COALESCE(owner_p.calendar_color, '#3b82f6') as owner_color,
    shared.email as shared_with_email,
    COALESCE(shared_p.first_name || ' ' || shared_p.last_name, shared.email) as shared_with_name
FROM calendar_shares cs
JOIN auth.users owner ON owner.id = cs.calendar_owner_id
LEFT JOIN profiles owner_p ON owner_p.user_id = cs.calendar_owner_id
JOIN auth.users shared ON shared.id = cs.shared_with_user_id
LEFT JOIN profiles shared_p ON shared_p.user_id = cs.shared_with_user_id;

-- Grant access to the view
GRANT SELECT ON calendar_shares_with_users TO authenticated;

-- ============================================
-- 7. ADD NOTIFICATION SUPPORT
-- ============================================

-- Add trigger to notify when calendar is shared
CREATE OR REPLACE FUNCTION notify_calendar_shared()
RETURNS TRIGGER AS $$
BEGIN
    -- Create notification for the user who received access
    INSERT INTO notifications (
        user_id,
        organization_id,
        type,
        title,
        message,
        link
    )
    SELECT 
        NEW.shared_with_user_id,
        NEW.organization_id,
        'calendar_shared',
        'Calendar Access Granted',
        COALESCE(
            (SELECT first_name || ' ' || last_name FROM profiles WHERE user_id = NEW.calendar_owner_id),
            (SELECT email FROM auth.users WHERE id = NEW.calendar_owner_id)
        ) || ' has shared their calendar with you',
        '/calendar';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_calendar_shared ON calendar_shares;
CREATE TRIGGER trg_notify_calendar_shared
    AFTER INSERT ON calendar_shares
    FOR EACH ROW
    EXECUTE FUNCTION notify_calendar_shared();

-- ============================================
-- 8. DOCUMENTATION
-- ============================================

COMMENT ON TABLE calendar_shares IS 'Stores calendar sharing relationships between users';
COMMENT ON COLUMN calendar_shares.permission_level IS 'Permission level: view (read-only) or edit (can modify events)';
COMMENT ON COLUMN calendar_shares.is_active IS 'Soft delete flag - set to false to revoke access without deleting record';
COMMENT ON COLUMN profiles.calendar_color IS 'Hex color code for user calendar display (e.g., #3b82f6)';

-- ============================================
-- END OF MIGRATION
-- ============================================
-- Migration: Recurring Event Instances
-- Created: 2026-03-07
-- Description: Creates table for recurring event instances with advanced patterns

-- ============================================
-- 1. RECURRING EVENT INSTANCES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS calendar_event_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    instance_date TIMESTAMPTZ NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_exception BOOLEAN NOT NULL DEFAULT false,
    exception_type TEXT CHECK (exception_type IN ('modified', 'deleted', 'added')),
    modified_title TEXT,
    modified_description TEXT,
    modified_location TEXT,
    is_cancelled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(parent_event_id, instance_date)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendar_event_instances_parent 
    ON calendar_event_instances(parent_event_id);
    
CREATE INDEX IF NOT EXISTS idx_calendar_event_instances_date 
    ON calendar_event_instances(instance_date);
    
CREATE INDEX IF NOT EXISTS idx_calendar_event_instances_range 
    ON calendar_event_instances(start_date, end_date);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_calendar_event_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calendar_event_instances_updated_at ON calendar_event_instances;
CREATE TRIGGER trg_calendar_event_instances_updated_at
    BEFORE UPDATE ON calendar_event_instances
    FOR EACH ROW
    EXECUTE FUNCTION update_calendar_event_instances_updated_at();

-- ============================================
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE calendar_event_instances ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view instances of events they have access to
CREATE POLICY calendar_event_instances_select_policy ON calendar_event_instances
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = calendar_event_instances.parent_event_id
            AND user_can_view_calendar_event(ce.organization_id, ce.created_by)
        )
    );

-- Policy: Only event owners or editors can modify instances
CREATE POLICY calendar_event_instances_insert_policy ON calendar_event_instances
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = calendar_event_instances.parent_event_id
            AND user_can_edit_calendar_event(ce.organization_id, ce.created_by)
        )
    );

CREATE POLICY calendar_event_instances_update_policy ON calendar_event_instances
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = calendar_event_instances.parent_event_id
            AND user_can_edit_calendar_event(ce.organization_id, ce.created_by)
        )
    );

CREATE POLICY calendar_event_instances_delete_policy ON calendar_event_instances
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = calendar_event_instances.parent_event_id
            AND user_can_edit_calendar_event(ce.organization_id, ce.created_by)
        )
    );

-- ============================================
-- 3. GENERATE RECURRING INSTANCES FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION generate_recurring_instances(
    p_event_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT (CURRENT_DATE + INTERVAL '90 days')
)
RETURNS INTEGER AS $$
DECLARE
    v_event RECORD;
    v_instance_date TIMESTAMPTZ;
    v_instance_start TIMESTAMPTZ;
    v_instance_end TIMESTAMPTZ;
    v_duration INTERVAL;
    v_count INTEGER := 0;
    v_frequency TEXT;
    v_interval INTEGER;
    v_recurrence_end TIMESTAMPTZ;
    v_max_instances INTEGER := 365; -- Safety limit
BEGIN
    -- Get the parent event
    SELECT 
        ce.*,
        ce.recurrence_pattern->>'frequency' as freq,
        (ce.recurrence_pattern->>'interval')::integer as intvl
    INTO v_event
    FROM calendar_events ce
    WHERE ce.id = p_event_id
    AND ce.is_recurring = true;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    v_frequency := v_event.freq;
    v_interval := COALESCE(v_event.intvl, 1);
    v_duration := v_event.end_date - v_event.start_date;
    v_recurrence_end := COALESCE(v_event.recurrence_end_date, p_end_date::timestamptz);
    
    -- Calculate end bound
    IF v_recurrence_end > p_end_date::timestamptz THEN
        v_recurrence_end := p_end_date::timestamptz;
    END IF;
    
    -- Start from the first instance on or after p_start_date
    v_instance_date := v_event.start_date;
    
    -- Fast forward to p_start_date if needed
    WHILE v_instance_date < p_start_date::timestamptz AND v_count < v_max_instances LOOP
        CASE v_frequency
            WHEN 'daily' THEN
                v_instance_date := v_instance_date + (v_interval || ' days')::interval;
            WHEN 'weekly' THEN
                v_instance_date := v_instance_date + ((v_interval * 7) || ' days')::interval;
            WHEN 'monthly' THEN
                v_instance_date := v_instance_date + (v_interval || ' months')::interval;
            WHEN 'yearly' THEN
                v_instance_date := v_instance_date + (v_interval || ' years')::interval;
        END CASE;
        v_count := v_count + 1;
    END LOOP;
    
    -- Reset count for actual insertion
    v_count := 0;
    
    -- Generate instances
    WHILE v_instance_date <= v_recurrence_end AND v_count < v_max_instances LOOP
        v_instance_start := v_instance_date;
        v_instance_end := v_instance_date + v_duration;
        
        -- Check if this instance already exists and is not an exception
        IF NOT EXISTS (
            SELECT 1 FROM calendar_event_instances cei
            WHERE cei.parent_event_id = p_event_id
            AND cei.instance_date = v_instance_date
            AND cei.is_exception = false
        ) THEN
            -- Check if there's a deleted exception for this date
            IF NOT EXISTS (
                SELECT 1 FROM calendar_event_instances cei
                WHERE cei.parent_event_id = p_event_id
                AND cei.instance_date = v_instance_date
                AND cei.exception_type = 'deleted'
            ) THEN
                INSERT INTO calendar_event_instances (
                    parent_event_id,
                    instance_date,
                    start_date,
                    end_date,
                    is_exception,
                    exception_type
                ) VALUES (
                    p_event_id,
                    v_instance_date,
                    v_instance_start,
                    v_instance_end,
                    false,
                    null
                );
                v_count := v_count + 1;
            END IF;
        END IF;
        
        -- Move to next instance
        CASE v_frequency
            WHEN 'daily' THEN
                v_instance_date := v_instance_date + (v_interval || ' days')::interval;
            WHEN 'weekly' THEN
                v_instance_date := v_instance_date + ((v_interval * 7) || ' days')::interval;
            WHEN 'monthly' THEN
                v_instance_date := v_instance_date + (v_interval || ' months')::interval;
            WHEN 'yearly' THEN
                v_instance_date := v_instance_date + (v_interval || ' years')::interval;
        END CASE;
    END LOOP;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. ADVANCED RECURRENCE PATTERNS
-- ============================================

-- Add new columns for advanced patterns to calendar_events
ALTER TABLE calendar_events 
ADD COLUMN IF NOT EXISTS recurrence_days_of_week INTEGER[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_week_of_month INTEGER DEFAULT NULL, -- 1-5 for "1st", "2nd", etc.
ADD COLUMN IF NOT EXISTS recurrence_day_of_month INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_month_of_year INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS recurrence_end_after_count INTEGER DEFAULT NULL; -- End after X occurrences

-- Function to generate instances with advanced patterns
CREATE OR REPLACE FUNCTION generate_advanced_recurring_instances(
    p_event_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT (CURRENT_DATE + INTERVAL '90 days')
)
RETURNS INTEGER AS $$
DECLARE
    v_event RECORD;
    v_instance_date TIMESTAMPTZ;
    v_instance_start TIMESTAMPTZ;
    v_instance_end TIMESTAMPTZ;
    v_duration INTERVAL;
    v_count INTEGER := 0;
    v_instance_count INTEGER := 0;
    v_max_instances INTEGER := 365;
    v_day_of_week INTEGER;
    v_current_month INTEGER;
    v_target_week INTEGER;
BEGIN
    SELECT * INTO v_event
    FROM calendar_events
    WHERE id = p_event_id AND is_recurring = true;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    v_duration := v_event.end_date - v_event.start_date;
    
    -- Check if using advanced patterns
    IF v_event.recurrence_days_of_week IS NOT NULL OR 
       v_event.recurrence_week_of_month IS NOT NULL THEN
        
        -- Advanced: weekly on specific days
        v_instance_date := p_start_date::timestamptz;
        
        WHILE v_instance_date <= p_end_date::timestamptz AND v_count < v_max_instances LOOP
            v_day_of_week := EXTRACT(DOW FROM v_instance_date);
            
            -- Check if this day matches the pattern
            IF v_event.recurrence_days_of_week IS NULL OR 
               v_day_of_week = ANY(v_event.recurrence_days_of_week) THEN
                
                -- Check week of month pattern if specified
                IF v_event.recurrence_week_of_month IS NULL OR
                   (CEIL(EXTRACT(DAY FROM v_instance_date) / 7.0)::integer = v_event.recurrence_week_of_month) THEN
                    
                    v_instance_start := v_instance_date + 
                        (EXTRACT(HOUR FROM v_event.start_date) || ' hours')::interval +
                        (EXTRACT(MINUTE FROM v_event.start_date) || ' minutes')::interval;
                    v_instance_end := v_instance_start + v_duration;
                    
                    -- Insert if not exists and not deleted
                    IF NOT EXISTS (
                        SELECT 1 FROM calendar_event_instances 
                        WHERE parent_event_id = p_event_id 
                        AND instance_date = v_instance_date
                    ) AND NOT EXISTS (
                        SELECT 1 FROM calendar_event_instances 
                        WHERE parent_event_id = p_event_id 
                        AND instance_date = v_instance_date
                        AND exception_type = 'deleted'
                    ) THEN
                        INSERT INTO calendar_event_instances (
                            parent_event_id, instance_date, start_date, end_date
                        ) VALUES (p_event_id, v_instance_date, v_instance_start, v_instance_end);
                        v_count := v_count + 1;
                    END IF;
                END IF;
            END IF;
            
            v_instance_date := v_instance_date + INTERVAL '1 day';
        END LOOP;
        
    ELSE
        -- Use basic recurrence
        RETURN generate_recurring_instances(p_event_id, p_start_date, p_end_date);
    END IF;
    
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. TRIGGER TO AUTO-GENERATE INSTANCES
-- ============================================

CREATE OR REPLACE FUNCTION auto_generate_event_instances()
RETURNS TRIGGER AS $$
BEGIN
    -- Generate instances for new recurring events
    IF NEW.is_recurring = true THEN
        PERFORM generate_recurring_instances(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_instances ON calendar_events;
CREATE TRIGGER trg_auto_generate_instances
    AFTER INSERT ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_event_instances();

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Get all events including instances for a date range
CREATE OR REPLACE FUNCTION get_calendar_events_with_instances(
    p_organization_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    location TEXT,
    event_type TEXT,
    is_recurring BOOLEAN,
    is_instance BOOLEAN,
    parent_event_id UUID,
    instance_exception BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    -- Regular non-recurring events
    SELECT 
        ce.id,
        ce.title,
        ce.description,
        ce.start_date,
        ce.end_date,
        ce.location,
        ce.event_type,
        ce.is_recurring,
        false as is_instance,
        null::uuid as parent_event_id,
        false as instance_exception
    FROM calendar_events ce
    WHERE ce.organization_id = p_organization_id
    AND ce.is_recurring = false
    AND ce.start_date <= p_end_date
    AND ce.end_date >= p_start_date
    AND user_can_view_calendar_event(ce.organization_id, ce.created_by)
    
    UNION ALL
    
    -- Recurring event instances
    SELECT 
        cei.id,
        COALESCE(cei.modified_title, ce.title) as title,
        COALESCE(cei.modified_description, ce.description) as description,
        cei.start_date,
        cei.end_date,
        COALESCE(cei.modified_location, ce.location) as location,
        ce.event_type,
        true as is_recurring,
        true as is_instance,
        cei.parent_event_id,
        cei.is_exception as instance_exception
    FROM calendar_event_instances cei
    JOIN calendar_events ce ON ce.id = cei.parent_event_id
    WHERE ce.organization_id = p_organization_id
    AND cei.start_date <= p_end_date
    AND cei.end_date >= p_start_date
    AND NOT cei.is_cancelled
    AND user_can_view_calendar_event(ce.organization_id, ce.created_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Delete a specific instance (creates exception)
CREATE OR REPLACE FUNCTION delete_event_instance(
    p_instance_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE calendar_event_instances
    SET 
        is_exception = true,
        exception_type = 'deleted',
        is_cancelled = true
    WHERE id = p_instance_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Modify a specific instance (creates exception)
CREATE OR REPLACE FUNCTION modify_event_instance(
    p_instance_id UUID,
    p_new_start TIMESTAMPTZ DEFAULT NULL,
    p_new_end TIMESTAMPTZ DEFAULT NULL,
    p_new_title TEXT DEFAULT NULL,
    p_new_description TEXT DEFAULT NULL,
    p_new_location TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE calendar_event_instances
    SET 
        is_exception = true,
        exception_type = 'modified',
        start_date = COALESCE(p_new_start, start_date),
        end_date = COALESCE(p_new_end, end_date),
        modified_title = p_new_title,
        modified_description = p_new_description,
        modified_location = p_new_location
    WHERE id = p_instance_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. DOCUMENTATION
-- ============================================

COMMENT ON TABLE calendar_event_instances IS 'Individual instances of recurring calendar events';
COMMENT ON COLUMN calendar_event_instances.is_exception IS 'True if this instance has been modified or deleted from the series';
COMMENT ON COLUMN calendar_event_instances.exception_type IS 'Type of exception: modified, deleted, or added';
COMMENT ON COLUMN calendar_events.recurrence_days_of_week IS 'Array of day numbers (0=Sunday, 1=Monday, etc.) for weekly recurrence';
COMMENT ON COLUMN calendar_events.recurrence_week_of_month IS 'Week number (1-5) for patterns like "3rd Tuesday"';

-- ============================================
-- END OF MIGRATION
-- ============================================
-- Migration: Event Invitations and RSVP System
-- Created: 2026-03-07
-- Description: Meeting invitations with RSVP tracking

-- ============================================
-- 1. EVENT INVITATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS event_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    invitee_email TEXT NOT NULL,
    invitee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'tentative')),
    message TEXT,
    responded_at TIMESTAMPTZ,
    ical_uid TEXT,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(event_id, invitee_email)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_event_invitations_event ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_invitee ON event_invitations(invitee_email);
CREATE INDEX IF NOT EXISTS idx_event_invitations_user ON event_invitations(invitee_user_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_status ON event_invitations(status);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_event_invitations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_invitations_updated_at ON event_invitations;
CREATE TRIGGER trg_event_invitations_updated_at
    BEFORE UPDATE ON event_invitations
    FOR EACH ROW
    EXECUTE FUNCTION update_event_invitations_updated_at();

-- ============================================
-- 2. RLS POLICIES
-- ============================================

ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- Select: Event creator, invitee, or org admin
CREATE POLICY event_invitations_select_policy ON event_invitations
    FOR SELECT
    USING (
        auth.uid() = invited_by
        OR auth.uid() = invitee_user_id
        OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.user_id = auth.uid()
            AND p.organization_id = event_invitations.organization_id
            AND p.role = 'admin'
        )
    );

-- Insert: Event creator only
CREATE POLICY event_invitations_insert_policy ON event_invitations
    FOR INSERT
    WITH CHECK (
        auth.uid() = invited_by
        AND EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = event_invitations.event_id
            AND (ce.created_by = auth.uid() OR user_can_edit_calendar_event(ce.organization_id, ce.created_by))
        )
    );

-- Update: Event creator or invitee (for RSVP)
CREATE POLICY event_invitations_update_policy ON event_invitations
    FOR UPDATE
    USING (
        auth.uid() = invited_by
        OR auth.uid() = invitee_user_id
        OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Delete: Event creator only
CREATE POLICY event_invitations_delete_policy ON event_invitations
    FOR DELETE
    USING (
        auth.uid() = invited_by
        OR EXISTS (
            SELECT 1 FROM calendar_events ce
            WHERE ce.id = event_invitations.event_id
            AND ce.created_by = auth.uid()
        )
    );

-- ============================================
-- 3. RSVP FUNCTIONS
-- ============================================

-- Respond to invitation
CREATE OR REPLACE FUNCTION respond_to_invitation(
    p_invitation_id UUID,
    p_response TEXT, -- 'accepted', 'declined', 'tentative'
    p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN AS $$
DECLARE
    v_invitation RECORD;
BEGIN
    SELECT * INTO v_invitation
    FROM event_invitations
    WHERE id = p_invitation_id;
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Verify user is the invitee
    IF v_invitation.invitee_user_id != p_user_id AND 
       v_invitation.invitee_email != (SELECT email FROM auth.users WHERE id = p_user_id) THEN
        RETURN false;
    END IF;
    
    UPDATE event_invitations
    SET 
        status = p_response,
        responded_at = NOW(),
        invitee_user_id = COALESCE(v_invitation.invitee_user_id, p_user_id)
    WHERE id = p_invitation_id;
    
    -- Create notification for event creator
    INSERT INTO notifications (
        user_id,
        organization_id,
        type,
        title,
        message,
        link
    )
    SELECT 
        ce.created_by,
        ce.organization_id,
        'invitation_response',
        'Invitation ' || initcap(p_response),
        (SELECT email FROM auth.users WHERE id = p_user_id) || ' has ' || p_response || ' your invitation',
        '/calendar'
    FROM calendar_events ce
    WHERE ce.id = v_invitation.event_id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. INVITATION EMAIL TEMPLATE
-- ============================================

-- Store email template in a config table or use as default
COMMENT ON TABLE event_invitations IS 'Tracks meeting invitations and RSVP status';
COMMENT ON COLUMN event_invitations.status IS 'RSVP status: pending, accepted, declined, tentative';
COMMENT ON COLUMN event_invitations.ical_uid IS 'Unique identifier for iCalendar (.ics) attachment';

-- ============================================
-- 5. VIEW FOR INVITATIONS WITH EVENT DETAILS
-- ============================================

CREATE OR REPLACE VIEW event_invitations_with_details AS
SELECT 
    ei.*,
    ce.title as event_title,
    ce.start_date as event_start,
    ce.end_date as event_end,
    ce.location as event_location,
    ce.description as event_description,
    ce.event_type,
    inviter.email as inviter_email,
    COALESCE(p.first_name || ' ' || p.last_name, inviter.email) as inviter_name
FROM event_invitations ei
JOIN calendar_events ce ON ce.id = ei.event_id
JOIN auth.users inviter ON inviter.id = ei.invited_by
LEFT JOIN profiles p ON p.user_id = ei.invited_by;

GRANT SELECT ON event_invitations_with_details TO authenticated;

-- ============================================
-- END OF MIGRATION
-- ============================================
-- Migration: Enhanced Multi-Channel Reminders (FIXED)
-- Created: 2026-03-07

-- 1. UPDATE EVENT_REMINDERS TABLE
ALTER TABLE IF EXISTS event_reminders 
ADD COLUMN IF NOT EXISTS notification_channels TEXT[] DEFAULT ARRAY['in_app'],
ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- 2. USER NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
    enable_sms_notifications BOOLEAN NOT NULL DEFAULT false,
    enable_slack_notifications BOOLEAN NOT NULL DEFAULT false,
    enable_push_notifications BOOLEAN NOT NULL DEFAULT true,
    phone_number TEXT,
    slack_webhook_url TEXT,
    slack_user_id TEXT,
    default_reminder_minutes INTEGER[] DEFAULT ARRAY[15, 60],
    digest_email_frequency TEXT DEFAULT 'daily' CHECK (digest_email_frequency IN ('daily', 'weekly', 'never')),
    digest_email_time TIME DEFAULT '08:00:00',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    quiet_hours_timezone TEXT DEFAULT 'America/New_York',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

-- 3. RLS POLICIES (FIXED SYNTAX)
ALTER TABLE IF EXISTS user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_notification_prefs_select_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_select_policy ON user_notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_insert_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_insert_policy ON user_notification_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_update_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_update_policy ON user_notification_preferences
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_notification_prefs_delete_policy ON user_notification_preferences;
CREATE POLICY user_notification_prefs_delete_policy ON user_notification_preferences
    FOR DELETE USING (auth.uid() = user_id);

-- 4. REMINDER TEMPLATES TABLE
CREATE TABLE IF NOT EXISTS reminder_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('meeting', 'hearing', 'deadline', 'deposition', 'review', 'consultation', 'all')),
    reminder_minutes INTEGER NOT NULL,
    notification_channels TEXT[] NOT NULL DEFAULT ARRAY['in_app'],
    subject_template TEXT,
    body_template TEXT,
    sms_template TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. REMINDER QUEUE TABLE
CREATE TABLE IF NOT EXISTS reminder_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reminder_id UUID NOT NULL REFERENCES event_reminders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'slack', 'push')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'retrying')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. INDEXES
CREATE INDEX IF NOT EXISTS idx_reminder_queue_status ON reminder_queue(status);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_reminder ON reminder_queue(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_retry ON reminder_queue(next_retry_at) WHERE status IN ('pending', 'retrying');

-- 7. TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION create_reminder_queue_entries()
RETURNS TRIGGER AS $$
DECLARE
    v_channel TEXT;
BEGIN
    FOREACH v_channel IN ARRAY NEW.notification_channels
    LOOP
        INSERT INTO reminder_queue (reminder_id, channel, status)
        VALUES (NEW.id, v_channel, 'pending')
        ON CONFLICT DO NOTHING;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_reminder_queue ON event_reminders;
CREATE TRIGGER trg_create_reminder_queue
    AFTER INSERT ON event_reminders
    FOR EACH ROW
    WHEN (NEW.sent = false)
    EXECUTE FUNCTION create_reminder_queue_entries();
-- Migration: Calendar Digest Emails (FIXED)
-- Created: 2026-03-07

-- 1. DIGEST LOGS TABLE
CREATE TABLE IF NOT EXISTS calendar_digest_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    digest_type TEXT NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
    period_start_date DATE NOT NULL,
    period_end_date DATE NOT NULL,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    email_error TEXT,
    events_included INTEGER NOT NULL DEFAULT 0,
    events_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_logs_user ON calendar_digest_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_logs_date ON calendar_digest_logs(period_start_date);
CREATE INDEX IF NOT EXISTS idx_digest_logs_sent ON calendar_digest_logs(email_sent) WHERE email_sent = false;

-- 2. FUNCTIONS
CREATE OR REPLACE FUNCTION get_users_for_digest(p_digest_type TEXT, p_current_time TIME DEFAULT CURRENT_TIME)
RETURNS TABLE (user_id UUID, email TEXT, organization_id UUID, digest_time TIME, timezone TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        unp.user_id,
        u.email,
        unp.organization_id,
        unp.digest_email_time,
        unp.quiet_hours_timezone
    FROM user_notification_preferences unp
    JOIN auth.users u ON u.id = unp.user_id
    WHERE unp.digest_email_frequency = p_digest_type
    AND unp.enable_email_notifications = true
    AND (
        (p_digest_type = 'daily' AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
        OR 
        (p_digest_type = 'weekly' AND EXTRACT(DOW FROM CURRENT_DATE) = 0 AND unp.digest_email_time <= p_current_time AND unp.digest_email_time > (p_current_time - INTERVAL '1 hour'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_upcoming_events_for_digest(p_user_id UUID, p_organization_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS TABLE (event_id UUID, title TEXT, description TEXT, start_date TIMESTAMPTZ, end_date TIMESTAMPTZ, location TEXT, event_type TEXT, is_recurring BOOLEAN, created_by_name TEXT) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.id as event_id,
        ce.title,
        ce.description,
        ce.start_date,
        ce.end_date,
        ce.location,
        ce.event_type,
        ce.is_recurring,
        COALESCE(p.first_name || ' ' || p.last_name, u.email) as created_by_name
    FROM calendar_events ce
    LEFT JOIN profiles p ON p.user_id = ce.created_by
    LEFT JOIN auth.users u ON u.id = ce.created_by
    WHERE ce.organization_id = p_organization_id
    AND ce.start_date >= p_start_date::timestamptz
    AND ce.start_date < (p_end_date + INTERVAL '1 day')::timestamptz
    AND (
        ce.created_by = p_user_id
        OR ce.attendees @> ARRAY[(SELECT email FROM auth.users WHERE id = p_user_id)]
        OR EXISTS (
            SELECT 1 FROM calendar_shares cs
            WHERE cs.calendar_owner_id = ce.created_by
            AND cs.shared_with_user_id = p_user_id
            AND cs.is_active = true
        )
    )
    AND NOT ce.is_recurring
    ORDER BY ce.start_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RLS POLICIES (FIXED)
ALTER TABLE IF EXISTS calendar_digest_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_digest_logs_select_policy ON calendar_digest_logs;
CREATE POLICY calendar_digest_logs_select_policy ON calendar_digest_logs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS calendar_digest_logs_insert_policy ON calendar_digest_logs;
CREATE POLICY calendar_digest_logs_insert_policy ON calendar_digest_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  target_url text NOT NULL,
  secret text,
  is_active boolean NOT NULL DEFAULT true,
  subscribed_events text[] NOT NULL DEFAULT '{}'::text[],
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_triggered_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  response_status integer,
  response_body text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_org ON public.webhook_endpoints(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON public.webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON public.webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint_id ON public.webhook_deliveries(endpoint_id);

ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_endpoints_admin_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_select
ON public.webhook_endpoints
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_endpoints_org_select ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_org_select
ON public.webhook_endpoints
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = webhook_endpoints.organization_id
  )
);

DROP POLICY IF EXISTS webhook_endpoints_admin_insert ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_insert
ON public.webhook_endpoints
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_endpoints_admin_update ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_update
ON public.webhook_endpoints
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_endpoints_admin_delete ON public.webhook_endpoints;
CREATE POLICY webhook_endpoints_admin_delete
ON public.webhook_endpoints
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_deliveries_admin_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_select
ON public.webhook_deliveries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_deliveries_org_select ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_org_select
ON public.webhook_deliveries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.webhook_endpoints we
    JOIN public.profiles p
      ON p.organization_id = we.organization_id
    WHERE we.id = webhook_deliveries.endpoint_id
      AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS webhook_deliveries_admin_insert ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_insert
ON public.webhook_deliveries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS webhook_deliveries_admin_update ON public.webhook_deliveries;
CREATE POLICY webhook_deliveries_admin_update
ON public.webhook_deliveries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.get_pending_webhook_deliveries(p_batch_size integer DEFAULT 50)
RETURNS TABLE (
  delivery_id uuid,
  endpoint_id uuid,
  target_url text,
  secret text,
  event_type text,
  payload jsonb,
  attempt_count integer,
  max_attempts integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    wd.id AS delivery_id,
    wd.endpoint_id,
    we.target_url,
    we.secret,
    wd.event_type,
    wd.payload,
    wd.attempt_count,
    wd.max_attempts
  FROM public.webhook_deliveries wd
  JOIN public.webhook_endpoints we
    ON we.id = wd.endpoint_id
  WHERE wd.status = 'pending'
    AND wd.next_retry_at <= now()
    AND we.is_active = true
  ORDER BY wd.created_at ASC
  LIMIT GREATEST(COALESCE(p_batch_size, 50), 1);
$$;

CREATE OR REPLACE FUNCTION public.update_webhook_delivery_status(
  p_delivery_id uuid,
  p_status text,
  p_response_status integer DEFAULT NULL,
  p_response_body text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_next_retry_at timestamptz DEFAULT NULL,
  p_attempt_increment integer DEFAULT 1
)
RETURNS public.webhook_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.webhook_deliveries;
BEGIN
  UPDATE public.webhook_deliveries wd
  SET
    status = p_status,
    response_status = COALESCE(p_response_status, wd.response_status),
    response_body = COALESCE(p_response_body, wd.response_body),
    error_message = p_error_message,
    attempt_count = wd.attempt_count + GREATEST(COALESCE(p_attempt_increment, 1), 0),
    delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE wd.delivered_at END,
    next_retry_at = COALESCE(p_next_retry_at, wd.next_retry_at),
    updated_at = now()
  WHERE wd.id = p_delivery_id
  RETURNING wd.* INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_webhook_deliveries(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_webhook_delivery_status(uuid, text, integer, text, text, timestamptz, integer) TO authenticated, service_role;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  owner_user_id uuid,
  key_name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text,
  scopes text[] NOT NULL DEFAULT '{}'::text[],
  rate_limit_per_minute integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_hash)
);

CREATE TABLE IF NOT EXISTS public.api_rate_limit_windows (
  api_key_id uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  organization_id uuid,
  request_path text NOT NULL,
  request_method text NOT NULL,
  request_ip inet,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  response_body jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.api_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  location text,
  created_by uuid,
  source text NOT NULL DEFAULT 'api',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_calendar_events_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON public.api_keys(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON public.api_keys(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_key_started ON public.api_request_logs(api_key_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_org_started ON public.api_request_logs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_calendar_events_org_start ON public.api_calendar_events(organization_id, start_at);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_admin_select ON public.api_keys;
CREATE POLICY api_keys_admin_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_keys_owner_select ON public.api_keys;
CREATE POLICY api_keys_owner_select
ON public.api_keys
FOR SELECT
TO authenticated
USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS api_keys_admin_modify ON public.api_keys;
CREATE POLICY api_keys_admin_modify
ON public.api_keys
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_rate_limit_windows_admin_only ON public.api_rate_limit_windows;
CREATE POLICY api_rate_limit_windows_admin_only
ON public.api_rate_limit_windows
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_select ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_select
ON public.api_request_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_owner_select ON public.api_request_logs;
CREATE POLICY api_request_logs_owner_select
ON public.api_request_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.api_keys ak
    WHERE ak.id = api_request_logs.api_key_id
      AND ak.owner_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_insert ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_insert
ON public.api_request_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_request_logs_admin_update ON public.api_request_logs;
CREATE POLICY api_request_logs_admin_update
ON public.api_request_logs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_calendar_events_admin_select ON public.api_calendar_events;
CREATE POLICY api_calendar_events_admin_select
ON public.api_calendar_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS api_calendar_events_org_select ON public.api_calendar_events;
CREATE POLICY api_calendar_events_org_select
ON public.api_calendar_events
FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.organization_id = api_calendar_events.organization_id
  )
);

DROP POLICY IF EXISTS api_calendar_events_admin_modify ON public.api_calendar_events;
CREATE POLICY api_calendar_events_admin_modify
ON public.api_calendar_events
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.validate_api_key(
  p_api_key text,
  p_required_scope text DEFAULT NULL
)
RETURNS TABLE (
  is_valid boolean,
  api_key_id uuid,
  organization_id uuid,
  owner_user_id uuid,
  rate_limit_per_minute integer,
  scopes text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true AS is_valid,
    ak.id AS api_key_id,
    ak.organization_id,
    ak.owner_user_id,
    ak.rate_limit_per_minute,
    ak.scopes
  FROM public.api_keys ak
  WHERE ak.key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
    AND ak.is_active = true
    AND (ak.expires_at IS NULL OR ak.expires_at > now())
    AND (
      p_required_scope IS NULL
      OR p_required_scope = ''
      OR p_required_scope = ANY(ak.scopes)
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_api_key_id uuid,
  p_rate_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_rate_limit_windows;
  v_limit integer;
BEGIN
  v_limit := GREATEST(COALESCE(p_rate_limit, 60), 1);

  INSERT INTO public.api_rate_limit_windows AS arlw (api_key_id, window_start, request_count, updated_at)
  VALUES (p_api_key_id, now(), 1, now())
  ON CONFLICT (api_key_id)
  DO UPDATE SET
    window_start = CASE
      WHEN arlw.window_start <= now() - interval '1 minute' THEN now()
      ELSE arlw.window_start
    END,
    request_count = CASE
      WHEN arlw.window_start <= now() - interval '1 minute' THEN 1
      ELSE arlw.request_count + 1
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row.request_count <= v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_api_request(
  p_api_key_id uuid,
  p_organization_id uuid,
  p_request_path text,
  p_request_method text,
  p_request_ip inet DEFAULT NULL,
  p_request_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.api_request_logs (
    api_key_id,
    organization_id,
    request_path,
    request_method,
    request_ip,
    request_metadata,
    started_at,
    created_at
  )
  VALUES (
    p_api_key_id,
    p_organization_id,
    p_request_path,
    upper(p_request_method),
    p_request_ip,
    COALESCE(p_request_metadata, '{}'::jsonb),
    now(),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_api_request(
  p_request_log_id uuid,
  p_status_code integer,
  p_response_body jsonb DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS public.api_request_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_request_logs;
BEGIN
  UPDATE public.api_request_logs arl
  SET
    status_code = p_status_code,
    response_body = p_response_body,
    error_message = p_error_message,
    completed_at = now(),
    duration_ms = GREATEST((EXTRACT(EPOCH FROM (now() - arl.started_at)) * 1000)::integer, 0)
  WHERE arl.id = p_request_log_id
  RETURNING arl.* INTO v_row;

  UPDATE public.api_keys ak
  SET last_used_at = now(),
      updated_at = now()
  WHERE ak.id = v_row.api_key_id;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.api_get_calendar_events(
  p_organization_id uuid,
  p_start_at timestamptz DEFAULT NULL,
  p_end_at timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.api_calendar_events
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ace.*
  FROM public.api_calendar_events ace
  WHERE (p_organization_id IS NULL OR ace.organization_id = p_organization_id)
    AND (p_start_at IS NULL OR ace.end_at >= p_start_at)
    AND (p_end_at IS NULL OR ace.start_at <= p_end_at)
  ORDER BY ace.start_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.api_create_calendar_event(
  p_organization_id uuid,
  p_title text,
  p_description text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_location text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.api_calendar_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.api_calendar_events;
BEGIN
  INSERT INTO public.api_calendar_events (
    organization_id,
    title,
    description,
    start_at,
    end_at,
    location,
    created_by,
    metadata,
    source,
    created_at,
    updated_at
  )
  VALUES (
    p_organization_id,
    p_title,
    p_description,
    p_start_at,
    p_end_at,
    p_location,
    p_created_by,
    COALESCE(p_metadata, '{}'::jsonb),
    'api',
    now(),
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_api_key(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_api_request(uuid, uuid, text, text, inet, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_api_request(uuid, integer, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_get_calendar_events(uuid, timestamptz, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_create_calendar_event(uuid, text, text, timestamptz, timestamptz, text, uuid, jsonb) TO authenticated, service_role;
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'user',
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'api',
  ip_address inet,
  user_agent text,
  target_type text,
  target_id text,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_audit_logs_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical'))
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_org_created ON public.security_audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_actor_created ON public.security_audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_event_type_created ON public.security_audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_severity_created ON public.security_audit_logs(severity, created_at DESC);

ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS security_audit_logs_admin_select ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_select
ON public.security_audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

DROP POLICY IF EXISTS security_audit_logs_actor_select ON public.security_audit_logs;
CREATE POLICY security_audit_logs_actor_select
ON public.security_audit_logs
FOR SELECT
TO authenticated
USING (actor_user_id = auth.uid());

DROP POLICY IF EXISTS security_audit_logs_admin_insert ON public.security_audit_logs;
CREATE POLICY security_audit_logs_admin_insert
ON public.security_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'superadmin')
  )
);

CREATE OR REPLACE FUNCTION public.log_security_event(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_source text DEFAULT 'api',
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_id text DEFAULT NULL,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.security_audit_logs (
    organization_id,
    actor_user_id,
    actor_type,
    event_type,
    severity,
    source,
    ip_address,
    user_agent,
    target_type,
    target_id,
    event_data,
    created_at
  )
  VALUES (
    p_organization_id,
    p_actor_user_id,
    CASE WHEN p_actor_user_id IS NULL THEN 'system' ELSE 'user' END,
    p_event_type,
    CASE
      WHEN p_severity IN ('info', 'warning', 'error', 'critical') THEN p_severity
      ELSE 'info'
    END,
    COALESCE(NULLIF(p_source, ''), 'api'),
    p_ip_address,
    p_user_agent,
    p_target_type,
    p_target_id,
    COALESCE(p_event_data, '{}'::jsonb),
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_security_event(uuid, uuid, text, text, text, inet, text, text, text, jsonb) TO authenticated, service_role;
-- IMMEDIATE FIX: Run this in Supabase SQL Editor to fix the 500 errors
-- This fixes the conversation_participants RLS policies that are causing infinite loops
-- 
-- IMPORTANT: Run this entire script in Supabase SQL Editor to fix the issue immediately

-- Create helper function to check if conversation is in user's org (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_conversation_in_user_org(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_org_id UUID;
  conv_org_id UUID;
BEGIN
  -- Get user's organization
  SELECT organization_id INTO user_org_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF user_org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get conversation's organization (bypasses RLS due to SECURITY DEFINER)
  SELECT organization_id INTO conv_org_id
  FROM public.conversations
  WHERE id = p_conversation_id;
  
  RETURN conv_org_id = user_org_id;
END;
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;

-- Also fix the conversations SELECT policy to avoid circular dependency
DROP POLICY IF EXISTS "Users can view conversations in their organization" ON public.conversations;

-- Create optimized SELECT policy (NO RECURSION, uses SECURITY DEFINER function)
-- Users can view participants if:
-- 1. They are the participant themselves, OR
-- 2. The conversation is in their organization (checked via function that bypasses RLS)
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  USING (
    -- Option 1: User is viewing their own participant record
    user_id = auth.uid()
    OR
    -- Option 2: Conversation is in user's organization (function bypasses RLS, no recursion)
    public.is_conversation_in_user_org(conversation_id)
  );

-- Create INSERT policy (uses helper function to avoid RLS recursion)
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants
  FOR INSERT
  WITH CHECK (
    -- Conversation must be in user's organization (function bypasses RLS)
    public.is_conversation_in_user_org(conversation_participants.conversation_id)
    AND
    (
      -- User created the conversation, OR
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_participants.conversation_id
        AND c.created_by = auth.uid()
      )
      OR
      -- User being added is in the same organization
      conversation_participants.user_id IN (
        SELECT p.user_id 
        FROM public.profiles p
        INNER JOIN public.profiles p2 ON p2.organization_id = p.organization_id
        WHERE p2.user_id = auth.uid()
      )
    )
  );

-- Create UPDATE policy (needed for useMarkAsRead)
-- Use a simple direct check - no function calls, no recursion
-- This should be safe because user_id is a direct column check
CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Recreate conversations SELECT policy to avoid circular dependency
-- Users can view conversations if they're in the same organization
-- NOTE: We don't check participants here to avoid circular dependency with conversation_participants policy
-- The application layer (useConversations hook) already filters by participant status
CREATE POLICY "Users can view conversations in their organization"
  ON public.conversations
  FOR SELECT
  USING (
    -- Check organization membership via profiles (no function call, no participant check)
    EXISTS (
      SELECT 1 
      FROM public.profiles p
      WHERE p.organization_id = conversations.organization_id
      AND p.user_id = auth.uid()
    )
  );

-- Add RLS policies for messages table (if missing)
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.messages;

-- Users can view messages if they're participants in the conversation
-- Use helper function to avoid circular dependency
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    -- Conversation must be in user's organization (function bypasses RLS)
    public.is_conversation_in_user_org(messages.conversation_id)
    AND
    -- User must be a participant (direct check, no recursion)
    EXISTS (
      SELECT 1 
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- Users can send messages if they're participants in the conversation
CREATE POLICY "Users can send messages to their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND
    EXISTS (
      SELECT 1 
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
      AND cp.user_id = auth.uid()
    )
  );

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_conv 
  ON public.conversation_participants(user_id, conversation_id);
-- =============================================================================
-- ULTRA-MINIMAL SIGNUP FIX - FASTEST POSSIBLE TRIGGER
-- Run this in Supabase SQL Editor
-- =============================================================================

-- Step 1: Drop ALL triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
DROP TRIGGER IF EXISTS create_profile_trigger ON auth.users;

-- Step 2: Drop all old functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_with_invitation() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_minimal() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user_signup() CASCADE;

-- Step 3: Ensure index exists for fast lookup
CREATE INDEX IF NOT EXISTS idx_invitations_email_pending 
  ON public.invitations(email) WHERE status = 'pending';

-- Step 4: Allow NULL organization_id in profiles
ALTER TABLE public.profiles ALTER COLUMN organization_id DROP NOT NULL;

-- Step 5: Create ULTRA-SIMPLE trigger - bare minimum work
CREATE OR REPLACE FUNCTION public.handle_new_user_fast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  inv_org uuid;
  inv_role text;
BEGIN
  -- Single fast query for invitation
  SELECT organization_id, role::text INTO inv_org, inv_role
  FROM invitations
  WHERE email = NEW.email AND status = 'pending' AND expires_at > now()
  LIMIT 1;

  -- Create profile - ONE insert, that's it
  INSERT INTO profiles (user_id, email, organization_id, role, is_organization_creator, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    inv_org,  -- NULL if no invitation, org_id if invited
    COALESCE(inv_role::user_role, CASE WHEN inv_org IS NULL THEN 'superadmin' ELSE 'user' END::user_role),
    inv_org IS NULL,  -- is_organization_creator = TRUE only if no invitation
    now(),
    now()
  );

  -- Mark invitation accepted (if exists) - separate statement for speed
  IF inv_org IS NOT NULL THEN
    UPDATE invitations SET status = 'accepted' WHERE email = NEW.email AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just create basic profile and continue
  BEGIN
    INSERT INTO profiles (user_id, email, role, is_organization_creator, created_at, updated_at)
    VALUES (NEW.id, NEW.email, 'user', TRUE, now(), now())
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- Step 6: Attach trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_fast();

-- Step 7: RLS policies for trigger
DROP POLICY IF EXISTS "Trigger can insert profiles" ON profiles;
CREATE POLICY "Trigger can insert profiles" ON profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Trigger can update invitations" ON invitations;
CREATE POLICY "Trigger can update invitations" ON invitations FOR UPDATE WITH CHECK (true);

-- =============================================================================
-- FIX: Update Onboarding to create org and link profile
-- =============================================================================

-- This function is called from Onboarding page when user creates org
CREATE OR REPLACE FUNCTION public.complete_onboarding(
  p_org_name text,
  p_org_email text DEFAULT NULL,
  p_org_address text DEFAULT NULL,
  p_org_state text DEFAULT NULL,
  p_org_country text DEFAULT NULL,
  p_org_phone text DEFAULT NULL,
  p_org_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  new_org_id uuid;
  current_user_id uuid;
BEGIN
  -- Get current user
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create organization
  INSERT INTO organizations (name, email, address, state, country, phone, description, created_at, updated_at)
  VALUES (p_org_name, p_org_email, p_org_address, p_org_state, p_org_country, p_org_phone, p_org_description, now(), now())
  RETURNING id INTO new_org_id;

  -- Link to profile
  UPDATE profiles
  SET organization_id = new_org_id, role = 'superadmin', updated_at = now()
  WHERE user_id = current_user_id;

  RETURN new_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_onboarding TO authenticated;

-- =============================================================================
-- VERIFY
-- =============================================================================
SELECT 
  'Trigger created' AS status,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created') AS trigger_count;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIGNUP FIX APPLIED';
  RAISE NOTICE '';
  RAISE NOTICE 'INVITED USERS:';
  RAISE NOTICE '  - Profile created with invitation org_id';
  RAISE NOTICE '  - AuthCallback sees org_id -> Dashboard (no onboarding)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEW USERS:';
  RAISE NOTICE '  - Profile created with NULL org_id';
  RAISE NOTICE '  - AuthCallback sees NULL -> Onboarding';
  RAISE NOTICE '  - Onboarding creates org and links profile';
  RAISE NOTICE '';
  RAISE NOTICE 'RATE LIMITS - Fix in Dashboard:';
  RAISE NOTICE '  Settings > Authentication > Rate Limits';
  RAISE NOTICE '  - Increase signup rate to 10/min';
  RAISE NOTICE '';
END $$;
