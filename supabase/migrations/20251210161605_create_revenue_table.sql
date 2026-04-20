/*
  # Create Revenue Table

  1. New Tables
    - `revenues`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `farm_id` (uuid, foreign key to farms)
      - `flock_id` (uuid, foreign key to flocks)
      - `amount` (numeric, total revenue amount)
      - `currency` (text, currency type)
      - `description` (text, revenue description)
      - `date` (date, revenue date)
      - `quantity` (numeric, number of items sold)
      - `unit_price` (numeric, price per unit)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `revenues` table
    - Add policies for authenticated users to manage their farm's revenue records
*/

CREATE TABLE IF NOT EXISTS revenues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  farm_id uuid REFERENCES farms NOT NULL,
  flock_id uuid REFERENCES flocks NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CFA',
  description text DEFAULT '',
  date date NOT NULL DEFAULT CURRENT_DATE,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE revenues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their farm revenues"
  ON revenues FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their farm revenues"
  ON revenues FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their farm revenues"
  ON revenues FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their farm revenues"
  ON revenues FOR DELETE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_revenues_farm_id ON revenues(farm_id);
CREATE INDEX IF NOT EXISTS idx_revenues_flock_id ON revenues(flock_id);
CREATE INDEX IF NOT EXISTS idx_revenues_date ON revenues(date);
