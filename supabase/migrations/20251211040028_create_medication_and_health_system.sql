/*
  # Create Medication and Health Management System

  1. New Tables
    - `medication_inventory`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `name` (text, medication name)
      - `type` (vaccine, antibiotic, supplement, dewormer, other)
      - `manufacturer` (text)
      - `active_ingredient` (text)
      - `withdrawal_period_days` (integer, for meat/eggs)
      - `current_stock` (numeric, units)
      - `unit` (ml, tablets, doses, kg)
      - `cost_per_unit` (numeric)
      - `expiry_date` (date)
      - `storage_requirements` (text)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `medication_usage`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `medication_id` (uuid, references medication_inventory)
      - `usage_date` (date)
      - `quantity_used` (numeric)
      - `birds_treated` (integer)
      - `reason` (text, disease/prevention/treatment)
      - `administered_by` (uuid, references profiles)
      - `notes` (text)
      - `created_at` (timestamptz)

    - `health_events`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `flock_id` (uuid, references flocks)
      - `event_date` (date)
      - `event_type` (disease_outbreak, vet_visit, quarantine, observation)
      - `severity` (low, medium, high, critical)
      - `description` (text)
      - `symptoms` (text)
      - `treatment_plan` (text)
      - `birds_affected` (integer)
      - `resolved` (boolean)
      - `resolved_date` (date)
      - `vet_name` (text)
      - `cost` (numeric)
      - `photos` (text[], array of storage paths)
      - `recorded_by` (uuid, references profiles)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `treatment_protocols`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `name` (text)
      - `description` (text)
      - `condition` (text, what it treats)
      - `medications` (jsonb, array of medication info)
      - `duration_days` (integer)
      - `dosage_instructions` (text)
      - `withdrawal_period` (integer)
      - `created_by` (uuid, references profiles)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Farm members can view all health data
    - Managers/owners can create/edit
    - Workers can record usage and events
*/

-- Create medication inventory table
CREATE TABLE IF NOT EXISTS medication_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('vaccine', 'antibiotic', 'supplement', 'dewormer', 'other')),
  manufacturer text,
  active_ingredient text,
  withdrawal_period_days integer DEFAULT 0,
  current_stock numeric(12,2) DEFAULT 0 NOT NULL,
  unit text DEFAULT 'ml' NOT NULL,
  cost_per_unit numeric(12,2),
  expiry_date date,
  storage_requirements text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create medication usage table
CREATE TABLE IF NOT EXISTS medication_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE NOT NULL,
  medication_id uuid REFERENCES medication_inventory(id) ON DELETE SET NULL,
  usage_date date DEFAULT CURRENT_DATE NOT NULL,
  quantity_used numeric(12,2) NOT NULL,
  birds_treated integer,
  reason text,
  administered_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create health events table
CREATE TABLE IF NOT EXISTS health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE NOT NULL,
  event_date date DEFAULT CURRENT_DATE NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('disease_outbreak', 'vet_visit', 'quarantine', 'observation')),
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description text NOT NULL,
  symptoms text,
  treatment_plan text,
  birds_affected integer,
  resolved boolean DEFAULT false,
  resolved_date date,
  vet_name text,
  cost numeric(12,2),
  photos text[],
  recorded_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create treatment protocols table
CREATE TABLE IF NOT EXISTS treatment_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  condition text NOT NULL,
  medications jsonb DEFAULT '[]'::jsonb,
  duration_days integer,
  dosage_instructions text,
  withdrawal_period integer DEFAULT 0,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE medication_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_protocols ENABLE ROW LEVEL SECURITY;

-- Policies for medication_inventory
CREATE POLICY "Farm members can view medication inventory"
  ON medication_inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_inventory.farm_id
    )
  );

CREATE POLICY "Farm managers can manage medication inventory"
  ON medication_inventory FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_inventory.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_inventory.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for medication_usage
CREATE POLICY "Farm members can view medication usage"
  ON medication_usage FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_usage.farm_id
    )
  );

CREATE POLICY "Farm members can record medication usage"
  ON medication_usage FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_usage.farm_id
    )
  );

CREATE POLICY "Farm managers can update medication usage"
  ON medication_usage FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_usage.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_usage.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete medication usage"
  ON medication_usage FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = medication_usage.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for health_events
CREATE POLICY "Farm members can view health events"
  ON health_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = health_events.farm_id
    )
  );

CREATE POLICY "Farm members can create health events"
  ON health_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = health_events.farm_id
    )
  );

CREATE POLICY "Farm managers can update health events"
  ON health_events FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = health_events.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = health_events.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Farm managers can delete health events"
  ON health_events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = health_events.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Policies for treatment_protocols
CREATE POLICY "Farm members can view treatment protocols"
  ON treatment_protocols FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = treatment_protocols.farm_id
    )
  );

CREATE POLICY "Farm managers can manage treatment protocols"
  ON treatment_protocols FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = treatment_protocols.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.farm_id = treatment_protocols.farm_id
      AND profiles.role IN ('owner', 'manager')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_medication_inventory_farm_id ON medication_inventory(farm_id);
CREATE INDEX IF NOT EXISTS idx_medication_usage_farm_id ON medication_usage(farm_id);
CREATE INDEX IF NOT EXISTS idx_medication_usage_flock_id ON medication_usage(flock_id);
CREATE INDEX IF NOT EXISTS idx_medication_usage_medication_id ON medication_usage(medication_id);
CREATE INDEX IF NOT EXISTS idx_health_events_farm_id ON health_events(farm_id);
CREATE INDEX IF NOT EXISTS idx_health_events_flock_id ON health_events(flock_id);
CREATE INDEX IF NOT EXISTS idx_health_events_resolved ON health_events(resolved);
CREATE INDEX IF NOT EXISTS idx_treatment_protocols_farm_id ON treatment_protocols(farm_id);

-- Add triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_medication_inventory_updated_at'
  ) THEN
    CREATE TRIGGER update_medication_inventory_updated_at
      BEFORE UPDATE ON medication_inventory
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_health_events_updated_at'
  ) THEN
    CREATE TRIGGER update_health_events_updated_at
      BEFORE UPDATE ON health_events
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
