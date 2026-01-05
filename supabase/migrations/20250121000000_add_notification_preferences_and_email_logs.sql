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

