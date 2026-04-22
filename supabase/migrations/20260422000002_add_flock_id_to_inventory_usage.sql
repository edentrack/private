-- Add flock_id to inventory_usage so feed consumption can be tracked per flock
-- This enables accurate FCR calculations without bird-count approximation

ALTER TABLE public.inventory_usage
  ADD COLUMN IF NOT EXISTS flock_id uuid REFERENCES public.flocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_usage_flock_id
  ON public.inventory_usage (flock_id)
  WHERE flock_id IS NOT NULL;
