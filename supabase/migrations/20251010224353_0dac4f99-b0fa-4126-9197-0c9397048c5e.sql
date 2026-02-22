-- Fix RLS policy conflict on clients table
-- Drop the permissive policy that grants organization-wide access
-- Keep only the restrictive policy that limits access to assigned clients

DROP POLICY IF EXISTS "Users can view clients in their organization" ON public.clients;

-- The restrictive policy "Users can view clients they're assigned to" will remain
-- This ensures users can only see:
-- 1. Clients they created
-- 2. Clients assigned to cases they're working on
-- 3. All clients if they're an admin

COMMENT ON POLICY "Users can view clients they're assigned to" ON public.clients 
IS 'Users can only view clients they created or are assigned to via cases, or all clients if admin';