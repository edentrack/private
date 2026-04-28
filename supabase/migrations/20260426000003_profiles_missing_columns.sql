-- Add columns referenced in code but missing from the profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country       text,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS farm_name     text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

-- Backfill updated_at for existing rows
UPDATE public.profiles SET updated_at = created_at WHERE updated_at IS NULL;

-- Notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
