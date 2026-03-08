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
