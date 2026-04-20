/*
  # Deduplicate farms: one farm per owner

  Removes duplicate farm rows so each owner_id has at most one farm.
  Keeps the farm that has flocks (if any); if none have flocks, keeps the
  earliest created. This cleans up the super admin "Farms Management" view
  where the same farm (e.g. "Tchouatcha Fomen Diral 's Farm") was showing
  many times because the same user had multiple farm rows.

  Run after 20260226100004_clean_slate_remove_other_accounts if you already
  ran that; or run this alone to only deduplicate (no member removal).
*/

DELETE FROM farms
WHERE id NOT IN (
  SELECT DISTINCT ON (owner_id) f.id
  FROM farms f
  LEFT JOIN (
    SELECT farm_id, COUNT(*) AS flock_count
    FROM flocks
    GROUP BY farm_id
  ) fl ON fl.farm_id = f.id
  ORDER BY
    f.owner_id,
    COALESCE(fl.flock_count, 0) DESC,  -- keep the farm that has flocks
    f.created_at ASC,
    f.id ASC
);
