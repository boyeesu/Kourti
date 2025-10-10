-- Clean up orphan records in user_role_assignments that don't have matching profiles
DELETE FROM public.user_role_assignments
WHERE user_id NOT IN (SELECT user_id FROM public.profiles);

-- Add missing foreign key from user_role_assignments to profiles
-- This enables proper joins for role management queries
ALTER TABLE public.user_role_assignments
ADD CONSTRAINT user_role_assignments_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(user_id) 
ON DELETE CASCADE;