-- Add global user roles and support for custom per-organization roles
-- Up Migration

-- 1. Ensure user_role enum exists with new values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'finance', 'administrator', 'legal', 'user');
  ELSE
    -- Add new labels if they do not yet exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'finance' AND enumtypid = 'user_role'::regtype) THEN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'administrator' AND enumtypid = 'user_role'::regtype) THEN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'administrator';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'legal' AND enumtypid = 'user_role'::regtype) THEN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'legal';
    END IF;
  END IF;
END$$;

-- 2. Create global_roles lookup table (idempotent)
CREATE TABLE IF NOT EXISTS public.global_roles (
  role user_role PRIMARY KEY,
  display_name text NOT NULL,
  description text
);

-- Make table read-only (no INSERT/UPDATE/DELETE through RLS except by superuser)
ALTER TABLE public.global_roles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT global roles
CREATE POLICY "Public read global roles" ON public.global_roles
  FOR SELECT USING (true);

-- 3. Seed the global_roles table (upsert)
INSERT INTO public.global_roles(role, display_name, description) VALUES
  ('superadmin', 'Super Admin', 'Creator/Owner of the organisation with full permissions'),
  ('finance',     'Finance',      'Manage billing and payments'),
  ('administrator','Administrator','Manage users, roles and settings'),
  ('legal',       'Legal',        'Access legal documents and case files')
ON CONFLICT (role) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 4. Ensure profiles.role column default stays valid
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';

-- 5. (Optional) Update any existing profiles that used 'admin' to 'administrator' for consistency
UPDATE public.profiles SET role = 'administrator' WHERE role = 'admin';

-- Down Migration
-- To roll back, delete seeded rows and values. (Manual instructions provided as automated down for enum value removal is not supported without recreate.)
