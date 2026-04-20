/*
  # Create Environmental Monitoring and Equipment Management Systems

  1. New Tables
    - `environmental_logs`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `log_date` (timestamptz)
      - `temperature` (numeric, celsius)
      - `humidity` (numeric, percentage)
      - `ammonia_level` (numeric, ppm)
      - `ventilation_rate` (text)
      - `water_consumption` (numeric, liters)
      - `lighting_hours` (numeric)
      - `notes` (text)
      - `recorded_by` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `equipment`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `name` (text)
      - `type` (feeder, drinker, heater, ventilation, generator, incubator, other)
      - `manufacturer` (text)
      - `model` (text)
      - `serial_number` (text)
      - `purchase_date` (date)
      - `purchase_cost` (numeric)
      - `warranty_expiry` (date)
      - `status` (operational, needs_maintenance, broken, retired)
      - `location` (text)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `equipment_maintenance`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `equipment_id` (uuid, references equipment)
      - `maintenance_date` (date)
      - `maintenance_type` (routine, repair, inspection, emergency)
      - `description` (text)
      - `cost` (numeric)
      - `performed_by` (text, name or company)
      - `next_maintenance_date` (date)
      - `parts_replaced` (text)
      - `notes` (text)
      - `recorded_by` (uuid, references profiles)
      - `created_at` (timestamptz)

    - `notifications`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `user_id` (uuid, references profiles)
      - `type` (alert, reminder, info, warning, critical)
      - `category` (feed_low, task_overdue, mortality_high, medication_expiry, equipment, financial)
      - `title` (text)
      - `message` (text)
      - `priority` (low, medium, high, critical)
      - `read` (boolean)
      - `read_at` (timestamptz)
      - `action_url` (text, where to navigate)
      - `metadata` (jsonb, additional data)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Farm members can view relevant data
    - Appropriate roles can create/edit
*/

-- Create environmental logs table
CREATE TABLE IF NOT EXISTS environmental_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE,
  log_date timestamptz DEFAULT now() NOT NULL,
  temperature numeric(5,2),
  humidity numeric(5,2),
  ammonia_level numeric(5,2),
  ventilation_rate text,
  water_consumption numeric(10,2),
  lighting_hours numeric(4,2),
  notes text,
  recorded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('feeder', 'drinker', 'heater', 'ventilation', 'generator', 'incubator', 'other')),
  manufacturer text,
  model text,
  serial_number text,
  purchase_date date,
  purchase_cost numeric(12,2),
  warranty_expiry date,
  status text DEFAULT 'operational' CHECK (status IN ('operational', 'needs_maintenance', 'broken', 'retired')),
  location text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create equipment maintenance table
CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  equipment_id uuid REFERENCES equipment(id) ON DELETE CASCADE NOT NULL,
  maintenance_date date DEFAULT CURRENT_DATE NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('routine', 'repair', 'inspection', 'emergency')),
  description text NOT NULL,
  cost numeric(12,2),
  performed_by text,
  next_maintenance_date date,
  parts_replaced text,
  notes text,
  recorded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('alert', 'reminder', 'info', 'warning', 'critical')),
  category text NOT NULL CHECK (category IN ('feed_low', 'task_overdue', 'mortality_high', 'medication_expiry', 'equipment', 'financial', 'general')),
  title text NOT NULL,
  message text NOT NULL,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  read boolean DEFAULT false,
  read_at timestamptz,
  action_url text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE environmental_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies for environmental_logs
CREATE POLICY "Farm members can view environmental logs"
  ON environmental_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = environmental_logs.farm_id
    )
  );

CREATE POLICY "Farm members can create environmental logs"
  ON environmental_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = environmental_logs.farm_id
    )
  );

CREATE POLICY "Farm managers can update environmental logs"
  ON environmental_logs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = environmental_logs.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = environmental_logs.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete environmental logs"
  ON environmental_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = environmental_logs.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for equipment
CREATE POLICY "Farm members can view equipment"
  ON equipment FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment.farm_id
    )
  );

CREATE POLICY "Farm managers can manage equipment"
  ON equipment FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for equipment_maintenance
CREATE POLICY "Farm members can view equipment maintenance"
  ON equipment_maintenance FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment_maintenance.farm_id
    )
  );

CREATE POLICY "Farm members can create equipment maintenance records"
  ON equipment_maintenance FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment_maintenance.farm_id
    )
  );

CREATE POLICY "Farm managers can update equipment maintenance"
  ON equipment_maintenance FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment_maintenance.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment_maintenance.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete equipment maintenance"
  ON equipment_maintenance FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = equipment_maintenance.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for notifications
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = notifications.farm_id
    )
  );

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notifications"
  ON notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_environmental_logs_farm_id ON environmental_logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_environmental_logs_flock_id ON environmental_logs(flock_id);
CREATE INDEX IF NOT EXISTS idx_environmental_logs_date ON environmental_logs(log_date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_farm_id ON equipment(farm_id);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_farm_id ON equipment_maintenance(farm_id);
CREATE INDEX IF NOT EXISTS idx_equipment_maintenance_equipment_id ON equipment_maintenance(equipment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Add triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_equipment_updated_at'
  ) THEN
    CREATE TRIGGER update_equipment_updated_at
      BEFORE UPDATE ON equipment
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
