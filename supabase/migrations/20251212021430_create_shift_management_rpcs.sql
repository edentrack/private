/*
  # Create Shift Management RPC Functions

  1. New Functions
    - `assign_shift(farm_id, worker_id, start_time, end_time)` - Create a shift for a worker
    - `update_shift_status(shift_id, new_status)` - Update shift status
    - `get_farm_shifts(farm_id, status_filter, worker_filter, start_date, end_date)` - Get all shifts with filters

  2. Validation
    - End time must be after start time
    - Worker must belong to the same farm
    - Owners cannot assign shifts to themselves
    - Workers cannot have overlapping shifts
    - Only owners and managers can assign/update shifts

  3. Activity Logging
    - Log shift assignments
    - Log status updates

  4. Important Notes
    - All functions use security definer for proper RLS enforcement
    - Comprehensive validation prevents scheduling conflicts
    - Returns structured JSON responses with success/error information
*/

-- Function to assign a shift to a worker
CREATE OR REPLACE FUNCTION public.assign_shift(
  p_farm_id uuid,
  p_worker_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_worker_role text;
  v_shift_id uuid;
  v_worker_name text;
  v_overlapping_count int;
BEGIN
  -- Validate times
  IF p_end_time <= p_start_time THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'End time must be after start time'
    );
  END IF;

  -- Check if actor is owner or manager
  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = p_farm_id
    AND user_id = v_actor
    AND is_active = true;

  IF v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only owners and managers can assign shifts'
    );
  END IF;

  -- Owners cannot assign shifts to themselves
  IF v_actor_role = 'owner' AND p_worker_id = v_actor THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Owners cannot assign shifts to themselves'
    );
  END IF;

  -- Check if worker belongs to the farm
  SELECT role INTO v_worker_role
  FROM farm_members
  WHERE farm_id = p_farm_id
    AND user_id = p_worker_id
    AND is_active = true;

  IF v_worker_role IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Worker does not belong to this farm'
    );
  END IF;

  -- Check for overlapping shifts
  SELECT COUNT(*) INTO v_overlapping_count
  FROM worker_shifts
  WHERE worker_id = p_worker_id
    AND farm_id = p_farm_id
    AND status IN ('scheduled', 'in_progress')
    AND (
      (p_start_time >= start_time AND p_start_time < end_time)
      OR (p_end_time > start_time AND p_end_time <= end_time)
      OR (p_start_time <= start_time AND p_end_time >= end_time)
    );

  IF v_overlapping_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Worker already has a shift scheduled during this time'
    );
  END IF;

  -- Get worker name
  SELECT full_name INTO v_worker_name
  FROM profiles
  WHERE id = p_worker_id;

  -- Create the shift
  INSERT INTO worker_shifts (farm_id, worker_id, start_time, end_time, created_by, status)
  VALUES (p_farm_id, p_worker_id, p_start_time, p_end_time, v_actor, 'scheduled')
  RETURNING id INTO v_shift_id;

  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id, actor_user_id, target_user_id, event_type, details
  ) VALUES (
    p_farm_id,
    v_actor,
    p_worker_id,
    'shift_assigned',
    jsonb_build_object(
      'shift_id', v_shift_id,
      'worker_name', v_worker_name,
      'start_time', p_start_time,
      'end_time', p_end_time
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift assigned successfully',
    'shift_id', v_shift_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to update shift status
CREATE OR REPLACE FUNCTION public.update_shift_status(
  p_shift_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_farm_id uuid;
  v_worker_id uuid;
  v_worker_name text;
  v_old_status text;
BEGIN
  -- Validate status
  IF p_new_status NOT IN ('scheduled', 'in_progress', 'completed', 'missed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status. Must be: scheduled, in_progress, completed, or missed'
    );
  END IF;

  -- Get shift details
  SELECT farm_id, worker_id, status
  INTO v_farm_id, v_worker_id, v_old_status
  FROM worker_shifts
  WHERE id = p_shift_id;

  IF v_farm_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Shift not found'
    );
  END IF;

  -- Check if actor is owner or manager
  SELECT role INTO v_actor_role
  FROM farm_members
  WHERE farm_id = v_farm_id
    AND user_id = v_actor
    AND is_active = true;

  IF v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Only owners and managers can update shift status'
    );
  END IF;

  -- Get worker name
  SELECT full_name INTO v_worker_name
  FROM profiles
  WHERE id = v_worker_id;

  -- Update the shift
  UPDATE worker_shifts
  SET status = p_new_status
  WHERE id = p_shift_id;

  -- Log the activity
  INSERT INTO team_activity_log (
    farm_id, actor_user_id, target_user_id, event_type, details
  ) VALUES (
    v_farm_id,
    v_actor,
    v_worker_id,
    'shift_status_updated',
    jsonb_build_object(
      'shift_id', p_shift_id,
      'worker_name', v_worker_name,
      'old_status', v_old_status,
      'new_status', p_new_status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift status updated successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Function to get farm shifts with filters
CREATE OR REPLACE FUNCTION public.get_farm_shifts(
  p_farm_id uuid,
  p_status_filter text DEFAULT NULL,
  p_worker_filter uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  worker_id uuid,
  worker_name text,
  worker_email text,
  worker_role text,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
BEGIN
  -- Check if actor has access to this farm
  SELECT fm.role INTO v_actor_role
  FROM farm_members fm
  WHERE fm.farm_id = p_farm_id
    AND fm.user_id = v_actor
    AND fm.is_active = true;

  -- If not owner/manager, only show their own shifts
  IF v_actor_role NOT IN ('owner', 'manager') THEN
    RETURN QUERY
    SELECT
      ws.id,
      ws.farm_id,
      ws.worker_id,
      p.full_name AS worker_name,
      u.email AS worker_email,
      fm.role AS worker_role,
      ws.start_time,
      ws.end_time,
      ws.status,
      ws.created_by,
      ws.created_at
    FROM worker_shifts ws
    JOIN profiles p ON p.id = ws.worker_id
    JOIN auth.users u ON u.id = ws.worker_id
    JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
    WHERE ws.farm_id = p_farm_id
      AND ws.worker_id = v_actor
      AND (p_status_filter IS NULL OR ws.status = p_status_filter)
      AND (p_start_date IS NULL OR ws.start_time >= p_start_date)
      AND (p_end_date IS NULL OR ws.end_time <= p_end_date)
    ORDER BY ws.start_time DESC;
  ELSE
    -- Owner/manager sees all shifts with filters
    RETURN QUERY
    SELECT
      ws.id,
      ws.farm_id,
      ws.worker_id,
      p.full_name AS worker_name,
      u.email AS worker_email,
      fm.role AS worker_role,
      ws.start_time,
      ws.end_time,
      ws.status,
      ws.created_by,
      ws.created_at
    FROM worker_shifts ws
    JOIN profiles p ON p.id = ws.worker_id
    JOIN auth.users u ON u.id = ws.worker_id
    JOIN farm_members fm ON fm.user_id = ws.worker_id AND fm.farm_id = ws.farm_id
    WHERE ws.farm_id = p_farm_id
      AND (p_status_filter IS NULL OR ws.status = p_status_filter)
      AND (p_worker_filter IS NULL OR ws.worker_id = p_worker_filter)
      AND (p_start_date IS NULL OR ws.start_time >= p_start_date)
      AND (p_end_date IS NULL OR ws.end_time <= p_end_date)
    ORDER BY ws.start_time DESC;
  END IF;
END;
$$;
