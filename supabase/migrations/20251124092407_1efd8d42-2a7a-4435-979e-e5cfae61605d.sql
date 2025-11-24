-- SECURITY FIX: Make domain field mandatory for SSO configurations
-- This ensures all SSO configs must specify their authorized email domain

-- Add NOT NULL constraint to domain field (after setting a default for existing rows)
UPDATE organization_sso_configs 
SET domain = COALESCE(domain, 'example.com')
WHERE domain IS NULL OR domain = '';

ALTER TABLE organization_sso_configs 
ALTER COLUMN domain SET NOT NULL;

-- Add check constraint to ensure domain is not empty
ALTER TABLE organization_sso_configs
ADD CONSTRAINT domain_not_empty CHECK (domain IS NOT NULL AND length(trim(domain)) > 0);

-- Add index for faster domain lookups
CREATE INDEX IF NOT EXISTS idx_org_sso_configs_domain ON organization_sso_configs(lower(domain), provider) WHERE is_enabled = true;

-- Update RLS policy to ensure only superadmins can manage SSO configs
DROP POLICY IF EXISTS "Superadmins can manage SSO config" ON organization_sso_configs;

CREATE POLICY "Superadmins can manage SSO config"
  ON organization_sso_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      WHERE ura.user_id = auth.uid()
      AND ura.role_name = 'superadmin'
      AND ura.organization_id = organization_sso_configs.organization_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_role_assignments ura
      WHERE ura.user_id = auth.uid()
      AND ura.role_name = 'superadmin'
      AND ura.organization_id = organization_sso_configs.organization_id
    )
  );

COMMENT ON COLUMN organization_sso_configs.domain IS 'Required email domain for SSO authentication (e.g., company.com). Used to match user emails to organizations.';
