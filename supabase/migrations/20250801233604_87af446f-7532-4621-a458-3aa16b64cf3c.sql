-- Remove all sample data to start fresh
DELETE FROM calendar_events WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM contracts WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM documents WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM cases WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM clients WHERE organization_id IN (
  SELECT id FROM organizations WHERE name LIKE '%Legal Solutions%'
);

DELETE FROM organizations WHERE name LIKE '%Legal Solutions%';