-- Security fix: Remove GRANT to authenticated role on match_document_chunks_for_org.
-- This SECURITY DEFINER function accepts an arbitrary org_id parameter,
-- so granting it to authenticated users allows cross-tenant data leakage.
-- Only service_role (used by edge functions) should call this function.

REVOKE EXECUTE ON FUNCTION match_document_chunks_for_org(vector(1536), uuid, float, int) FROM authenticated;
