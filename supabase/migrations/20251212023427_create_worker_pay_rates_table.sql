/*
  # Create Worker Pay Rates Table

  1. New Tables
    - `worker_pay_rates`
      - `id` (uuid, primary key) - Unique identifier
      - `farm_id` (uuid, foreign key) - References farms table
      - `user_id` (uuid, foreign key) - References profiles table (the worker)
      - `pay_type` (text) - Type of compensation: 'hourly' or 'salary'
      - `hourly_rate` (numeric) - Hourly rate for hourly workers
      - `overtime_rate` (numeric) - Overtime rate for hourly workers
      - `monthly_salary` (numeric) - Monthly salary for salaried workers
      - `currency` (text) - Currency code (default: XAF)
      - `effective_from` (timestamptz) - When this rate becomes effective
      - `created_at` (timestamptz) - Record creation timestamp

  2. Security
    - Enable RLS on worker_pay_rates table
    - Owners and managers can view and edit all pay rates for their farm
    - Workers can view only their own active pay rate
    
  3. Constraints
    - pay_type must be either 'hourly' or 'salary'
    - For hourly: hourly_rate must be set
    - For salary: monthly_salary must be set
    - Unique constraint on (farm_id, user_id, effective_from) to prevent duplicates

  4. Indexes
    - Index on (farm_id, user_id, effective_from) for efficient lookups
    - Index on effective_from for historical queries
*/

-- Create worker_pay_rates table
CREATE TABLE IF NOT EXISTS worker_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pay_type text NOT NULL DEFAULT 'hourly',
  hourly_rate numeric(12,2),
  overtime_rate numeric(12,2),
  monthly_salary numeric(12,2),
  currency text NOT NULL DEFAULT 'XAF',
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_pay_type CHECK (pay_type IN ('hourly', 'salary')),
  CONSTRAINT hourly_rate_required CHECK (
    (pay_type = 'hourly' AND hourly_rate IS NOT NULL AND hourly_rate > 0) OR
    (pay_type = 'salary')
  ),
  CONSTRAINT salary_required CHECK (
    (pay_type = 'salary' AND monthly_salary IS NOT NULL AND monthly_salary > 0) OR
    (pay_type = 'hourly')
  ),
  CONSTRAINT unique_effective_date UNIQUE (farm_id, user_id, effective_from)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_worker_pay_rates_farm_user ON worker_pay_rates(farm_id, user_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_worker_pay_rates_effective ON worker_pay_rates(effective_from);

-- Enable RLS
ALTER TABLE worker_pay_rates ENABLE ROW LEVEL SECURITY;

-- Policy: Owners and managers can view all pay rates for their farm
CREATE POLICY "Farm owners and managers can view all pay rates"
  ON worker_pay_rates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
        AND fm.role IN ('owner', 'manager')
    )
  );

-- Policy: Workers can view only their own pay rates
CREATE POLICY "Workers can view their own pay rates"
  ON worker_pay_rates
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
    )
  );

-- Policy: Owners and managers can insert pay rates
CREATE POLICY "Farm owners and managers can insert pay rates"
  ON worker_pay_rates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
        AND fm.role IN ('owner', 'manager')
    )
  );

-- Policy: Owners and managers can update pay rates
CREATE POLICY "Farm owners and managers can update pay rates"
  ON worker_pay_rates
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
        AND fm.role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
        AND fm.role IN ('owner', 'manager')
    )
  );

-- Policy: Owners and managers can delete pay rates
CREATE POLICY "Farm owners and managers can delete pay rates"
  ON worker_pay_rates
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_pay_rates.farm_id
        AND fm.user_id = auth.uid()
        AND fm.is_active = true
        AND fm.role IN ('owner', 'manager')
    )
  );
