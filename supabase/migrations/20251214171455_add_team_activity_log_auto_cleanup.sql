/*
  # Team Activity Log Auto-Cleanup System

  1. New Functions
    - `cleanup_old_team_activity_logs()` - Deletes activity logs older than 7 days
    - Schedules automatic cleanup every Sunday at 2 AM UTC

  2. Changes
    - Enables pg_cron extension if available
    - Schedules automatic cleanup every Sunday at 2 AM UTC
    - Provides manual cleanup function for environments without pg_cron

  3. Notes
    - Activity logs older than 7 days are automatically deleted
    - If pg_cron is not available, cleanup can be triggered manually or via external scheduler
*/

-- Create function to cleanup old activity logs
CREATE OR REPLACE FUNCTION cleanup_old_team_activity_logs()
RETURNS TABLE(deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_rows bigint;
BEGIN
  -- Delete activity logs older than 7 days
  DELETE FROM team_activity_logs
  WHERE created_at < (now() - interval '7 days');

  GET DIAGNOSTICS deleted_rows = ROW_COUNT;

  -- Return the number of deleted rows
  RETURN QUERY SELECT deleted_rows;
END;
$$;

-- Try to enable pg_cron extension (will silently fail if not available)
DO $$
BEGIN
  -- Only try to create extension if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
    EXCEPTION
      WHEN OTHERS THEN
        -- Extension not available, continue without it
        RAISE NOTICE 'pg_cron extension not available. Auto-cleanup must be scheduled externally.';
    END;
  END IF;
END $$;

-- Schedule automatic cleanup (only if pg_cron is available)
DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists
    PERFORM cron.unschedule('cleanup-team-activity-logs');

    -- Schedule cleanup to run every Sunday at 2 AM UTC
    PERFORM cron.schedule(
      'cleanup-team-activity-logs',
      '0 2 * * 0',
      'SELECT cleanup_old_team_activity_logs();'
    );

    RAISE NOTICE 'Scheduled automatic activity log cleanup every Sunday at 2 AM UTC';
  ELSE
    RAISE NOTICE 'Manual cleanup required: Call cleanup_old_team_activity_logs() periodically';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule automatic cleanup. Manual execution required.';
END $$;

-- Add comment to the cleanup function
COMMENT ON FUNCTION cleanup_old_team_activity_logs() IS
'Deletes team activity logs older than 7 days. Returns the number of deleted records.
Can be called manually or scheduled to run automatically.';
