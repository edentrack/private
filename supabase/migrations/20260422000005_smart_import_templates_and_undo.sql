-- Smart Import: vendor templates and undo support

-- Import templates: remember column mappings per vendor
CREATE TABLE IF NOT EXISTS public.import_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id      uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  vendor_name  text NOT NULL,
  use_count    integer NOT NULL DEFAULT 1,
  column_mappings jsonb NOT NULL DEFAULT '{}',
  sample_fields   text[],
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (farm_id, vendor_name)
);

CREATE INDEX IF NOT EXISTS idx_import_templates_farm ON public.import_templates (farm_id);

ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "farm_members_import_templates" ON public.import_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.farm_members WHERE farm_id = import_templates.farm_id AND user_id = auth.uid() AND is_active = true)
  );

-- Add committed_at + is_undone to imports table for undo support
ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_undone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0;

-- Index for import history queries
CREATE INDEX IF NOT EXISTS idx_imports_farm_committed
  ON public.imports (farm_id, committed_at DESC)
  WHERE committed_at IS NOT NULL AND is_undone = false;
