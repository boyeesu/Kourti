-- Fix remaining duplicate permissive policies

-- ============================================
-- FIX: user_role_assignments - consolidate SELECT policies
-- ============================================
DROP POLICY IF EXISTS "Admins can manage role assignments" ON public.user_role_assignments;
DROP POLICY IF EXISTS "Users can view role assignments in their org" ON public.user_role_assignments;

-- Single SELECT policy for all users in org
CREATE POLICY "Users can view role assignments in their org" ON public.user_role_assignments
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

-- Separate policies for write operations (admins only)
CREATE POLICY "Admins can insert role assignments" ON public.user_role_assignments
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Admins can update role assignments" ON public.user_role_assignments
FOR UPDATE USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

CREATE POLICY "Admins can delete role assignments" ON public.user_role_assignments
FOR DELETE USING (
  organization_id = get_current_user_organization_id() 
  AND is_user_admin()
);

-- ============================================
-- FIX: voice_transcriptions - consolidate duplicate policies
-- ============================================
DROP POLICY IF EXISTS "Users can delete transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can delete voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can create transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can create voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can view transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can view voice transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can update transcriptions in their organization" ON public.voice_transcriptions;
DROP POLICY IF EXISTS "Users can update voice transcriptions in their organization" ON public.voice_transcriptions;

-- Single consolidated policies for voice_transcriptions
CREATE POLICY "Users can view transcriptions in their organization" ON public.voice_transcriptions
FOR SELECT USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can create transcriptions in their organization" ON public.voice_transcriptions
FOR INSERT WITH CHECK (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can update transcriptions in their organization" ON public.voice_transcriptions
FOR UPDATE USING (
  organization_id = get_current_user_organization_id()
);

CREATE POLICY "Users can delete transcriptions in their organization" ON public.voice_transcriptions
FOR DELETE USING (
  organization_id = get_current_user_organization_id()
);