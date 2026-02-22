-- Add task_type column to tasks table for flexible task categorization
ALTER TABLE public.tasks 
ADD COLUMN task_type text DEFAULT 'general';

-- Add index for task_type for better query performance
CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks(task_type);

-- Update existing tasks to have the general task type
UPDATE public.tasks SET task_type = 'general' WHERE task_type IS NULL;