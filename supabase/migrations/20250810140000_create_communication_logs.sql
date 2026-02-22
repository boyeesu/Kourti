-- 20250810140000_create_communication_logs.sql
-- Adds communication_logs table for client interactions

SET search_path = auth, public;

CREATE TABLE IF NOT EXISTS public.communication_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  type text NOT NULL,            -- 'email','phone','note'
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_logs_client_id ON public.communication_logs(client_id);

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members select commlogs" ON public.communication_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  );

CREATE POLICY "org members modify commlogs" ON public.communication_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = communication_logs.client_id
      AND c.organization_id = get_user_organization_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.communication_logs TO authenticated;
