-- Global rate limiting table for edge functions
-- Survives cold starts; one row per user per minute window

CREATE TABLE IF NOT EXISTS rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

-- Auto-clean rows older than 1 hour to keep the table small
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);

-- Atomically increment counter; returns true if allowed, false if limit exceeded
CREATE OR REPLACE FUNCTION increment_rate_limit(
  p_user_id uuid,
  p_window_start timestamptz,
  p_max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Clean up old windows while we're here
  DELETE FROM rate_limits WHERE window_start < now() - interval '1 hour';

  INSERT INTO rate_limits (user_id, window_start, request_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_max_requests;
END;
$$;
