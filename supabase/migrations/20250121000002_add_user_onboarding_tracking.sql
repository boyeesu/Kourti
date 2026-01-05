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

