/*
  # Create Daily Inventory Usage Tracking System

  1. New Tables
    - `inventory_usage`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `item_type` (text, 'feed' or 'other')
      - `feed_type_id` (uuid, nullable, references feed_types)
      - `other_item_id` (uuid, nullable, references other_inventory_items)
      - `quantity_used` (numeric, amount used)
      - `usage_date` (date, when it was used)
      - `recorded_by` (uuid, references profiles)
      - `notes` (text, optional notes)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `inventory_usage` table
    - Add policies for authenticated users to record and view usage in their farm

  3. Indexes
    - Index on farm_id for fast filtering
    - Index on usage_date for date-based queries
    - Index on both feed_type_id and other_item_id for joins
*/

CREATE TABLE IF NOT EXISTS inventory_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  item_type text NOT NULL CHECK (item_type IN ('feed', 'other')),
  feed_type_id uuid REFERENCES feed_types(id) ON DELETE CASCADE,
  other_item_id uuid REFERENCES other_inventory_items(id) ON DELETE CASCADE,
  quantity_used numeric(10,2) NOT NULL CHECK (quantity_used > 0),
  usage_date date DEFAULT CURRENT_DATE NOT NULL,
  recorded_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inventory_usage_farm ON inventory_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_date ON inventory_usage(usage_date);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_feed ON inventory_usage(feed_type_id);
CREATE INDEX IF NOT EXISTS idx_inventory_usage_other ON inventory_usage(other_item_id);

ALTER TABLE inventory_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view usage in their farm"
  ON inventory_usage
  FOR SELECT
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can record usage in their farm"
  ON inventory_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can update usage in their farm"
  ON inventory_usage
  FOR UPDATE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Users can delete usage in their farm"
  ON inventory_usage
  FOR DELETE
  TO authenticated
  USING (
    farm_id IN (
      SELECT farm_id FROM farm_members 
      WHERE user_id = auth.uid() AND is_active = true
    )
  );