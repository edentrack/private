/*
  # Fix Task Templates Schema

  1. Changes
    - Add is_enabled column (code expects this, table has is_active)
    - Add other missing columns that code expects

  Note: Table has is_active, code queries for is_enabled
*/

-- Add is_enabled if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN is_enabled boolean DEFAULT true;
    UPDATE task_templates SET is_enabled = is_active WHERE is_active IS NOT NULL;
  END IF;
END $$;

-- Add other missing columns that the code expects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'task_type'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN task_type text DEFAULT 'data';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'requires_input'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN requires_input boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'input_fields'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN input_fields jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'updates_inventory'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN updates_inventory boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_type'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_type text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_item_id'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_item_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_effect'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_effect text DEFAULT 'none';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'inventory_unit'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN inventory_unit text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN display_order integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'icon'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN icon text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'frequency_mode'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN frequency_mode text DEFAULT 'once_per_day';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'scheduled_times'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN scheduled_times text[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'is_time_bound'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN is_time_bound boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'window_before_minutes'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN window_before_minutes integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'window_after_minutes'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN window_after_minutes integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'allowed_roles_to_complete'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN allowed_roles_to_complete text[] DEFAULT ARRAY['owner', 'manager', 'worker'];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;