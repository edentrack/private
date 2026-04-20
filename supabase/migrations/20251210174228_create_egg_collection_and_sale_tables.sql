/*
  # Create Egg Collection and Sale Tables

  1. New Tables
    - `egg_collections`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `date` (date)
      - `trays_collected` (numeric)
      - `eggs_broken` (numeric, default 0)
      - `notes` (text, nullable)
      - `photo_url` (text, nullable)
      - `created_at` (timestamptz)

    - `egg_sales`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `date` (date)
      - `trays_sold` (numeric)
      - `unit_price` (numeric)
      - `buyer_name` (text, nullable)
      - `transport_cost` (numeric, default 0)
      - `notes` (text, nullable)
      - `photo_url` (text, nullable)
      - `revenue_id` (uuid, references revenues, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated users to manage their farm's data
    - Prevent cross-farm data access
*/

CREATE TABLE IF NOT EXISTS egg_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  farm_id uuid REFERENCES farms NOT NULL,
  flock_id uuid REFERENCES flocks NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  trays_collected numeric NOT NULL CHECK (trays_collected >= 0),
  eggs_broken numeric DEFAULT 0 CHECK (eggs_broken >= 0),
  notes text,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS egg_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  farm_id uuid REFERENCES farms NOT NULL,
  flock_id uuid REFERENCES flocks NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  trays_sold numeric NOT NULL CHECK (trays_sold >= 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  buyer_name text,
  transport_cost numeric DEFAULT 0 CHECK (transport_cost >= 0),
  notes text,
  photo_url text,
  revenue_id uuid REFERENCES revenues,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE egg_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE egg_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own farm egg collections"
  ON egg_collections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_collections.farm_id
    )
  );

CREATE POLICY "Users can insert own farm egg collections"
  ON egg_collections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_collections.farm_id
    )
  );

CREATE POLICY "Users can update own farm egg collections"
  ON egg_collections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_collections.farm_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_collections.farm_id
    )
  );

CREATE POLICY "Users can delete own farm egg collections"
  ON egg_collections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_collections.farm_id
    )
  );

CREATE POLICY "Users can view own farm egg sales"
  ON egg_sales FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_sales.farm_id
    )
  );

CREATE POLICY "Users can insert own farm egg sales"
  ON egg_sales FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_sales.farm_id
    )
  );

CREATE POLICY "Users can update own farm egg sales"
  ON egg_sales FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_sales.farm_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_sales.farm_id
    )
  );

CREATE POLICY "Users can delete own farm egg sales"
  ON egg_sales FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = egg_sales.farm_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_egg_collections_farm_flock ON egg_collections(farm_id, flock_id);
CREATE INDEX IF NOT EXISTS idx_egg_collections_date ON egg_collections(date);
CREATE INDEX IF NOT EXISTS idx_egg_sales_farm_flock ON egg_sales(farm_id, flock_id);
CREATE INDEX IF NOT EXISTS idx_egg_sales_date ON egg_sales(date);
