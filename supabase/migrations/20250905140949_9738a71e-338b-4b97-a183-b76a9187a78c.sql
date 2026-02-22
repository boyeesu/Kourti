-- Insert case issues for each case type for De Barons Law Firm
-- Corporate Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Corporate Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Business Formation', 'Incorporation, LLC formation, partnership agreements'),
    ('Mergers & Acquisitions', 'Company mergers, acquisitions, and due diligence'),
    ('Corporate Compliance', 'Regulatory compliance and corporate governance'),
    ('Contract Negotiation', 'Commercial contracts and business agreements'),
    ('Corporate Restructuring', 'Business restructuring and reorganization')
) AS issue(name, description);

-- Real Estate Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Real Estate Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Property Purchase/Sale', 'Residential and commercial property transactions'),
    ('Lease Agreements', 'Commercial and residential lease negotiations'),
    ('Property Disputes', 'Boundary disputes, title issues, and property conflicts'),
    ('Zoning Issues', 'Zoning applications and land use matters'),
    ('Real Estate Development', 'Development projects and construction contracts')
) AS issue(name, description);

-- Employment Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Employment Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Wrongful Termination', 'Unlawful dismissal and employment contract breaches'),
    ('Workplace Discrimination', 'Discrimination based on protected characteristics'),
    ('Wage & Hour Disputes', 'Overtime, minimum wage, and compensation issues'),
    ('Sexual Harassment', 'Workplace harassment and hostile work environment'),
    ('Employment Contracts', 'Employment agreement drafting and review')
) AS issue(name, description);

-- Commercial Litigation case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Commercial Litigation' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Contract Breach', 'Breach of commercial contracts and agreements'),
    ('Business Partnership Disputes', 'Partnership conflicts and dissolution'),
    ('Debt Collection', 'Commercial debt recovery and collection'),
    ('Shareholder Disputes', 'Corporate shareholder conflicts and rights'),
    ('Trade Secret Litigation', 'Protection of confidential business information')
) AS issue(name, description);

-- Intellectual Property case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Intellectual Property' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Trademark Registration', 'Trademark applications and registrations'),
    ('Patent Applications', 'Patent filing and prosecution'),
    ('Copyright Protection', 'Copyright registration and enforcement'),
    ('IP Infringement', 'Intellectual property infringement litigation'),
    ('Licensing Agreements', 'IP licensing and technology transfer')
) AS issue(name, description);

-- Family Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Family Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Divorce Proceedings', 'Divorce petitions and marital dissolution'),
    ('Child Custody', 'Child custody arrangements and modifications'),
    ('Child Support', 'Child support calculations and enforcement'),
    ('Adoption', 'Adoption proceedings and legal guardianship'),
    ('Domestic Violence', 'Restraining orders and protection matters')
) AS issue(name, description);

-- Criminal Defense case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Criminal Defense' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('DUI/DWI Defense', 'Driving under the influence charges'),
    ('Theft & Fraud', 'Theft, embezzlement, and fraud charges'),
    ('Assault & Battery', 'Violent crime defense'),
    ('Drug Offenses', 'Drug possession and trafficking charges'),
    ('White Collar Crime', 'Financial crimes and regulatory violations')
) AS issue(name, description);

-- Tax Law case issues
INSERT INTO public.case_issues (organization_id, case_type_id, name, description, created_at, updated_at)
SELECT 
  '2e1c33a7-2ce0-425e-9477-1a22ede4e956' as organization_id,
  ct.id as case_type_id,
  issue.name,
  issue.description,
  now() as created_at,
  now() as updated_at
FROM (
  SELECT id FROM public.case_types WHERE name = 'Tax Law' AND organization_id = '2e1c33a7-2ce0-425e-9477-1a22ede4e956'
) ct
CROSS JOIN (
  VALUES 
    ('Tax Audit Defense', 'IRS and state tax audit representation'),
    ('Tax Dispute Resolution', 'Tax controversy and appeals'),
    ('Tax Planning', 'Strategic tax planning and compliance'),
    ('Business Tax Issues', 'Corporate and business tax matters'),
    ('International Tax', 'Cross-border tax compliance and planning')
) AS issue(name, description);