/*
  # Expense Forecasting System

  1. New Tables
    - `flock_forecast_weeks`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `week_number` (integer)
      - `week_start_date` (date)
      - `week_end_date` (date)
      - `is_locked` (boolean)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (flock_id, week_number)

    - `flock_forecast_items`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `forecast_week_id` (uuid, references flock_forecast_weeks)
      - `category` (text, check constraint)
      - `item_name` (text)
      - `quantity` (numeric, nullable)
      - `unit` (text, nullable)
      - `unit_cost` (numeric, nullable)
      - `total_cost` (numeric, generated/stored)
      - `notes` (text, nullable)
      - `source` (text, check constraint)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Farm members can SELECT (read-only for workers/viewers)
    - Only owner/manager can INSERT/UPDATE/DELETE
    - Helper function `is_farm_member` for permission checks

  3. RPCs
    - `ensure_flock_forecast_weeks` - Creates missing weeks for a flock
    - `get_flock_forecast_rollup` - Returns weekly totals + category breakdown
    - `get_farm_forecast_rollup` - Returns totals by flock for entire farm
*/

-- =============================================
-- 0) HELPER FUNCTIONS
-- =============================================

-- Helper function to check if user is any member of farm
CREATE OR REPLACE FUNCTION is_farm_member(p_farm_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM farm_members
    WHERE farm_id = p_farm_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$$;

-- =============================================
-- 1) TABLES
-- =============================================

CREATE TABLE IF NOT EXISTS flock_forecast_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flock_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_flock_forecast_weeks_farm_id ON flock_forecast_weeks(farm_id);
CREATE INDEX IF NOT EXISTS idx_flock_forecast_weeks_flock_id ON flock_forecast_weeks(flock_id);

CREATE TABLE IF NOT EXISTS flock_forecast_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid NOT NULL REFERENCES flocks(id) ON DELETE CASCADE,
  forecast_week_id uuid NOT NULL REFERENCES flock_forecast_weeks(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('feed','vaccines','medication','labor','utilities','transport','misc')),
  item_name text NOT NULL,
  quantity numeric NULL,
  unit text NULL,
  unit_cost numeric NULL,
  total_cost numeric GENERATED ALWAYS AS (
    CASE
      WHEN quantity IS NULL OR unit_cost IS NULL THEN NULL
      ELSE (quantity * unit_cost)
    END
  ) STORED,
  notes text NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested','from_inventory','from_vaccine_schedule')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flock_forecast_items_farm_id ON flock_forecast_items(farm_id);
CREATE INDEX IF NOT EXISTS idx_flock_forecast_items_flock_id ON flock_forecast_items(flock_id);
CREATE INDEX IF NOT EXISTS idx_flock_forecast_items_week_id ON flock_forecast_items(forecast_week_id);

-- =============================================
-- 2) UPDATED_AT TRIGGERS
-- =============================================

CREATE OR REPLACE FUNCTION update_flock_forecast_weeks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flock_forecast_weeks_updated_at ON flock_forecast_weeks;
CREATE TRIGGER flock_forecast_weeks_updated_at
  BEFORE UPDATE ON flock_forecast_weeks
  FOR EACH ROW
  EXECUTE FUNCTION update_flock_forecast_weeks_updated_at();

CREATE OR REPLACE FUNCTION update_flock_forecast_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS flock_forecast_items_updated_at ON flock_forecast_items;
CREATE TRIGGER flock_forecast_items_updated_at
  BEFORE UPDATE ON flock_forecast_items
  FOR EACH ROW
  EXECUTE FUNCTION update_flock_forecast_items_updated_at();

-- =============================================
-- 3) RLS POLICIES
-- =============================================

ALTER TABLE flock_forecast_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flock_forecast_items ENABLE ROW LEVEL SECURITY;

-- Policies: flock_forecast_weeks
DROP POLICY IF EXISTS "ffw_select_member" ON flock_forecast_weeks;
CREATE POLICY "ffw_select_member"
ON flock_forecast_weeks
FOR SELECT
TO authenticated
USING (is_farm_member(farm_id));

DROP POLICY IF EXISTS "ffw_insert_owner_manager" ON flock_forecast_weeks;
CREATE POLICY "ffw_insert_owner_manager"
ON flock_forecast_weeks
FOR INSERT
TO authenticated
WITH CHECK (is_farm_owner_or_manager(farm_id));

DROP POLICY IF EXISTS "ffw_update_owner_manager" ON flock_forecast_weeks;
CREATE POLICY "ffw_update_owner_manager"
ON flock_forecast_weeks
FOR UPDATE
TO authenticated
USING (is_farm_owner_or_manager(farm_id))
WITH CHECK (is_farm_owner_or_manager(farm_id));

DROP POLICY IF EXISTS "ffw_delete_owner_manager" ON flock_forecast_weeks;
CREATE POLICY "ffw_delete_owner_manager"
ON flock_forecast_weeks
FOR DELETE
TO authenticated
USING (is_farm_owner_or_manager(farm_id));

-- Policies: flock_forecast_items
DROP POLICY IF EXISTS "ffi_select_member" ON flock_forecast_items;
CREATE POLICY "ffi_select_member"
ON flock_forecast_items
FOR SELECT
TO authenticated
USING (is_farm_member(farm_id));

DROP POLICY IF EXISTS "ffi_insert_owner_manager" ON flock_forecast_items;
CREATE POLICY "ffi_insert_owner_manager"
ON flock_forecast_items
FOR INSERT
TO authenticated
WITH CHECK (is_farm_owner_or_manager(farm_id));

