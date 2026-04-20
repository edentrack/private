/*
  # Create Missing Database Functions

  1. Functions
    - accept_pending_invitations: Accept pending team invitations for the current user
    - get_farm_members_with_emails: Get all farm members with their email addresses
    - get_farm_shifts: Get farm shifts with filters
    - calculate_payroll: Calculate payroll for a given period

  Note: These functions are called by the frontend but don't exist in the database
*/

-- Create accept_pending_invitations function (stub for now)
CREATE OR REPLACE FUNCTION accept_pending_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Placeholder function - invitations feature not fully implemented yet
  -- This prevents errors when the function is called
  RETURN;
END;
$$;

-- Create get_farm_members_with_emails function
CREATE OR REPLACE FUNCTION get_farm_members_with_emails(p_farm_id uuid)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  user_id uuid,
  role text,
  is_active boolean,
  invited_by uuid,
  invited_at timestamptz,
  joined_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text,
  full_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fm.id,
    fm.farm_id,
    fm.user_id,
    fm.role,
    fm.is_active,
    fm.invited_by,
    fm.invited_at,
    fm.joined_at,
    fm.created_at,
    fm.updated_at,
    p.email,
    p.full_name
  FROM farm_members fm
  LEFT JOIN profiles p ON p.id = fm.user_id
  WHERE fm.farm_id = p_farm_id;
END;
$$;

-- Create get_farm_shifts function (stub for now)
CREATE OR REPLACE FUNCTION get_farm_shifts(
  p_farm_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_status_filter text DEFAULT NULL,
  p_worker_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  farm_id uuid,
  worker_id uuid,
  worker_email text,
  worker_name text,
  shift_date date,
  start_time time,
  end_time time,
  status text,
  notes text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return empty result for now since worker_shifts table doesn't exist
  RETURN;
END;
$$;

-- Create calculate_payroll function (stub for now)
CREATE OR REPLACE FUNCTION calculate_payroll(
  p_farm_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  worker_id uuid,
  worker_name text,
  worker_email text,
  total_hours numeric,
  hourly_rate numeric,
  total_pay numeric,
  shifts_worked integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Return empty result for now since payroll system isn't fully implemented
  RETURN;
END;
$$;