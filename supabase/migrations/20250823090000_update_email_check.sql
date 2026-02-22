-- 2025-08-23 09:00  Replace email CHECK for clients with simple name@domain.com validation

-- Drop any previous email constraint
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS email_is_valid;

-- New constraint: allow NULL, otherwise must look like name@domain.com
ALTER TABLE public.clients
  ADD CONSTRAINT email_is_valid
  CHECK (
    email IS NULL
    OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  );
