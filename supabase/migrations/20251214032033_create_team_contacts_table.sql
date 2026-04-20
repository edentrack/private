/*
  # Create Team Contacts Table

  1. New Tables
    - `team_contacts`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, foreign key to farms)
      - `name` (text, contact name)
      - `role` (text, role/position)
      - `phone` (text, phone number with country code)
      - `email` (text, optional email)
      - `can_receive_reports` (boolean, whether they should receive reports)
      - `created_at` (timestamptz, creation timestamp)

  2. Security
    - Enable RLS on `team_contacts` table
    - Add policies for farm members to manage their farm's contacts
    - Add index for efficient farm-based queries

  3. Important Notes
    - Phone numbers should include country code (e.g., +237XXXXXXXXX)
    - Used for quick sharing of reports via WhatsApp
    - Only accessible by farm members
*/

CREATE TABLE IF NOT EXISTS team_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  role text,
  phone text NOT NULL,
  email text,
  can_receive_reports boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_contacts_farm ON team_contacts(farm_id);

ALTER TABLE team_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Farm members can view their farm's contacts"
  ON team_contacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = team_contacts.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm owners and managers can insert contacts"
  ON team_contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = team_contacts.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm owners and managers can update contacts"
  ON team_contacts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = team_contacts.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = team_contacts.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Farm owners and managers can delete contacts"
  ON team_contacts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = team_contacts.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.role IN ('owner', 'manager')
      AND farm_members.is_active = true
    )
  );
