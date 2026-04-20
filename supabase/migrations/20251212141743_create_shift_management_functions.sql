/*
  # Create Shift Management Functions

  1. Functions
    - `assign_shift` - Assigns a new shift to a worker
    - `update_shift_status` - Updates the status of an existing shift

  2. Purpose
    - Enable owners/managers to assign shifts to workers
    - Enable tracking shift status changes
    - Validate permissions and data integrity
*/

-- Function to assign a shift to a worker
CREATE OR REPLACE FUNCTION assign_shift(
  p_farm_id uuid,
  p_worker_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shift_date date;
  v_start_time time;
  v_end_time time;
  v_user_id uuid;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  SELECT role INTO v_user_role
  FROM farm_members
  WHERE farm_id = p_farm_id
    AND user_id = v_user_id
    AND is_active = true;

  IF v_user_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions. Only owners and managers can assign shifts.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM farm_members
    WHERE farm_id = p_farm_id
      AND user_id = p_worker_id
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Worker is not a member of this farm'
    );
  END IF;

  v_shift_date := p_start_time::date;
  v_start_time := p_start_time::time;
  v_end_time := p_end_time::time;

  INSERT INTO worker_shifts (
    farm_id,
    worker_id,
    shift_date,
    start_time,
    end_time,
    status,
    created_at,
    created_by
  )
  VALUES (
    p_farm_id,
    p_worker_id,
    v_shift_date,
    v_start_time,
    v_end_time,
    'scheduled',
    now(),
    v_user_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Shift assigned successfully'
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
CREATE OR REPLACE FUNCTION update_shift_status(
  p_shift_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_farm_id uuid;
  v_user_role text;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated'
    );
  END IF;

  IF p_new_status NOT IN ('scheduled', 'in_progress', 'completed', 'missed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid status value'
    );
  END IF;

  SELECT farm_id INTO v_farm_id
  FROM worker_shifts
  WHERE id = p_shift_id;

  IF v_farm_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Shift not found'
    );
  END IF;

  SELECT role INTO v_user_role
  FROM farm_members
  WHERE farm_id = v_farm_id
    AND user_id = v_user_id
    AND is_active = true;

  IF v_user_role NOT IN ('owner', 'manager') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions. Only owners and managers can update shift status.'
    );
  END IF;

  UPDATE worker_shifts
  SET status = p_new_status
  WHERE id = p_shift_id;

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
