-- =============================================================================
-- CHECK YOUR FARM AND FLOCKS (run in Supabase SQL Editor)
-- Replace YOUR_EMAIL with your actual email, e.g. 'greatadigwe90@gmail.com'
-- =============================================================================

-- 1) Your profile and user id
SELECT id AS your_user_id, full_name, email
FROM profiles
WHERE email = 'greatadigwe90@gmail.com';

-- 2) Farms you own (and flock count per farm)
SELECT
  f.id AS farm_id,
  f.name AS farm_name,
  f.owner_id,
  f.created_at,
  (SELECT COUNT(*) FROM flocks WHERE farm_id = f.id) AS total_flocks,
  (SELECT COUNT(*) FROM flocks WHERE farm_id = f.id AND status = 'active') AS active_flocks
FROM farms f
WHERE f.owner_id = (SELECT id FROM profiles WHERE email = 'greatadigwe90@gmail.com' LIMIT 1);

-- 3) All flocks for your farms (any status)
SELECT id, farm_id, name, type, status, current_count, arrival_date, created_at
FROM flocks
WHERE farm_id IN (
  SELECT id FROM farms
  WHERE owner_id = (SELECT id FROM profiles WHERE email = 'greatadigwe90@gmail.com' LIMIT 1)
)
ORDER BY farm_id, created_at DESC;
