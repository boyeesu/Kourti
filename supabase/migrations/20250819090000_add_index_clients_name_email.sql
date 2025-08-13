-- 2025-08-19 09:00 Add indexes to clients on name and email for faster queries

CREATE INDEX idx_clients_name ON public.clients (lower(name));
CREATE INDEX idx_clients_email ON public.clients (lower(email));
