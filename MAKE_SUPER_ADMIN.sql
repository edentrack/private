-- Make yourself super admin
-- Replace 'your-email@example.com' with your actual email

UPDATE profiles
SET 
  is_super_admin = true,
  account_status = 'active'
WHERE email = 'your-email@example.com';

-- Verify it worked
SELECT 
  id,
  email,
  full_name,
  is_super_admin,
  account_status
FROM profiles
WHERE email = 'your-email@example.com';












