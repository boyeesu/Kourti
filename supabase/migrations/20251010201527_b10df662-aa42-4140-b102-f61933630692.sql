-- Fix duplicate foreign key constraint on cases.assigned_to
-- Drop the older constraint and keep the newer one with clearer naming

-- Drop the old constraint if it exists
ALTER TABLE public.cases DROP CONSTRAINT IF EXISTS fk_cases_assigned_to;

-- Ensure the new constraint exists (it should from previous migrations)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_cases_assigned_to_profile' 
        AND conrelid = 'public.cases'::regclass
    ) THEN
        ALTER TABLE public.cases 
            ADD CONSTRAINT fk_cases_assigned_to_profile 
            FOREIGN KEY (assigned_to) REFERENCES public.profiles(user_id) ON DELETE SET NULL;
    END IF;
END $$;