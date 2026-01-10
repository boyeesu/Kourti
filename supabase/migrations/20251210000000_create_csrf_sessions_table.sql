-- Migration: Create CSRF token sessions table
-- This table stores CSRF tokens for authenticated users

CREATE TABLE IF NOT EXISTS user_csrf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, csrf_token)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_user_id ON user_csrf_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_token ON user_csrf_sessions(csrf_token);
CREATE INDEX IF NOT EXISTS idx_user_csrf_sessions_expires_at ON user_csrf_sessions(expires_at);

-- Enable RLS
ALTER TABLE user_csrf_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own CSRF tokens
CREATE POLICY "Users can view their own CSRF tokens"
  ON user_csrf_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all tokens (for edge functions)
CREATE POLICY "Service role can manage all CSRF tokens"
  ON user_csrf_sessions
  FOR ALL
  USING (auth.role() = 'service_role');

-- Function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_csrf_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_csrf_sessions WHERE expires_at < NOW();
END;
$$;

-- Optional: Create a scheduled job to cleanup expired tokens
-- This would need to be set up in Supabase Dashboard > Database > Cron Jobs
-- Or use pg_cron extension if available

COMMENT ON TABLE user_csrf_sessions IS 'Stores CSRF tokens for authenticated user sessions';
COMMENT ON COLUMN user_csrf_sessions.csrf_token IS 'Cryptographically secure CSRF token (64 hex characters)';
COMMENT ON COLUMN user_csrf_sessions.expires_at IS 'Token expiration timestamp (typically 24 hours from creation)';
