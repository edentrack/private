/*
  # Create Feed Stock Table and Extend Tasks

  1. New Tables
    - `feed_stock`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `feed_type` (text)
      - `bags_in_stock` (numeric)
      - `last_updated` (timestamptz)
      - `created_at` (timestamptz)

  2. Extend Tasks Table
    - Add `due_at` (timestamptz, nullable)
    - Add `completed_at` (timestamptz, nullable)
    - Add `assigned_to` (uuid, references auth.users, nullable)
    - Add `created_by` (uuid, references auth.users)
    - Add `status` (text, check constraint for 'pending' or 'completed')
    - Add `completion_photo_url` (text, nullable)
    - Add `farm_id` (uuid, references farms)
    - Add `flock_id` (uuid, references flocks, nullable)

  3. Security
    - Enable RLS on feed_stock table
    - Add policies for authenticated users
    - Update tasks table policies if needed
*/

CREATE TABLE IF NOT EXISTS feed_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms NOT NULL,
  feed_type text NOT NULL,
  bags_in_stock numeric DEFAULT 0 CHECK (bags_in_stock >= 0),
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feed_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own farm feed stock"
  ON feed_stock FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = feed_stock.farm_id
    )
  );

CREATE POLICY "Users can insert own farm feed stock"
  ON feed_stock FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = feed_stock.farm_id
    )
  );

CREATE POLICY "Users can update own farm feed stock"
  ON feed_stock FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = feed_stock.farm_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = feed_stock.farm_id
    )
  );

CREATE POLICY "Users can delete own farm feed stock"
  ON feed_stock FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = feed_stock.farm_id
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'due_at') THEN
    ALTER TABLE tasks ADD COLUMN due_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'completed_at') THEN
    ALTER TABLE tasks ADD COLUMN completed_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'assigned_to') THEN
    ALTER TABLE tasks ADD COLUMN assigned_to uuid REFERENCES auth.users;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'created_by') THEN
    ALTER TABLE tasks ADD COLUMN created_by uuid REFERENCES auth.users;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'status') THEN
    ALTER TABLE tasks ADD COLUMN status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'completion_photo_url') THEN
    ALTER TABLE tasks ADD COLUMN completion_photo_url text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'farm_id') THEN
    ALTER TABLE tasks ADD COLUMN farm_id uuid REFERENCES farms;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'flock_id') THEN
    ALTER TABLE tasks ADD COLUMN flock_id uuid REFERENCES flocks;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_feed_stock_farm ON feed_stock(farm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_farm ON tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);
