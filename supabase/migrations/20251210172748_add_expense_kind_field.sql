/*
  # Add kind field to expenses table

  1. Changes
    - Add `kind` column to expenses table (text, nullable)
    - This field allows stable identification of system-generated expenses
    - Examples: "chicks_purchase", "chicks_transport", "manual"
    - Existing expenses will have NULL kind (treated as manual)

  2. Notes
    - kind is nullable to support existing manual expenses
    - Used for upsert logic to prevent duplicate expense creation
    - Indexed for efficient queries
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'kind'
  ) THEN
    ALTER TABLE expenses ADD COLUMN kind text;
    CREATE INDEX IF NOT EXISTS idx_expenses_kind_flock ON expenses(kind, flock_id) WHERE kind IS NOT NULL;
  END IF;
END $$;
