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
DROP POLICY IF EXISTS calendar_shares_select_policy ON calendar_shares;
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
DROP POLICY IF EXISTS calendar_shares_insert_policy ON calendar_shares;
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
DROP POLICY IF EXISTS calendar_shares_update_policy ON calendar_shares;
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
DROP POLICY IF EXISTS calendar_shares_delete_policy ON calendar_shares;
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
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'valid_calendar_color'
    ) THEN
        ALTER TABLE profiles
        ADD CONSTRAINT valid_calendar_color
        CHECK (calendar_color ~ '^#[0-9A-Fa-f]{6}$');
    END IF;
END $$;

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
