-- Rabbit module: breeding_events, litters, rabbits (registry), rabbit_harvest_records
--
-- All four tables follow the same pattern as aquaculture tables:
--   - farm_id FK → farms for multi-tenant RLS
--   - created_at timestamptz DEFAULT now()
--   - RLS: SELECT/INSERT/UPDATE/DELETE where farm_id = auth.uid() context via farms

-- ─── breeding_events ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS breeding_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id        uuid REFERENCES flocks(id) ON DELETE SET NULL,
  doe_tag         text NOT NULL,
  buck_tag        text NOT NULL,
  mating_date     date NOT NULL,
  expected_kindling_date date,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE breeding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage breeding_events"
  ON breeding_events FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  );

-- ─── litters ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS litters (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id               uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  breeding_event_id     uuid REFERENCES breeding_events(id) ON DELETE SET NULL,
  doe_tag               text NOT NULL,
  kindling_date         date NOT NULL,
  kits_born_alive       int NOT NULL DEFAULT 0,
  kits_born_dead        int NOT NULL DEFAULT 0,
  kits_weaned           int,
  weaning_date          date,
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE litters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage litters"
  ON litters FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  );

-- ─── rabbits (individual breeder registry) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rabbits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id     uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id    uuid REFERENCES flocks(id) ON DELETE SET NULL,
  tag         text NOT NULL,
  sex         text NOT NULL CHECK (sex IN ('doe', 'buck')),
  breed       text,
  birth_date  date,
  sire_tag    text,
  dam_tag     text,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'culled', 'sold', 'dead')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, tag)
);

ALTER TABLE rabbits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage rabbits"
  ON rabbits FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  );

-- ─── rabbit_harvest_records ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rabbit_harvest_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id           uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id          uuid REFERENCES flocks(id) ON DELETE SET NULL,
  harvested_at      date NOT NULL,
  count             int NOT NULL DEFAULT 1,
  total_live_weight_kg    numeric(8,2),
  total_carcass_weight_kg numeric(8,2),
  -- dressing_pct is computed from the two weights; stored for reporting
  dressing_pct      numeric(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN total_live_weight_kg > 0 AND total_carcass_weight_kg IS NOT NULL
      THEN ROUND((total_carcass_weight_kg / total_live_weight_kg) * 100, 2)
      ELSE NULL
    END
  ) STORED,
  price_per_kg      numeric(12,2),
  total_amount      numeric(14,2),
  buyer_name        text,
  payment_status    text NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rabbit_harvest_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage rabbit_harvest_records"
  ON rabbit_harvest_records FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members WHERE user_id = auth.uid()
    )
  );
