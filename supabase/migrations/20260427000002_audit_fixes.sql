-- ============================================================
-- AUDIT FIXES — 2026-04-27
-- Bug 1: sync farms.plan when profiles.subscription_tier changes
-- Bug 5: backfill cycle_start_date from arrival_date
-- ============================================================

-- ── BUG 1: Sync farms.plan from profiles.subscription_tier ──

CREATE OR REPLACE FUNCTION sync_farm_plan_from_profile()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync paid tiers — free users' farms keep whatever plan they have
  IF NEW.subscription_tier IN ('pro', 'enterprise', 'industry') THEN
    UPDATE farms
    SET plan = (
      CASE NEW.subscription_tier
        WHEN 'pro'      THEN 'pro'
        ELSE                 'enterprise'
      END
    )::farm_plan
    WHERE id IN (
      SELECT farm_id FROM farm_members
      WHERE user_id = NEW.id AND role = 'owner' AND is_active = true
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_subscription_tier_change ON profiles;
CREATE TRIGGER on_subscription_tier_change
  AFTER UPDATE OF subscription_tier ON profiles
  FOR EACH ROW
  WHEN (OLD.subscription_tier IS DISTINCT FROM NEW.subscription_tier)
  EXECUTE FUNCTION sync_farm_plan_from_profile();

-- One-time backfill for existing paid users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT fm.farm_id, p.subscription_tier
    FROM profiles p
    JOIN farm_members fm ON fm.user_id = p.id AND fm.role = 'owner' AND fm.is_active = true
    WHERE p.subscription_tier IN ('pro', 'enterprise', 'industry')
  LOOP
    BEGIN
      UPDATE farms SET plan = (
        CASE r.subscription_tier
          WHEN 'pro' THEN 'pro'
          ELSE 'enterprise'
        END
      )::farm_plan
      WHERE id = r.farm_id;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- skip if farm_plan enum differs in this environment
    END;
  END LOOP;
END;
$$;


-- ── BUG 5: Backfill cycle_start_date from arrival_date ──

ALTER TABLE flocks ADD COLUMN IF NOT EXISTS cycle_start_date DATE;

UPDATE flocks
SET cycle_start_date = arrival_date
WHERE cycle_start_date IS NULL AND arrival_date IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_cycle_start_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cycle_start_date IS NULL AND NEW.arrival_date IS NOT NULL THEN
    NEW.cycle_start_date := NEW.arrival_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_cycle_start_date ON flocks;
CREATE TRIGGER set_cycle_start_date
  BEFORE INSERT OR UPDATE ON flocks
  FOR EACH ROW
  EXECUTE FUNCTION sync_cycle_start_date();
