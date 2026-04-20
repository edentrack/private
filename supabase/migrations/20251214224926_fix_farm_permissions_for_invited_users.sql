/*
  # Fix Farm Permissions for Invited Users

  1. Changes
    - Create farm_permissions automatically when a farm is created
    - Allow managers to view farm_permissions even if they don't exist
    - Add trigger to auto-create farm_permissions for existing farms

  2. Security
    - Managers can read farm_permissions (already in place)
    - Only owners can create/update farm_permissions
*/

-- Create a trigger function to auto-create farm permissions
CREATE OR REPLACE FUNCTION create_farm_permissions_for_new_farm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create default farm permissions for the new farm
  INSERT INTO farm_permissions (farm_id)
  VALUES (NEW.id)
  ON CONFLICT (farm_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create permissions when farm is created
DROP TRIGGER IF EXISTS trigger_create_farm_permissions ON farms;
CREATE TRIGGER trigger_create_farm_permissions
  AFTER INSERT ON farms
  FOR EACH ROW
  EXECUTE FUNCTION create_farm_permissions_for_new_farm();

-- Create farm_permissions for any existing farms that don't have them
INSERT INTO farm_permissions (farm_id)
SELECT id FROM farms
WHERE id NOT IN (SELECT farm_id FROM farm_permissions)
ON CONFLICT (farm_id) DO NOTHING;
