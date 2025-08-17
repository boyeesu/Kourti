-- Add organization_id and created_by to case_types if they don't exist
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
-- No changes needed as they already use this function