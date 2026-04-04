-- Add 'chat' and 'negotiations' RBAC resources
-- These resources were previously unprotected or mapped to other resources.
-- This migration seeds default permissions so existing roles retain access.

-- For every organization that already has role_permissions rows,
-- grant chat and negotiations access to match existing defaults:
--   - admin/superadmin: already get all permissions via code fallback
--   - other roles: grant read access by default so existing users aren't locked out

-- Seed chat permissions for all existing org+role combos that have at least one permission
INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by, created_at, updated_at)
SELECT DISTINCT rp.role_name, rp.organization_id, 'chat', action.a, true, rp.created_by, now(), now()
FROM public.role_permissions rp
CROSS JOIN (VALUES ('create'), ('read'), ('update'), ('delete'), ('manage')) AS action(a)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions existing
  WHERE existing.role_name = rp.role_name
    AND existing.organization_id = rp.organization_id
    AND existing.resource = 'chat'
    AND existing.action = action.a
)
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;

-- Seed negotiations permissions for all existing org+role combos
INSERT INTO public.role_permissions (role_name, organization_id, resource, action, granted, created_by, created_at, updated_at)
SELECT DISTINCT rp.role_name, rp.organization_id, 'negotiations', action.a, true, rp.created_by, now(), now()
FROM public.role_permissions rp
CROSS JOIN (VALUES ('create'), ('read'), ('update'), ('delete'), ('manage')) AS action(a)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions existing
  WHERE existing.role_name = rp.role_name
    AND existing.organization_id = rp.organization_id
    AND existing.resource = 'negotiations'
    AND existing.action = action.a
)
ON CONFLICT (role_name, organization_id, resource, action) DO NOTHING;
