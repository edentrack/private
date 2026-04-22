/*
  # Daily Report Email Scheduling System

  ## Description
  This migration adds support for auto-scheduling daily farm reports via email.
  Each farm can enable automatic report delivery at a specified time in their local timezone.

  ## Changes to farms table
    - `report_schedule_enabled` (boolean, default false) - Whether to auto-send daily reports
    - `report_timezone` (text, default 'Africa/Douala') - Farm's local timezone (e.g., 'Africa/Cameroon', 'Africa/Lagos')

  ## New tables
    - `daily_report_sends` (logging table for delivery tracking)
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `sent_at` (timestamptz)
      - `delivery_status` ('success' | 'failed', default 'pending')
      - `error_message` (text, nullable)
      - `channel` (text, default 'email') - For future multi-channel support
      - `created_at` (timestamptz)

  ## How it works
    1. Edge Function `send-daily-report` runs hourly (triggered by pg_cron)
    2. For each farm with `report_schedule_enabled = true`:
       - Check current hour in farm's timezone
       - If hour == 18 (6 PM), trigger report generation and email
       - Log the result to `daily_report_sends`
    3. Email is sent to farm owner's email address (from profiles table)
    4. If email fails, status is logged and can be retried
*/

-- Add columns to farms table (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='farms' AND column_name='report_schedule_enabled'
  ) THEN
    ALTER TABLE farms ADD COLUMN report_schedule_enabled boolean DEFAULT false NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='farms' AND column_name='report_timezone'
  ) THEN
    ALTER TABLE farms ADD COLUMN report_timezone text DEFAULT 'Africa/Douala' NOT NULL;
  END IF;
END $$;

-- Create daily_report_sends table
CREATE TABLE IF NOT EXISTS daily_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'success', 'failed')),
  error_message text,
  channel text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Expression index instead of volatile-function constraint
CREATE UNIQUE INDEX IF NOT EXISTS report_sends_unique_daily_per_farm
  ON daily_report_sends (farm_id, date_trunc('day', sent_at AT TIME ZONE 'UTC'), channel);

-- Create index for querying recent sends
CREATE INDEX IF NOT EXISTS idx_daily_report_sends_farm_date ON daily_report_sends(farm_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_report_sends_status ON daily_report_sends(delivery_status, created_at DESC);

-- Enable RLS
ALTER TABLE daily_report_sends ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_report_sends
DROP POLICY IF EXISTS "Farm owners can view their report sends" ON daily_report_sends;
CREATE POLICY "Farm owners can view their report sends"
  ON daily_report_sends
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Service role can insert report sends" ON daily_report_sends;
CREATE POLICY "Service role can insert report sends"
  ON daily_report_sends
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update report sends" ON daily_report_sends;
CREATE POLICY "Service role can update report sends"
  ON daily_report_sends
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to get farms due for daily report send
-- Returns farms where current hour in their timezone = 18 (6 PM)
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
  SELECT
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
    AND EXTRACT(HOUR FROM now() AT TIME ZONE f.report_timezone) = 18;
$$;

-- Function to log a report send attempt
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
  ON CONFLICT (farm_id, date_trunc('day', sent_at AT TIME ZONE 'UTC'), channel)
  DO UPDATE SET
    delivery_status = p_status,
    error_message = p_error_message,
    sent_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
