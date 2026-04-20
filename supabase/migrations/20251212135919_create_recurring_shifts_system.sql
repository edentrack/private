/*
  # Create Recurring Shifts System

  1. New Tables
    - `shift_templates`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, foreign key to farms)
      - `worker_id` (uuid, foreign key to profiles)
      - `title` (text, optional shift title)
      - `start_time` (time, shift start time)
      - `end_time` (time, shift end time)
      - `timezone` (text, timezone for the shift)
      - `frequency` (text, daily/weekly/monthly)
      - `interval` (integer, repeat every N days/weeks/months)
      - `days_of_week` (integer array, 0=Sunday, 6=Saturday)
      - `day_of_month` (integer, for monthly schedules)
      - `start_date` (date, when recurrence starts)
      - `end_date` (date, nullable, when recurrence ends)
      - `is_active` (boolean, whether template is active)
      - `created_by` (uuid, foreign key to profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Schema Changes
    - Add `template_id` to `worker_shifts` table
    - Add unique constraint to prevent duplicate shift instances

  3. Functions
    - `generate_shifts_for_template` - Generate shift instances for a template
    - `generate_shifts_for_farm` - Generate shifts for all active templates in a farm

  4. Security
    - Enable RLS on `shift_templates`
    - Add policies for farm member access
    - Only owner/manager can create/update/delete templates
*/

-- Create shift_templates table
CREATE TABLE IF NOT EXISTS shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text,
  start_time time NOT NULL,
  end_time time NOT NULL,
  timezone text DEFAULT 'UTC',
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  interval int NOT NULL DEFAULT 1 CHECK (interval > 0),
  days_of_week int[] DEFAULT ARRAY[]::int[],
  day_of_month int CHECK (day_of_month >= 1 AND day_of_month <= 31),
  start_date date NOT NULL,
  end_date date,
  is_active boolean DEFAULT true,
  created_by uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_end_date CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Add template_id to worker_shifts if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'worker_shifts' AND column_name = 'template_id'
  ) THEN
    ALTER TABLE worker_shifts ADD COLUMN template_id uuid REFERENCES shift_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create unique constraint to prevent duplicate shift instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'worker_shifts_template_date_unique'
  ) THEN
    ALTER TABLE worker_shifts
    ADD CONSTRAINT worker_shifts_template_date_unique
    UNIQUE NULLS NOT DISTINCT (template_id, shift_date);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for shift_templates

-- Farm members can view templates
CREATE POLICY "Farm members can view shift templates"
  ON shift_templates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = shift_templates.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

-- Only owner/manager can create templates
CREATE POLICY "Owner and manager can create shift templates"
  ON shift_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = shift_templates.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );

-- Only owner/manager can update templates
CREATE POLICY "Owner and manager can update shift templates"
  ON shift_templates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = shift_templates.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = shift_templates.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );

-- Only owner/manager can delete templates
CREATE POLICY "Owner and manager can delete shift templates"
  ON shift_templates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = shift_templates.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );

-- Function to generate shifts for a specific template
CREATE OR REPLACE FUNCTION generate_shifts_for_template(
  p_template_id uuid,
  p_until date
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template shift_templates%ROWTYPE;
  v_current_date date;
  v_shift_date date;
  v_day_of_week int;
  v_shifts_created int := 0;
  v_inserted boolean;
BEGIN
  -- Get the template
  SELECT * INTO v_template
  FROM shift_templates
  WHERE id = p_template_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Start from template start_date or today (whichever is later)
  v_current_date := GREATEST(v_template.start_date, CURRENT_DATE);

  -- Generate shifts up to p_until or template end_date (whichever is earlier)
  IF v_template.end_date IS NOT NULL THEN
    p_until := LEAST(p_until, v_template.end_date);
  END IF;

  -- Generate shifts based on frequency
  WHILE v_current_date <= p_until LOOP
    v_shift_date := NULL;

    -- Daily frequency
    IF v_template.frequency = 'daily' THEN
      v_shift_date := v_current_date;
      v_current_date := v_current_date + (v_template.interval || ' days')::interval;

    -- Weekly frequency
    ELSIF v_template.frequency = 'weekly' THEN
      v_day_of_week := EXTRACT(DOW FROM v_current_date)::int;

      IF v_day_of_week = ANY(v_template.days_of_week) THEN
        v_shift_date := v_current_date;
      END IF;

      v_current_date := v_current_date + '1 day'::interval;

      -- Skip to next week if we've completed all days
      IF EXTRACT(DOW FROM v_current_date) = 0 THEN
        v_current_date := v_current_date + ((v_template.interval - 1) * 7 || ' days')::interval;
      END IF;

    -- Monthly frequency
    ELSIF v_template.frequency = 'monthly' THEN
      IF EXTRACT(DAY FROM v_current_date) = v_template.day_of_month THEN
        v_shift_date := v_current_date;
      END IF;

      v_current_date := v_current_date + '1 day'::interval;

      -- Skip to next month if we've passed the target day
      IF EXTRACT(DAY FROM v_current_date) = 1 THEN
        v_current_date := v_current_date + ((v_template.interval - 1) || ' months')::interval;
      END IF;
    END IF;

    -- Create shift if date is valid
    IF v_shift_date IS NOT NULL AND v_shift_date <= p_until THEN
      -- Insert shift (on conflict do nothing prevents duplicates)
      INSERT INTO worker_shifts (
        farm_id,
        worker_id,
        shift_date,
        start_time,
        end_time,
        template_id,
        status,
        created_at,
        created_by
      )
      VALUES (
        v_template.farm_id,
        v_template.worker_id,
        v_shift_date,
        v_template.start_time,
        v_template.end_time,
        p_template_id,
        'scheduled',
        now(),
        v_template.created_by
      )
      ON CONFLICT (template_id, shift_date) DO NOTHING;

      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted THEN
        v_shifts_created := v_shifts_created + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_shifts_created;
END;
$$;

-- Function to generate shifts for all active templates in a farm
CREATE OR REPLACE FUNCTION generate_shifts_for_farm(
  p_farm_id uuid,
  p_until date
)
RETURNS TABLE(template_id uuid, shifts_created int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template_rec RECORD;
  v_count int;
BEGIN
  FOR v_template_rec IN
    SELECT id FROM shift_templates
    WHERE farm_id = p_farm_id AND is_active = true
  LOOP
    v_count := generate_shifts_for_template(v_template_rec.id, p_until);
    template_id := v_template_rec.id;
    shifts_created := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_shift_templates_farm_active
  ON shift_templates(farm_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_worker_shifts_template
  ON worker_shifts(template_id)
  WHERE template_id IS NOT NULL;
