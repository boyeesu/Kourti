-- Create case_types table
CREATE TABLE IF NOT EXISTS case_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create case_issues table
CREATE TABLE IF NOT EXISTS case_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id UUID NOT NULL REFERENCES case_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add index for faster lookups of issues by type
CREATE INDEX IF NOT EXISTS case_issues_case_type_id_idx ON case_issues(case_type_id);

-- Insert case types
INSERT INTO case_types (name, description) VALUES
('Civil Law', 'Disputes between individuals, businesses, or organizations'),
('Business/Corporate Law', 'Pertains to the formation, operation, and dissolution of businesses'),
('Family Law', 'Deals with legal matters related to family relationships'),
('Real Estate Law', 'Covers the purchase, sale, and use of property'),
('Estate Planning', 'Focuses on managing assets and affairs after death or incapacitation'),
('Criminal Law', 'Cases involving prosecution of individuals accused of breaking the law');

-- Insert case issues for Civil Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Car Accidents'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Medical Malpractice'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Slip and Fall Accidents'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Product Liability'),
((SELECT id FROM case_types WHERE name = 'Civil Law'), 'Wrongful Death');

-- Insert case issues for Business/Corporate Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Breach of Contract'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Business Formation'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Mergers and Acquisitions'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Intellectual Property Protection'),
((SELECT id FROM case_types WHERE name = 'Business/Corporate Law'), 'Employment Disputes');

-- Insert case issues for Family Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Divorce and Separation'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Child Custody and Support'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Adoption and Guardianship'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Prenuptial and Postnuptial Agreements'),
((SELECT id FROM case_types WHERE name = 'Family Law'), 'Domestic Violence and Restraining Orders');

-- Insert case issues for Real Estate Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Landlord/Tenant Disputes'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Property Disputes'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Real Estate Transactions'),
((SELECT id FROM case_types WHERE name = 'Real Estate Law'), 'Zoning and Land Use Issues');

-- Insert case issues for Estate Planning
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Drafting Wills and Trusts'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Probate Administration'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Guardianship and Conservatorship'),
((SELECT id FROM case_types WHERE name = 'Estate Planning'), 'Power of Attorney');

-- Insert case issues for Criminal Law
INSERT INTO case_issues (case_type_id, name) VALUES
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Felonies and Misdemeanors'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'DUI/DWI Offenses'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Drug Offenses'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Assault and Battery'),
((SELECT id FROM case_types WHERE name = 'Criminal Law'), 'Theft, Fraud, and White-Collar Crimes');

-- Add case_type_id and case_issue_id to the cases table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cases') THEN
    ALTER TABLE cases 
    ADD COLUMN IF NOT EXISTS case_type_id UUID REFERENCES case_types(id),
    ADD COLUMN IF NOT EXISTS case_issue_id UUID REFERENCES case_issues(id);
  END IF;
END $$;