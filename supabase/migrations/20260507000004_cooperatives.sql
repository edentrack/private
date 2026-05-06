-- Phase G — Cooperative / aggregator scaffolding.
--
-- A cooperative is a parent organisation (NGO, federation, dairy union,
-- hatchery network) that has many member farms under it. Co-op admins
-- see a rolled-up dashboard across every member farm — total animals,
-- total revenue, total mortality, biggest performers, biggest laggards.
--
-- Per the brief: 'co-ops have hundreds of farmers each. Sell to one
-- co-op, get 200 farmers.' This is the GTM motor for African markets.
--
-- Scope this round: dashboard rollup admin only. No broadcast messaging
-- or training-content distribution — those land in a follow-up.

CREATE TABLE IF NOT EXISTS public.cooperatives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,    -- url-safe, used for public co-op pages later
  country       text,
  region        text,
  description   text,
  contact_email text,
  contact_phone text,
  -- The user who created the co-op. Auto-promoted to admin via the
  -- cooperative_admins table.
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cooperatives_owner_idx ON public.cooperatives (owner_user_id);

-- Many-to-many: a cooperative has many member farms; a farm can in
-- principle belong to multiple co-ops (rare but valid — e.g. a fish farm
-- selling to both a dairy co-op-aligned aggregator and a separate
-- aquaculture network).
CREATE TABLE IF NOT EXISTS public.cooperative_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id  uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  joined_at       timestamptz,
  notes           text,
  -- Whether the co-op admin can see this farm's full data or just KPI rollups.
  -- Default: full. The farm's owner can downgrade in settings.
  data_sharing    text NOT NULL DEFAULT 'full' CHECK (data_sharing IN ('full', 'aggregate-only')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, farm_id)
);

CREATE INDEX IF NOT EXISTS coop_members_coop_idx ON public.cooperative_members (cooperative_id);
CREATE INDEX IF NOT EXISTS coop_members_farm_idx ON public.cooperative_members (farm_id);

-- Co-op admins (separate from member-farm owners). A user can be a co-op
-- admin without being a farm owner — that's the typical NGO/federation
-- staff person.
CREATE TABLE IF NOT EXISTS public.cooperative_admins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id  uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cooperative_id, user_id)
);

CREATE INDEX IF NOT EXISTS coop_admins_user_idx ON public.cooperative_admins (user_id);

-- Auto-create the owner as the first admin on every co-op insert.
CREATE OR REPLACE FUNCTION public.create_cooperative_admin_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.cooperative_admins (cooperative_id, user_id, role)
  VALUES (NEW.id, NEW.owner_user_id, 'admin')
  ON CONFLICT (cooperative_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS cooperatives_auto_admin ON public.cooperatives;
CREATE TRIGGER cooperatives_auto_admin
  AFTER INSERT ON public.cooperatives
  FOR EACH ROW EXECUTE FUNCTION public.create_cooperative_admin_on_insert();

CREATE OR REPLACE FUNCTION public.touch_cooperatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cooperatives_touch_updated_at ON public.cooperatives;
CREATE TRIGGER cooperatives_touch_updated_at
  BEFORE UPDATE ON public.cooperatives
  FOR EACH ROW EXECUTE FUNCTION public.touch_cooperatives_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.cooperatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_admins ENABLE ROW LEVEL SECURITY;

-- Cooperatives: visible to admins (any role) and to member-farm owners.
-- Update / delete is admin-only.
DROP POLICY IF EXISTS coops_select ON public.cooperatives;
CREATE POLICY coops_select ON public.cooperatives
  FOR SELECT USING (
    id IN (SELECT cooperative_id FROM public.cooperative_admins WHERE user_id = auth.uid())
    OR id IN (
      SELECT cm.cooperative_id FROM public.cooperative_members cm
      JOIN public.farm_members fm ON fm.farm_id = cm.farm_id
      WHERE fm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coops_insert ON public.cooperatives;
CREATE POLICY coops_insert ON public.cooperatives
  FOR INSERT WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS coops_update_admin ON public.cooperatives;
CREATE POLICY coops_update_admin ON public.cooperatives
  FOR UPDATE USING (
    id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  ) WITH CHECK (
    id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS coops_delete_admin ON public.cooperatives;
CREATE POLICY coops_delete_admin ON public.cooperatives
  FOR DELETE USING (
    id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Members: visible to co-op admins AND to the member farm's owner.
-- Insert: an admin enrols a farm OR a farm owner requests to join.
-- Update/delete: admin only (approve, suspend, remove).
DROP POLICY IF EXISTS coop_members_select ON public.cooperative_members;
CREATE POLICY coop_members_select ON public.cooperative_members
  FOR SELECT USING (
    cooperative_id IN (SELECT cooperative_id FROM public.cooperative_admins WHERE user_id = auth.uid())
    OR farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS coop_members_insert ON public.cooperative_members;
CREATE POLICY coop_members_insert ON public.cooperative_members
  FOR INSERT WITH CHECK (
    -- Admin can enrol any farm
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR
    -- Farm owner can request to join (status auto stays 'pending')
    farm_id IN (
      SELECT id FROM public.farms WHERE owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coop_members_update_admin ON public.cooperative_members;
CREATE POLICY coop_members_update_admin ON public.cooperative_members
  FOR UPDATE USING (
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR farm_id IN (SELECT id FROM public.farms WHERE owner_id = auth.uid())
  ) WITH CHECK (
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR farm_id IN (SELECT id FROM public.farms WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS coop_members_delete_admin ON public.cooperative_members;
CREATE POLICY coop_members_delete_admin ON public.cooperative_members
  FOR DELETE USING (
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR farm_id IN (SELECT id FROM public.farms WHERE owner_id = auth.uid())
  );

-- Admins: visible to fellow admins of the same co-op.
DROP POLICY IF EXISTS coop_admins_select ON public.cooperative_admins;
CREATE POLICY coop_admins_select ON public.cooperative_admins
  FOR SELECT USING (
    cooperative_id IN (SELECT cooperative_id FROM public.cooperative_admins WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS coop_admins_insert ON public.cooperative_admins;
CREATE POLICY coop_admins_insert ON public.cooperative_admins
  FOR INSERT WITH CHECK (
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS coop_admins_delete ON public.cooperative_admins;
CREATE POLICY coop_admins_delete ON public.cooperative_admins
  FOR DELETE USING (
    cooperative_id IN (
      SELECT cooperative_id FROM public.cooperative_admins
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    OR user_id = auth.uid()  -- a user can remove themselves
  );
