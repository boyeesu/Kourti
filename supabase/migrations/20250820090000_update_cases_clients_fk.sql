-- 2025-08-20 09:00 Ensure cases.client_id FK references clients.id with correct constraint name

ALTER TABLE public.cases
DROP CONSTRAINT IF EXISTS fk_cases_clients;

ALTER TABLE public.cases
  ADD CONSTRAINT fk_cases_client_id
  FOREIGN KEY (client_id)
  REFERENCES public.clients (id)
  ON DELETE SET NULL;
