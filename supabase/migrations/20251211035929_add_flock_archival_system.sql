/*
  # Add Flock Archival System

  1. Changes to flocks table
    - Add `status` enum field (active, sold, deceased, archived)
    - Add `archived_at` timestamp
    - Add `archived_reason` text field
    - Add `sale_price` numeric field
    - Add `sale_buyer` text field
    - Add `final_bird_count` integer
    - Add `archived_by` uuid (references profiles)

  2. New Tables
    - `flock_archive_log` - Detailed archive history
      - `id` (uuid, primary key)
      - `flock_id` (uuid, references flocks)
      - `farm_id` (uuid, references farms)
      - `action` (sold, deceased, archived)
      - `bird_count` integer
      - `sale_price` numeric (optional)
      - `buyer_info` text (optional)
      - `notes` text
      - `archived_by` uuid (references profiles)
      - `archived_at` timestamptz
      - `metadata` jsonb (for extensibility)

  3. Security
    - Enable RLS on new table
    - Add policies for farm members to view archive logs
    - Add policies for managers/owners to archive flocks
*/

-- Add status enum type
DO $$ BEGIN
  CREATE TYPE flock_status AS ENUM ('active', 'sold', 'deceased', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add archival fields to flocks table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'status'
  ) THEN
    ALTER TABLE flocks ADD COLUMN status flock_status DEFAULT 'active' NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE flocks ADD COLUMN archived_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'archived_reason'
  ) THEN
    ALTER TABLE flocks ADD COLUMN archived_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'sale_price'
  ) THEN
    ALTER TABLE flocks ADD COLUMN sale_price numeric(12,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'sale_buyer'
  ) THEN
    ALTER TABLE flocks ADD COLUMN sale_buyer text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'final_bird_count'
  ) THEN
    ALTER TABLE flocks ADD COLUMN final_bird_count integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE flocks ADD COLUMN archived_by uuid REFERENCES profiles(id);
  END IF;
END $$;

-- Create flock archive log table
CREATE TABLE IF NOT EXISTS flock_archive_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE NOT NULL,
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  action text NOT NULL CHECK (action IN ('sold', 'deceased', 'archived')),
  bird_count integer NOT NULL,
  sale_price numeric(12,2),
  buyer_info text,
  notes text,
  archived_by uuid REFERENCES profiles(id),
  archived_at timestamptz DEFAULT now() NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE flock_archive_log ENABLE ROW LEVEL SECURITY;

-- Policies for flock_archive_log
CREATE POLICY "Farm members can view archive logs"
  ON flock_archive_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = flock_archive_log.farm_id
    )
  );

CREATE POLICY "Farm managers can create archive logs"
  ON flock_archive_log FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = flock_archive_log.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_flock_archive_log_flock_id ON flock_archive_log(flock_id);
CREATE INDEX IF NOT EXISTS idx_flock_archive_log_farm_id ON flock_archive_log(farm_id);
CREATE INDEX IF NOT EXISTS idx_flocks_status ON flocks(status);
