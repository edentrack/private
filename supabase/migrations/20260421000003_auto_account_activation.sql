-- Auto-activate accounts when email is verified
-- Removes manual approval; users verify email → account goes active immediately

-- 1. Change default to 'pending' (was already 'active' in some versions)
ALTER TABLE profiles ALTER COLUMN account_status SET DEFAULT 'pending';

-- 2. Add CHECK constraint (idempotent: drop first if exists)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('pending', 'active', 'suspended', 'rejected'));

-- 3. Trigger function: auto-activate profile when auth.users.email_confirmed_at is set
CREATE OR REPLACE FUNCTION handle_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when email_confirmed_at transitions from NULL → a value
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles
    SET account_status = 'active'
    WHERE id = NEW.id
      AND account_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
CREATE TRIGGER on_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_email_confirmed();

-- 5. Backfill: activate existing profiles where email is already confirmed
UPDATE public.profiles p
SET account_status = 'active'
FROM auth.users u
WHERE p.id = u.id
  AND u.email_confirmed_at IS NOT NULL
  AND p.account_status = 'pending';
