-- Add state and country fields to organizations table
ALTER TABLE public.organizations 
ADD COLUMN state TEXT,
ADD COLUMN country TEXT;