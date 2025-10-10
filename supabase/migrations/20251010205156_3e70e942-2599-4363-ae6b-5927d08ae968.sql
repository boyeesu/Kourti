-- Update get_organization_users to fetch roles from user_role_assignments
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
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.user_id,
        p.email,
        p.first_name,
        p.last_name,
        -- Get primary role from user_role_assignments with priority order
        COALESCE(
          (SELECT role_name 
           FROM user_role_assignments ura 
           WHERE ura.user_id = p.user_id 
           AND ura.organization_id = p.organization_id
           ORDER BY 
             CASE 
               WHEN role_name = 'superadmin' THEN 1
               WHEN role_name = 'admin' THEN 2
               ELSE 3
             END
           LIMIT 1),
          'user'
        ) as role,
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
$function$;