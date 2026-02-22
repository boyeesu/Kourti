-- Fix critical security issues from previous migration

-- 1. Drop the security definer view and recreate properly
DROP VIEW IF EXISTS public.organization_users;

-- 2. Create a function instead of a security definer view to avoid the security warning
CREATE OR REPLACE FUNCTION public.get_organization_users(org_id uuid)
RETURNS TABLE(
    id uuid,
    user_id uuid,
    email text,
    first_name text,
    last_name text,
    role text,
    department text,
    status text,
    disabled_at timestamp with time zone,
    disabled_by uuid,
    verified_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone,
    organization_id uuid,
    user_type text,
    verification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.email,
        p.first_name,
        p.last_name,
        p.role::text as role,
        p.department,
        p.status,
        p.disabled_at,
        p.disabled_by,
        p.verified_at,
        p.last_login_at,
        p.created_at,
        p.organization_id,
        'user'::text as user_type,
        CASE WHEN p.verified_at IS NOT NULL THEN 'verified' ELSE 'unverified' END::text as verification_status
    FROM public.profiles p
    WHERE p.organization_id = org_id

    UNION ALL

    SELECT 
        i.id,
        NULL::uuid as user_id,
        i.email,
        i.first_name,
        i.last_name,
        i.role::text as role,
        i.department,
        i.status,
        NULL::timestamp with time zone as disabled_at,
        NULL::uuid as disabled_by,
        NULL::timestamp with time zone as verified_at,
        NULL::timestamp with time zone as last_login_at,
        i.created_at,
        i.organization_id,
        'invitation'::text as user_type,
        CASE 
            WHEN i.status = 'accepted' THEN 'verified'
            WHEN i.status = 'pending' THEN 'pending'
            ELSE 'expired'
        END::text as verification_status
    FROM public.invitations i
    WHERE i.organization_id = org_id 
      AND (i.status = 'pending' OR i.expires_at > now());
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_organization_users(uuid) TO authenticated;

-- Fix search_path for all functions that need it
ALTER FUNCTION public.notify_case_changes() SET search_path = public;
ALTER FUNCTION public.notify_client_changes() SET search_path = public;
ALTER FUNCTION public.notify_document_changes() SET search_path = public;
ALTER FUNCTION public.notify_contract_changes() SET search_path = public;
ALTER FUNCTION public.notify_calendar_changes() SET search_path = public;
ALTER FUNCTION public.notify_invoice_changes() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_new_user_with_invitation() SET search_path = public;
ALTER FUNCTION public.create_notification(uuid, uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.generate_invoice_number(uuid) SET search_path = public;
ALTER FUNCTION public.get_current_user_organization_id() SET search_path = public;
ALTER FUNCTION public.current_user_is_org_admin() SET search_path = public;
ALTER FUNCTION public.user_has_permission(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.is_user_admin() SET search_path = public;
ALTER FUNCTION public.enable_user(uuid) SET search_path = public;
ALTER FUNCTION public.disable_user(uuid) SET search_path = public;
ALTER FUNCTION public.match_best_practices(vector) SET search_path = public;
ALTER FUNCTION public.match_documents(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.match_contracts(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.get_user_organization_id() SET search_path = public;
ALTER FUNCTION public.analyze_document(uuid, text, text, text) SET search_path = public;
ALTER FUNCTION public.get_document_analysis(uuid, text) SET search_path = public;
ALTER FUNCTION public.initialize_custom_role_permissions(text, uuid, uuid) SET search_path = public;
ALTER FUNCTION public.trigger_initialize_custom_role_permissions() SET search_path = public;
ALTER FUNCTION public.accept_invitation_and_assign_roles(uuid, uuid) SET search_path = public;