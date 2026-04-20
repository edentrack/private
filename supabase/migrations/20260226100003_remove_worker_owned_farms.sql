/*
  # Remove farms created by workers (invite-only users)

  Deletes farms where the owner is also a worker/manager/viewer on another farm.
  Those are "extra" farms that never should have been created (invite flow or
  legacy behavior). After this, those users only have their membership under
  your farm and are routed to your farm only.

  Safe: only removes farms whose owner_id has at least one other farm_members
  row with role IN ('worker','manager','viewer'). Your main farm (you're owner
  only) is not touched.

  To preview which farms would be removed, run in SQL Editor:
    SELECT f.id, f.name, f.owner_id, p.email
    FROM farms f
    JOIN profiles p ON p.id = f.owner_id
    WHERE EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.user_id = f.owner_id
        AND fm.farm_id <> f.id
        AND fm.role IN ('worker', 'manager', 'viewer')
        AND fm.is_active = true
    );
*/

-- Delete farms whose owner is also a worker/manager/viewer on another farm.
-- farm_members has ON DELETE CASCADE to farms, so those memberships are removed automatically.
DELETE FROM farms
WHERE id IN (
  SELECT f.id
  FROM farms f
  WHERE EXISTS (
    SELECT 1 FROM farm_members fm
    WHERE fm.user_id = f.owner_id
      AND fm.farm_id <> f.id
      AND fm.role IN ('worker', 'manager', 'viewer')
      AND fm.is_active = true
  )
);
