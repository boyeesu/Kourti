-- 2025-08-18 09:00 Add foreign key from cases.client_id to clients.id

ALTER TABLE public.cases
  ADD CONSTRAINT fk_cases_clients
  FOREIGN KEY (client_id)
  REFERENCES public.clients (id)
  ON DELETE SET NULL;
