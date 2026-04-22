/*
  # Create Feed Givings Tracking System
  
  This tracks when feed is given to buckets (not daily usage),
  allowing automatic calculation of daily usage based on time between feedings
  and prediction of when feed will run out.

  1. New Table
    - `feed_givings`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `feed_type_id` (uuid, references feed_types)
      - `quantity_given` (numeric, amount given to buckets)
      - `given_at` (timestamp, when feed was given)
      - `recorded_by` (uuid, references profiles)
      - `notes` (text, optional)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `feed_givings` table
    - Add policies for authenticated users

  3. Indexes
    - Index on farm_id and feed_type_id for fast filtering
    - Index on given_at for date-based queries
*/

CREATE TABLE IF NOT EXISTS feed_givings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  feed_type_id uuid REFERENCES feed_types(id) ON DELETE CASCADE NOT NULL,
  quantity_given numeric(10,2) NOT NULL CHECK (quantity_given > 0),
  given_at timestamptz DEFAULT now() NOT NULL,
  recorded_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feed_givings_farm ON feed_givings(farm_id);
CREATE INDEX IF NOT EXISTS idx_feed_givings_feed_type ON feed_givings(feed_type_id);
CREATE INDEX IF NOT EXISTS idx_feed_givings_given_at ON feed_givings(given_at);

ALTER TABLE feed_givings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feed givings in their farm"
  ON feed_givings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can insert feed givings in their farm"
  ON feed_givings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can update feed givings in their farm"
  ON feed_givings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can delete feed givings in their farm"
  ON feed_givings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = feed_givings.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );
