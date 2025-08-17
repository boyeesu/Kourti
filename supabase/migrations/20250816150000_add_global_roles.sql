-- Add global user roles and support for custom per-organization roles
-- Up Migration

-- Note: This migration is split into separate statements to handle enum transaction issues

-- PART 1: Create or modify enum type
-- 1. Ensure user_role enum exists with base values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- If creating new, include all values at once
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');
  END IF;
END$$;

-- 2. Create global_roles lookup table (idempotent)
CREATE TABLE IF NOT EXISTS public.global_roles (
  role text PRIMARY KEY, -- Using text instead of enum to avoid transaction issues
  display_name text NOT NULL,
  description text
);

-- Make table read-only (no INSERT/UPDATE/DELETE through RLS except by superuser)
ALTER TABLE public.global_roles ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to SELECT global roles
CREATE POLICY "Public read global roles" ON public.global_roles
  FOR SELECT USING (true);

-- 3. Seed the global_roles table with known values
INSERT INTO public.global_roles(role, display_name, description) VALUES
  ('superadmin', 'Super Admin', 'Creator/Owner of the organisation with full permissions'),
  ('finance', 'Finance', 'Manage billing and payments'),
  ('administrator', 'Administrator', 'Manage users, roles and settings'),
  ('legal', 'Legal', 'Access legal documents and case files')
ON CONFLICT (role) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description;

-- 4. Ensure profiles.role column default stays valid
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';

-- 5. Migration for enum values must be applied separately after commit
-- COMMENT OUT the enum modification and profile update for now
/*
-- Execute these separately after this migration is committed:

-- Add new enum values if needed
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'finance';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'administrator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'legal';

-- Update any existing profiles that used 'admin' to 'administrator' for consistency
UPDATE public.profiles SET role = 'administrator' WHERE role = 'admin';
*/

-- Down Migration
-- To roll back, delete seeded rows and values. (Manual instructions provided as automated down for enum value removal is not supported without recreate.)
