-- Switch from daily to weekly report scheduling
-- Reports now send once per week on a chosen day at 6 PM local time

-- Add report_day_of_week column (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='farms' AND column_name='report_day_of_week'
  ) THEN
    ALTER TABLE farms ADD COLUMN report_day_of_week integer DEFAULT 1 NOT NULL
      CHECK (report_day_of_week BETWEEN 0 AND 6);
  END IF;
END $$;

-- Fix the broken unique constraint (can't use volatile function in CONSTRAINT UNIQUE)
-- Drop old constraint and replace with a proper expression index
ALTER TABLE daily_report_sends
  DROP CONSTRAINT IF EXISTS report_sends_unique_daily_per_farm;

-- Unique per farm per ISO week per channel (prevents double-sending in same week)
CREATE UNIQUE INDEX IF NOT EXISTS report_sends_unique_weekly_per_farm
  ON daily_report_sends (
    farm_id,
    date_trunc('week', sent_at AT TIME ZONE 'UTC'),
    channel
  );

-- Update the function: check day-of-week AND hour instead of just hour
CREATE OR REPLACE FUNCTION get_farms_due_for_daily_report()
RETURNS TABLE (
  farm_id uuid,
  farm_name text,
  owner_email text,
  timezone text
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (f.id)
    f.id,
    f.name,
    p.email,
    f.report_timezone
  FROM farms f
  JOIN farm_members fm ON f.id = fm.farm_id
  JOIN profiles p ON fm.user_id = p.id
  WHERE f.report_schedule_enabled = true
    AND fm.role = 'owner'
    AND fm.is_active = true
    AND p.email IS NOT NULL
    -- Correct day of week in farm's local timezone
    AND EXTRACT(DOW FROM now() AT TIME ZONE f.report_timezone)::integer = f.report_day_of_week
    -- At 6 PM local time (window: >= 18:00)
    AND EXTRACT(HOUR FROM now() AT TIME ZONE f.report_timezone) >= 18
    -- Not already sent this week
    AND NOT EXISTS (
      SELECT 1 FROM daily_report_sends drs
      WHERE drs.farm_id = f.id
        AND drs.channel = 'email'
        AND drs.delivery_status = 'success'
        AND date_trunc('week', drs.sent_at AT TIME ZONE 'UTC')
            = date_trunc('week', now() AT TIME ZONE 'UTC')
    );
$$;

-- Update log_report_send to use the new index-compatible ON CONFLICT
CREATE OR REPLACE FUNCTION log_report_send(
  p_farm_id uuid,
  p_status text,
  p_error_message text DEFAULT NULL,
  p_channel text DEFAULT 'email'
)
RETURNS daily_report_sends
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result daily_report_sends;
BEGIN
  INSERT INTO daily_report_sends (farm_id, delivery_status, error_message, channel)
  VALUES (p_farm_id, p_status, p_error_message, p_channel)
  ON CONFLICT (farm_id, date_trunc('week', sent_at AT TIME ZONE 'UTC'), channel)
  DO UPDATE SET
    delivery_status = p_status,
    error_message = p_error_message,
    sent_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
