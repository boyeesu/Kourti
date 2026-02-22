-- Migration: Add has_permission wrapper function
-- This function wraps user_has_permission to automatically use auth.uid()

CREATE OR REPLACE FUNCTION public.has_permission(
  p_resource text,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Call user_has_permission with the current authenticated user
  RETURN public.user_has_permission(auth.uid(), p_resource, p_action);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.has_permission(text, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.has_permission IS 'Wrapper function that checks permissions for the current authenticated user. Calls user_has_permission with auth.uid().';

