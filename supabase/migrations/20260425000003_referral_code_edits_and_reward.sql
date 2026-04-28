-- Track how many times a user has customised their referral code (max 2)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code_edits int NOT NULL DEFAULT 0;

-- RPC: user customises their own referral code (max 2 times)
CREATE OR REPLACE FUNCTION update_referral_code(p_new_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edits int;
  v_clean text;
BEGIN
  v_clean := upper(regexp_replace(trim(p_new_code), '[^A-Z0-9\-]', '', 'g'));

  IF length(v_clean) < 4 OR length(v_clean) > 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code must be 4–15 characters (letters, numbers, hyphens)');
  END IF;

  SELECT referral_code_edits INTO v_edits FROM profiles WHERE id = auth.uid();

  IF v_edits >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You have used both code edits');
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_clean AND id <> auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That code is already taken — try another');
  END IF;

  UPDATE profiles
    SET referral_code = v_clean,
        referral_code_edits = v_edits + 1
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true, 'code', v_clean, 'edits_remaining', 2 - v_edits - 1);
END;
$$;

-- DB function called by the edge function after first successful payment
-- Adds 1 month to both referrer and referred user
CREATE OR REPLACE FUNCTION reward_referral(p_referred_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_id uuid;
  v_referrer_id uuid;
BEGIN
  SELECT id, referrer_id INTO v_referral_id, v_referrer_id
  FROM referrals
  WHERE referred_id = p_referred_user_id AND status = 'pending'
  LIMIT 1;

  IF v_referral_id IS NULL THEN RETURN; END IF;

  -- Add 1 month to referrer (stacks on top of existing subscription)
  UPDATE profiles
  SET subscription_expires_at = CASE
    WHEN subscription_expires_at IS NOT NULL AND subscription_expires_at > now()
      THEN subscription_expires_at + interval '1 month'
    ELSE now() + interval '1 month'
  END
  WHERE id = v_referrer_id;

  -- Add 1 month to referred user (stacks on top of what they just paid for)
  UPDATE profiles
  SET subscription_expires_at = subscription_expires_at + interval '1 month'
  WHERE id = p_referred_user_id;

  UPDATE referrals
  SET status = 'rewarded', rewarded_at = now()
  WHERE id = v_referral_id;
END;
$$;
