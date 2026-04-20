/*
  # Fix Forecast Flock Type Bug and Add Delete Functionality

  ## Summary
  Fixes critical bug where all flocks are shown as "broiler" in forecast system.
  The RPC was using flocks.purpose (enum, defaults to broiler) instead of flocks.type (text, actual type).

  ## Changes Made
  1. **Fix get_farm_forecast_rollup RPC**
     - Changed from using f.purpose to f.type
     - This ensures Layers show as "Layer" and Broilers show as "Broiler"

  2. **Add delete_flock_forecast_weeks RPC**
     - Allows owners/managers to delete forecast weeks
     - Cascades to delete all associated forecast items
     - Returns count of deleted weeks

  3. **Data Integrity**
     - Ensure flocks.type is NOT NULL
     - Add check constraint to only allow 'Layer' or 'Broiler'

  ## Security
  - Delete RPC checks farm ownership/manager role
  - RLS policies already in place for cascading deletes
*/

-- =============================================
-- 1) FIX FORECAST ROLLUP TO USE CORRECT TYPE
-- =============================================

DROP FUNCTION IF EXISTS get_farm_forecast_rollup(uuid, integer, integer);

CREATE OR REPLACE FUNCTION get_farm_forecast_rollup(
  p_farm_id uuid,
  p_start_week int,
  p_end_week int
)
RETURNS TABLE (
  farm_id uuid,
  flock_id uuid,
  flock_name text,
  flock_type text,
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
    f.type AS flock_type,
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
  GROUP BY f.farm_id, f.id, f.name, f.type
  ORDER BY f.name;
$$;

-- =============================================
-- 2) ADD DELETE FORECAST WEEKS RPC
-- =============================================

CREATE OR REPLACE FUNCTION delete_flock_forecast_weeks(
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
  v_deleted int;
BEGIN
  SELECT farm_id INTO v_farm_id
  FROM flocks
  WHERE id = p_flock_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Flock not found';
  END IF;

  IF NOT is_farm_owner_or_manager(v_farm_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM flock_forecast_weeks
  WHERE flock_id = p_flock_id
    AND week_number BETWEEN p_start_week AND p_end_week;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

-- =============================================
-- 3) ADD DATA INTEGRITY CONSTRAINTS
-- =============================================

-- Ensure type column is NOT NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'type'
  ) THEN
    -- Set any NULL types to the purpose value or default to 'Broiler'
    UPDATE flocks
    SET type = COALESCE(type, CASE WHEN purpose = 'layer' THEN 'Layer' ELSE 'Broiler' END)
    WHERE type IS NULL;

    -- Make column NOT NULL
    ALTER TABLE flocks ALTER COLUMN type SET NOT NULL;

    -- Add check constraint for valid values (case-sensitive)
    ALTER TABLE flocks DROP CONSTRAINT IF EXISTS flocks_type_check;
    ALTER TABLE flocks ADD CONSTRAINT flocks_type_check
      CHECK (type IN ('Layer', 'Broiler'));
  END IF;
END $$;
