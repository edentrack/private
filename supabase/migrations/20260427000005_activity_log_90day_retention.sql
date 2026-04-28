-- Extend activity log retention from 7 days to 90 days
DROP FUNCTION IF EXISTS cleanup_old_team_activity_logs();

CREATE OR REPLACE FUNCTION cleanup_old_team_activity_logs()
RETURNS TABLE(deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count bigint;
BEGIN
  DELETE FROM team_activity_logs
  WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;