DROP POLICY IF EXISTS "ffi_update_owner_manager" ON flock_forecast_items;
CREATE POLICY "ffi_update_owner_manager"
ON flock_forecast_items
FOR UPDATE
TO authenticated
USING (is_farm_owner_or_manager(farm_id))
WITH CHECK (is_farm_owner_or_manager(farm_id));

DROP POLICY IF EXISTS "ffi_delete_owner_manager" ON flock_forecast_items;
CREATE POLICY "ffi_delete_owner_manager"
ON flock_forecast_items
FOR DELETE
TO authenticated
USING (is_farm_owner_or_manager(farm_id));

-- =============================================
-- 4) RPCs
-- =============================================

-- A) ensure_flock_forecast_weeks
-- Creates missing weeks for a flock based on its cycle configuration
CREATE OR REPLACE FUNCTION ensure_flock_forecast_weeks(
  p_flock_id uuid,
  p_start_week int,
  p_end_week int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_farm_id uuid;
  v_start_date date;
  v_week_len int;
  v_week int;
  v_created int := 0;
  v_week_start date;
  v_week_end date;
BEGIN
  SELECT f.farm_id INTO v_farm_id
  FROM flocks f
  WHERE f.id = p_flock_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Flock not found';
  END IF;

  IF NOT is_farm_owner_or_manager(v_farm_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT fc.start_date, fc.week_length_days
    INTO v_start_date, v_week_len
  FROM flock_cycles fc
  WHERE fc.flock_id = p_flock_id;

  IF v_start_date IS NULL THEN
    RAISE EXCEPTION 'Cycle not set for this flock. Set cycle start date first.';
  END IF;

  IF v_week_len IS NULL OR v_week_len < 1 THEN
    v_week_len := 7;
  END IF;

  FOR v_week IN p_start_week..p_end_week LOOP
    v_week_start := (v_start_date + ((v_week - 1) * v_week_len));
    v_week_end := (v_week_start + (v_week_len - 1));

    INSERT INTO flock_forecast_weeks(
      farm_id, flock_id, week_number, week_start_date, week_end_date, created_by
    )
    VALUES (
      v_farm_id, p_flock_id, v_week, v_week_start, v_week_end, auth.uid()
    )
    ON CONFLICT (flock_id, week_number) DO NOTHING;

    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

-- B) get_flock_forecast_rollup
-- Returns weekly totals with category breakdown for a specific flock
CREATE OR REPLACE FUNCTION get_flock_forecast_rollup(
  p_flock_id uuid,
  p_start_week int,
  p_end_week int
)
RETURNS TABLE (
  flock_id uuid,
  week_number int,
  week_start_date date,
  week_end_date date,
  total_cost numeric,
  feed_cost numeric,
  vaccines_cost numeric,
  medication_cost numeric,
  labor_cost numeric,
  utilities_cost numeric,
  transport_cost numeric,
  misc_cost numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH weeks AS (
    SELECT w.*
    FROM flock_forecast_weeks w
    JOIN flocks f ON f.id = w.flock_id
    WHERE w.flock_id = p_flock_id
      AND w.week_number BETWEEN p_start_week AND p_end_week
      AND is_farm_member(w.farm_id)
  ),
  sums AS (
    SELECT
      w.flock_id,
      w.week_number,
      w.week_start_date,
      w.week_end_date,
      COALESCE(SUM(i.total_cost), 0) AS total_cost,
      COALESCE(SUM(CASE WHEN i.category='feed' THEN i.total_cost END), 0) AS feed_cost,
      COALESCE(SUM(CASE WHEN i.category='vaccines' THEN i.total_cost END), 0) AS vaccines_cost,
      COALESCE(SUM(CASE WHEN i.category='medication' THEN i.total_cost END), 0) AS medication_cost,
      COALESCE(SUM(CASE WHEN i.category='labor' THEN i.total_cost END), 0) AS labor_cost,
      COALESCE(SUM(CASE WHEN i.category='utilities' THEN i.total_cost END), 0) AS utilities_cost,
      COALESCE(SUM(CASE WHEN i.category='transport' THEN i.total_cost END), 0) AS transport_cost,
      COALESCE(SUM(CASE WHEN i.category='misc' THEN i.total_cost END), 0) AS misc_cost
    FROM weeks w
    LEFT JOIN flock_forecast_items i ON i.forecast_week_id = w.id
    GROUP BY w.flock_id, w.week_number, w.week_start_date, w.week_end_date
  )
  SELECT * FROM sums
  ORDER BY week_number;
$$;

-- C) get_farm_forecast_rollup
-- Returns totals by flock for entire farm
CREATE OR REPLACE FUNCTION get_farm_forecast_rollup(
  p_farm_id uuid,
  p_start_week int,
  p_end_week int
)
RETURNS TABLE (
  farm_id uuid,
  flock_id uuid,
  flock_name text,
  purpose text,
  total_cost numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    f.farm_id,
    f.id AS flock_id,
    f.name AS flock_name,
    f.purpose::text AS purpose,
    COALESCE(SUM(i.total_cost), 0) AS total_cost
  FROM flocks f
  LEFT JOIN flock_forecast_weeks w
    ON w.flock_id = f.id
   AND w.week_number BETWEEN p_start_week AND p_end_week
  LEFT JOIN flock_forecast_items i
    ON i.forecast_week_id = w.id
  WHERE f.farm_id = p_farm_id
    AND is_farm_member(p_farm_id)
    AND COALESCE(f.archived_at, NULL) IS NULL
  GROUP BY f.farm_id, f.id, f.name, f.purpose
  ORDER BY f.name;
$$;
