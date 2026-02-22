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

