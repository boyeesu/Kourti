-- First, let's handle existing data and create the organization for the current user

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
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;