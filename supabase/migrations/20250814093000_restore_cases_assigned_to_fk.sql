-- Restore foreign key from cases.assigned_to to profiles(id)
ALTER TABLE public.cases
    ADD CONSTRAINT fk_cases_assigned_to
    FOREIGN KEY (assigned_to)
    REFERENCES public.profiles(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cases_assigned_to ON public.cases(assigned_to);
