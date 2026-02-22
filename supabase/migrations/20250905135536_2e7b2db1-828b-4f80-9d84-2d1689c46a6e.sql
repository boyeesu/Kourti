-- Insert common legal case types for De Barons Law Firm
INSERT INTO public.case_types (organization_id, name, description, is_active, created_by, created_at, updated_at)
VALUES 
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Corporate Law', 'Corporate legal matters including business formation, contracts, and compliance', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Real Estate Law', 'Property transactions, leases, and real estate disputes', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Employment Law', 'Employment contracts, workplace disputes, and labor law matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Commercial Litigation', 'Business disputes, contract breaches, and commercial lawsuits', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Intellectual Property', 'Trademark, copyright, and patent matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Family Law', 'Divorce, custody, and family legal matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Criminal Defense', 'Criminal law and defense matters', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now()),
  ('2e1c33a7-2ce0-425e-9477-1a22ede4e956', 'Tax Law', 'Tax compliance, disputes, and advisory services', true, 'e94b9ede-1b14-40d8-9686-fd10f0a36c82', now(), now());