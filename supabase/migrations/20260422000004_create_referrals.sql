-- Referral program: each user gets a unique code; referred users get 1 month credit

-- Add referral_code to profiles (generated on insert)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Backfill existing profiles with unique codes
UPDATE public.profiles
SET referral_code = upper(substring(md5(id::text), 1, 8))
WHERE referral_code IS NULL;

-- Make non-null after backfill
ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET DEFAULT upper(substring(md5(gen_random_uuid()::text), 1, 8));

-- Trigger to auto-set referral_code on new profile creation
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substring(md5(NEW.id::text || clock_timestamp()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.profiles;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_referral_code();

-- Referrals tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rewarded', 'void')),
  rewarded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can only see their own referrals
CREATE POLICY "users_see_own_referrals" ON public.referrals
  FOR SELECT USING (referrer_id = auth.uid() OR referred_id = auth.uid());

-- Service role inserts on first payment by referred user
CREATE POLICY "service_insert_referrals" ON public.referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "service_update_referrals" ON public.referrals
  FOR UPDATE USING (true);

-- RPC: apply referral code at signup
CREATE OR REPLACE FUNCTION apply_referral_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  -- Find referrer
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = upper(p_code);
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid referral code');
  END IF;
  -- Can't refer yourself
  IF v_referrer_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot use your own referral code');
  END IF;
  -- Already used a code
  IF EXISTS (SELECT 1 FROM referrals WHERE referred_id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have already used a referral code');
  END IF;
  -- Record referral (status = pending until first payment)
  INSERT INTO referrals (referrer_id, referred_id, code)
  VALUES (v_referrer_id, auth.uid(), upper(p_code))
  ON CONFLICT (referred_id) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;
