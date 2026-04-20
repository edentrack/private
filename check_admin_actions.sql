-- Check if admin_actions table exists and has data
SELECT 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_actions'
  ) THEN 'Table exists' ELSE 'Table does NOT exist' END as table_status,
  (SELECT COUNT(*) FROM admin_actions) as row_count;
