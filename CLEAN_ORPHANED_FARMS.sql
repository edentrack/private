/*
  CLEAN UP ORPHANED FARMS
  =======================
  
  Deletes farms that have owner_id pointing to non-existent profiles.
  These can happen if farms weren't properly deleted when users were removed.
*/

-- Delete farms where owner_id doesn't exist in profiles
DELETE FROM farms
WHERE owner_id IS NOT NULL
AND owner_id NOT IN (SELECT id FROM profiles);

-- Also delete farms with NULL owner_id (shouldn't exist, but just in case)
DELETE FROM farms
WHERE owner_id IS NULL;

-- Verify the cleanup
SELECT COUNT(*) as total_farms_with_valid_owners
FROM farms f
WHERE EXISTS (
  SELECT 1 FROM profiles p WHERE p.id = f.owner_id
);
