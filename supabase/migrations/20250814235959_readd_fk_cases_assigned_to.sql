-- Re-add foreign key constraint for cases.assigned_to referencing profiles.user_id
ALTER TABLE public.cases
    ADD CONSTRAINT fk_cases_assigned_to
    FOREIGN KEY (assigned_to)
    REFERENCES public.profiles(user_id)
    ON DELETE SET NULL;
