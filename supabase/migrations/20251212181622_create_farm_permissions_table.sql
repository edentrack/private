/*
  # Create Farm Permissions System for Manager Role Controls

  ## Description
  This migration creates a system for farm owners to control what managers can access and do.
  Each farm has a set of permission toggles that determine manager capabilities.

  ## New Tables
    - `farm_permissions`
      - `farm_id` (uuid, primary key, references farms)
      - `managers_can_view_financials` (boolean, default true)
      - `managers_can_create_expenses` (boolean, default true)
      - `managers_can_create_sales` (boolean, default true)
      - `managers_can_manage_inventory` (boolean, default true)
      - `managers_can_manage_payroll` (boolean, default false)
      - `managers_can_manage_team` (boolean, default false)
      - `managers_can_edit_flock_costs` (boolean, default false)
      - `managers_can_delete_records` (boolean, default false)
      - `managers_can_edit_shift_templates` (boolean, default true)
      - `managers_can_mark_vaccinations` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  ## Security
    - Enable RLS on `farm_permissions` table
    - Owners can read and update their farm's permissions
    - Managers can read their farm's permissions (to know what they can do)
    - Workers and viewers cannot access permissions table

  ## Important Notes
    1. Default permissions are set to allow most management tasks except sensitive ones
    2. Team management and payroll are disabled by default for managers
    3. Deleting records and editing flock costs require owner approval
*/

-- Create farm_permissions table
CREATE TABLE IF NOT EXISTS farm_permissions (
  farm_id uuid PRIMARY KEY REFERENCES farms(id) ON DELETE CASCADE,
  managers_can_view_financials boolean DEFAULT true NOT NULL,
  managers_can_create_expenses boolean DEFAULT true NOT NULL,
  managers_can_create_sales boolean DEFAULT true NOT NULL,
  managers_can_manage_inventory boolean DEFAULT true NOT NULL,
  managers_can_manage_payroll boolean DEFAULT false NOT NULL,
  managers_can_manage_team boolean DEFAULT false NOT NULL,
  managers_can_edit_flock_costs boolean DEFAULT false NOT NULL,
  managers_can_delete_records boolean DEFAULT false NOT NULL,
  managers_can_edit_shift_templates boolean DEFAULT true NOT NULL,
  managers_can_mark_vaccinations boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE farm_permissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is owner of farm
CREATE OR REPLACE FUNCTION is_farm_owner(p_farm_id uuid)
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
      AND role = 'owner'
      AND is_active = true
  );
$$;

-- Helper function to check if user is owner or manager of farm
CREATE OR REPLACE FUNCTION is_farm_owner_or_manager(p_farm_id uuid)
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
      AND role IN ('owner', 'manager')
      AND is_active = true
  );
$$;

-- Owners and managers can read their farm's permissions
CREATE POLICY "Farm owners and managers can view permissions"
  ON farm_permissions
  FOR SELECT
  TO authenticated
  USING (is_farm_owner_or_manager(farm_id));

-- Only owners can update permissions
CREATE POLICY "Farm owners can update permissions"
  ON farm_permissions
  FOR UPDATE
  TO authenticated
  USING (is_farm_owner(farm_id))
  WITH CHECK (is_farm_owner(farm_id));

-- Only owners can insert permissions (when farm is created)
CREATE POLICY "Farm owners can insert permissions"
  ON farm_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_owner(farm_id));

-- Function to get farm permissions (returns null if not found, creates default if needed)
CREATE OR REPLACE FUNCTION get_farm_permissions(p_farm_id uuid)
RETURNS farm_permissions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_permissions farm_permissions;
BEGIN
  -- Try to get existing permissions
  SELECT * INTO v_permissions
  FROM farm_permissions
  WHERE farm_id = p_farm_id;
  
  -- If not found, create default permissions
  IF NOT FOUND THEN
    INSERT INTO farm_permissions (farm_id)
    VALUES (p_farm_id)
    RETURNING * INTO v_permissions;
  END IF;
  
  RETURN v_permissions;
END;
$$;

-- Trigger to automatically create default permissions when a farm is created
CREATE OR REPLACE FUNCTION create_default_farm_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO farm_permissions (farm_id)
  VALUES (NEW.id)
  ON CONFLICT (farm_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_farm_created_create_permissions
  AFTER INSERT ON farms
  FOR EACH ROW
  EXECUTE FUNCTION create_default_farm_permissions();

-- Update updated_at timestamp on permissions change
CREATE OR REPLACE FUNCTION update_farm_permissions_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_farm_permissions_updated
  BEFORE UPDATE ON farm_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_farm_permissions_timestamp();

-- Create default permissions for existing farms
INSERT INTO farm_permissions (farm_id)
SELECT id FROM farms
ON CONFLICT (farm_id) DO NOTHING;
