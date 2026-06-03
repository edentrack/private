/*
  "Other Sales" — May 2026.

  Background: farmers earn revenue from things beyond just
  bird/egg/rabbit/fish sales. User feedback: "I want an option to sell
  other stuff like litter [manure/bedding]." Common examples we hear:

    - Manure / rabbit litter (fertilizer revenue)
    - Used bedding / pen waste
    - Hay / fodder
    - Breeding stock (live breeders, separate from grow-out sales)
    - Equipment resale
    - Services (rooster lending, AI service, etc.)
    - Anything else

  Design: a generic `other_sales` table keyed by farm + category. Each
  row is a single sale event with a free-form item description and an
  amount. Mirrors the rabbit_sales/bird_sales shape so the existing
  revenue-rollup pattern stays consistent — we add a trigger that
  feeds the central `revenues` table the same way bird_sale and the
  new rabbit_sale trigger do.

  Categories (kept short, room to grow):
    manure | bedding | hay_fodder | breeder | equipment | service | other

  Item description is free-form text so a farmer can be specific
  ("Used wood shavings from rabbit barn", "Spent broiler hen breeder").
  Category drives the icon and any future analytics groupings.
*/

CREATE TABLE IF NOT EXISTS public.other_sales (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  flock_id        uuid REFERENCES public.flocks(id) ON DELETE SET NULL,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sold_at         date NOT NULL DEFAULT CURRENT_DATE,
  category        text NOT NULL CHECK (category IN (
                    'manure',     -- composted droppings, fertilizer
                    'bedding',    -- used wood shavings, straw, pen waste
                    'hay_fodder', -- excess feed, hay sold to other farmers
                    'breeder',    -- live breeding stock sold individually
                    'equipment',  -- second-hand cages, drinkers, etc.
                    'service',    -- AI / rooster service / consulting
                    'other'       -- catch-all
                  )),
  item_name       text NOT NULL,        -- free-form description ("Rabbit manure, 50 kg bag")
  quantity        numeric,              -- optional ("50" for the bag)
  unit            text,                 -- optional ("kg", "bags", "service")
  unit_price      numeric,              -- optional
  total_amount    numeric NOT NULL DEFAULT 0,
  currency        text,                 -- falls back to farm.currency_code
  buyer_name      text,
  payment_status  text NOT NULL DEFAULT 'paid'
                  CHECK (payment_status IN ('paid', 'pending', 'partial')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);

CREATE INDEX IF NOT EXISTS other_sales_farm_date_idx
  ON public.other_sales (farm_id, sold_at DESC);

CREATE INDEX IF NOT EXISTS other_sales_category_idx
  ON public.other_sales (farm_id, category, sold_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────
ALTER TABLE public.other_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm members can manage other_sales"
  ON public.other_sales FOR ALL
  USING (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
    )
  );

-- ── Revenue rollup trigger ─────────────────────────────────────────────
--
-- Feeds the central `revenues` table the same way bird_sale and
-- rabbit_sale do, so the Expenses page's "Revenue Generated" panel
-- and any per-flock P&L view see "other" income too. source_type
-- is 'other_sale' so consumers can filter or aggregate by category.

CREATE OR REPLACE FUNCTION public.create_revenue_from_other_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.revenues (
      farm_id, flock_id, amount, currency, source_type, source_id, revenue_date, description
    ) VALUES (
      NEW.farm_id, NEW.flock_id, COALESCE(NEW.total_amount, 0), NEW.currency,
      'other_sale', NEW.id, NEW.sold_at,
      NEW.category || ': ' || COALESCE(NEW.item_name, 'other sale')
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.revenues
       SET amount       = COALESCE(NEW.total_amount, 0),
           revenue_date = NEW.sold_at,
           description  = NEW.category || ': ' || COALESCE(NEW.item_name, 'other sale'),
           updated_at   = now()
     WHERE source_id = NEW.id AND source_type = 'other_sale';
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.revenues
     WHERE source_id = OLD.id AND source_type = 'other_sale';
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_revenue_from_other_sale ON public.other_sales;
CREATE TRIGGER trg_create_revenue_from_other_sale
  AFTER INSERT OR UPDATE OR DELETE ON public.other_sales
  FOR EACH ROW EXECUTE FUNCTION public.create_revenue_from_other_sale();

COMMENT ON TABLE public.other_sales IS
  'Generic non-livestock revenue (manure, bedding, hay, breeder stock, equipment, services). Feeds central revenues table via trigger.';
