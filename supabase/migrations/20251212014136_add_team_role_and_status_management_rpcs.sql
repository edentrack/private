/*
  # Add Team Role and Status Management RPCs

  1. New Functions
    - `update_farm_member_role(farm_member_id, new_role)` - Update a member's role
    - `set_farm_member_active(farm_member_id, is_active)` - Toggle member active status
    
  2. Security
    - Both functions require the caller to be an owner of the farm
    - Users cannot change their own active status
    - All changes are audited with updated_at timestamp
*/

-- Function to update farm member role
CREATE OR REPLACE FUNCTION public.update_farm_member_role(
  p_farm_member_id uuid,
  p_new_role text
) 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
BEGIN
  -- Find member's farm
  SELECT farm_id INTO v_farm_id
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Farm member not found';
  END IF;

  -- Validate role
  IF p_new_role NOT IN ('owner', 'manager', 'worker', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role. Must be owner, manager, worker, or viewer';
  END IF;

  -- Only owners of that farm can change roles
  IF NOT EXISTS (
    SELECT 1
    FROM farm_members
    WHERE farm_id = v_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only farm owners can change roles';
  END IF;

  -- Update the role
  UPDATE farm_members
  SET 
    role = p_new_role,
    updated_at = now()
  WHERE id = p_farm_member_id;
END;
$$;

-- Function to set farm member active status
CREATE OR REPLACE FUNCTION public.set_farm_member_active(
  p_farm_member_id uuid,
  p_is_active boolean
) 
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_farm_id uuid;
  v_user_id uuid;
BEGIN
  -- Find member's farm and user_id
  SELECT farm_id, user_id
  INTO v_farm_id, v_user_id
  FROM farm_members
  WHERE id = p_farm_member_id;

  IF v_farm_id IS NULL THEN
    RAISE EXCEPTION 'Farm member not found';
  END IF;

  -- Prevent user from changing their own active status
  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own active status';
  END IF;

  -- Ensure caller is an owner
  IF NOT EXISTS (
    SELECT 1
    FROM farm_members
    WHERE farm_id = v_farm_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only farm owners can change member status';
  END IF;

  -- Update the active status
  UPDATE farm_members
  SET 
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_farm_member_id;
END;
$$;
