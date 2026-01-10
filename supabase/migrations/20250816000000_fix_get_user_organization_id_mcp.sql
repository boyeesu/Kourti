-- Update get_user_organization_id to use Supabase MCP
-- This function will always pull organization_id from the current JWT/session context

CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS uuid AS $$
  SELECT current_setting('request.jwt.claims.org_id', true)::uuid;
$$ LANGUAGE SQL STABLE;
