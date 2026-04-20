-- Add managers_can_edit_eggs to farm_permissions (owner can allow managers to edit egg collection/sale records)
ALTER TABLE public.farm_permissions
  ADD COLUMN IF NOT EXISTS managers_can_edit_eggs boolean DEFAULT false NOT NULL;

-- Backfill existing rows
UPDATE public.farm_permissions
SET managers_can_edit_eggs = false
WHERE managers_can_edit_eggs IS NULL;

COMMENT ON COLUMN public.farm_permissions.managers_can_edit_eggs IS 'When true, managers can edit egg collection and egg sale records (e.g. to correct recording errors).';
