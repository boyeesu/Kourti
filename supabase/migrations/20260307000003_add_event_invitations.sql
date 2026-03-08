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
DROP POLICY IF EXISTS event_invitations_select_policy ON event_invitations;
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
DROP POLICY IF EXISTS event_invitations_insert_policy ON event_invitations;
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
DROP POLICY IF EXISTS event_invitations_update_policy ON event_invitations;
CREATE POLICY event_invitations_update_policy ON event_invitations
    FOR UPDATE
    USING (
        auth.uid() = invited_by
        OR auth.uid() = invitee_user_id
        OR invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    );

-- Delete: Event creator only
DROP POLICY IF EXISTS event_invitations_delete_policy ON event_invitations;
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
