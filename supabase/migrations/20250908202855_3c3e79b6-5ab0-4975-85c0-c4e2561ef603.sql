-- Make case types and case issues global (available to all users)

-- Update case_types table to make organization_id nullable and add global flag
ALTER TABLE case_types ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE case_types ADD COLUMN is_global boolean DEFAULT false;

-- Update case_issues table to make organization_id nullable  
ALTER TABLE case_issues ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE case_issues ADD COLUMN is_global boolean DEFAULT false;

-- Update RLS policies for case_types to allow global access
DROP POLICY IF EXISTS "Users can view case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can create case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can update case types in their organization" ON case_types;
DROP POLICY IF EXISTS "Users can delete case types in their organization" ON case_types;

-- New RLS policies for case_types - users can view global ones or their organization's
CREATE POLICY "Users can view case types" ON case_types FOR SELECT 
USING (
  is_global = true OR 
  organization_id = get_current_user_organization_id()
);

-- Only admins can manage case types now
CREATE POLICY "Only superadmins can manage case types" ON case_types FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Update RLS policies for case_issues to allow global access
DROP POLICY IF EXISTS "Users can view case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can create case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can update case issues in their organization" ON case_issues;
DROP POLICY IF EXISTS "Users can delete case issues in their organization" ON case_issues;

-- New RLS policies for case_issues - users can view global ones or their organization's
CREATE POLICY "Users can view case issues" ON case_issues FOR SELECT 
USING (
  is_global = true OR 
  organization_id = get_current_user_organization_id()
);

-- Only admins can manage case issues now
CREATE POLICY "Only superadmins can manage case issues" ON case_issues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = auth.uid() 
    AND role = 'superadmin'
  )
);

-- Insert some default global case types
INSERT INTO case_types (name, description, is_global, is_active) VALUES
('Personal Injury', 'Cases involving physical or psychological injury caused by negligence or intentional acts', true, true),
('Criminal Defense', 'Defense against criminal charges and prosecution', true, true),
('Family Law', 'Cases involving family relationships, divorce, custody, adoption', true, true),
('Corporate Law', 'Business-related legal matters including contracts, compliance, mergers', true, true),
('Real Estate', 'Property transactions, disputes, zoning, and real estate law', true, true),
('Employment Law', 'Workplace disputes, discrimination, wrongful termination', true, true),
('Intellectual Property', 'Patents, trademarks, copyrights, and trade secrets', true, true),
('Immigration', 'Visa applications, deportation defense, citizenship matters', true, true),
('Bankruptcy', 'Debt relief, reorganization, and bankruptcy proceedings', true, true),
('Contract Disputes', 'Breach of contract and commercial dispute resolution', true, true);

-- Insert some default case issues for each case type
INSERT INTO case_issues (case_type_id, name, description, is_global) 
SELECT ct.id, issue.name, issue.description, true
FROM case_types ct
CROSS JOIN (
  VALUES 
    ('Liability Assessment', 'Determining fault and legal responsibility'),
    ('Damages Calculation', 'Calculating monetary compensation and losses'),
    ('Evidence Collection', 'Gathering and preserving relevant evidence'),
    ('Settlement Negotiation', 'Negotiating resolution outside of court'),
    ('Court Preparation', 'Preparing for trial proceedings and litigation')
) AS issue(name, description)
WHERE ct.is_global = true;

-- Create table for contract templates
CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_content text NOT NULL,
  contract_type text NOT NULL,
  organization_id uuid REFERENCES organizations(id),
  created_by uuid REFERENCES auth.users(id),
  is_public boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on contract_templates
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for contract_templates
CREATE POLICY "Users can view public templates or their organization's templates" ON contract_templates FOR SELECT
USING (
  is_public = true OR 
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can create templates in their organization" ON contract_templates FOR INSERT
WITH CHECK (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can update their organization's templates" ON contract_templates FOR UPDATE
USING (organization_id = get_current_user_organization_id());

CREATE POLICY "Users can delete their organization's templates" ON contract_templates FOR DELETE
USING (organization_id = get_current_user_organization_id());

-- Update voice_transcriptions table to store audio file paths
ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS audio_file_url text;

-- Add trigger for updated_at on contract_templates
CREATE TRIGGER update_contract_templates_updated_at
  BEFORE UPDATE ON contract_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();