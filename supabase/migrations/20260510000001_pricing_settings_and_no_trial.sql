/*
  Pricing settings + remove signup trial.

  Two changes that go together:

  1. New signups land on the 'free' tier with no expiry. Previously
     handle_new_user gave everyone 14 days of 'pro' (Grower) for free.
     The user wants the Free plan to BE the trial — anyone evaluating
     EdenTrack uses Free until they're ready to upgrade with payment.
     This avoids the dark pattern of "card auto-charges after 14 days"
     and aligns with how the app's plan-gating UI already speaks.

  2. New pricing_settings + pricing_overrides tables so the super-admin
     can tune prices live without code changes.

     - pricing_settings is a SINGLETON row holding global knobs:
       a global_discount_pct that ripples to every plan/currency on
       both client (display) and server (min-amount validation).

     - pricing_overrides lets a super-admin replace any specific
       cell (tier × cycle × currency) with a custom number. Useful
       for "set Farm Boss NGN monthly to ₦25,000" without affecting
       any other cell.

     Read order at runtime: override > (baseline × (1 - discount/100)).
     If no override and no discount, FIXED_PRICES in
     src/utils/regionalPayment.ts wins.

  Existing users are untouched. Only future signups see the new
  defaults; existing 'pro' users on trial keep their trial expiry
  date, so we don't yank functionality from anyone mid-flight.
*/

-- 1. Update handle_new_user: new signups → free tier, no expiry --------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email, subscription_tier, subscription_expires_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    'free',
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);

  RETURN new;
END;
$$;

COMMENT ON COLUMN public.profiles.subscription_expires_at IS
  'When paid subscription ends. Free-tier users have NULL here. New signups land on free tier; trial is gone — Free IS the evaluation tier.';

-- 2. pricing_settings (singleton with global knobs) --------------------

CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  global_discount_pct numeric NOT NULL DEFAULT 0
    CHECK (global_discount_pct >= 0 AND global_discount_pct <= 90),
  discount_label text,           -- e.g. "Holiday 2026 promotion"
  discount_starts_at timestamptz,
  discount_ends_at timestamptz,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_settings_singleton CHECK (id = 1)
);

-- Seed the singleton row so client never has to handle "no row" case.
INSERT INTO public.pricing_settings (id, global_discount_pct)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can READ the settings — needed by client to show discounted
-- prices on the landing page before any login happens.
CREATE POLICY "Public read pricing_settings"
  ON public.pricing_settings FOR SELECT
  USING (true);

-- Only super-admins can WRITE.
CREATE POLICY "Super admin manages pricing_settings"
  ON public.pricing_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

-- 3. pricing_overrides (per-cell custom prices) ------------------------

CREATE TABLE IF NOT EXISTS public.pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL,            -- 'pro' | 'enterprise' | 'industry'
  cycle text NOT NULL,           -- 'monthly' | 'quarterly' | 'yearly'
  currency text NOT NULL,        -- 'USD' | 'XAF' | 'NGN' | ...
  amount numeric NOT NULL CHECK (amount >= 0),
  label text,                    -- "Q1 promo", "Egypt market trial"
  active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (tier, cycle, currency, active) -- only one active override per cell
);

CREATE INDEX IF NOT EXISTS idx_pricing_overrides_lookup
  ON public.pricing_overrides (tier, cycle, currency, active);

ALTER TABLE public.pricing_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read active pricing_overrides"
  ON public.pricing_overrides FOR SELECT
  USING (active = true);

CREATE POLICY "Super admin manages pricing_overrides"
  ON public.pricing_overrides FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_super_admin = true
    )
  );

COMMENT ON TABLE public.pricing_settings IS
  'Singleton: global pricing knobs (discount %). Both client and edge functions read this on every cold start.';
COMMENT ON TABLE public.pricing_overrides IS
  'Per-cell price overrides. tier × cycle × currency → custom amount. Wins over baseline + global discount.';
