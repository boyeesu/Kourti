-- Add title column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN title TEXT;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN public.profiles.title IS 'Job title or position of the user';