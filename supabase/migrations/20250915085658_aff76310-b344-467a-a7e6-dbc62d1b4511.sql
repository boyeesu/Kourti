-- Create notification triggers for all modules
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
  FOR EACH ROW EXECUTE FUNCTION notify_invoice_changes();