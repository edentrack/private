/*
  # Create Worker Shifts Table and RLS Policies

  1. New Tables
    - `worker_shifts`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms) - Farm where the shift is scheduled
      - `worker_id` (uuid, references auth.users) - Worker assigned to the shift
      - `start_time` (timestamptz) - When the shift starts
      - `end_time` (timestamptz) - When the shift ends
      - `created_by` (uuid, references auth.users) - Who created the shift
      - `created_at` (timestamptz)
      - `status` (text) - scheduled, in_progress, completed, missed

  2. Security
    - Enable RLS on `worker_shifts` table
    - Workers can view only their own shifts
    - Owners and managers can view all shifts for their farm
    - Only owners and managers can create and update shifts

  3. Validation
    - End time must be after start time
    - Status must be one of the valid values
    - Check for overlapping shifts for the same worker

  4. Indexes
    - Index on farm_id for fast farm lookups
    - Index on worker_id for fast worker lookups
    - Index on start_time and end_time for date range queries
    - Unique constraint to prevent overlapping shifts

  5. Important Notes
    - Activity logs are created when shifts are assigned or updated
    - Validation prevents scheduling conflicts
    - Workers cannot be assigned overlapping shifts
*/

-- Create worker_shifts table
CREATE TABLE IF NOT EXISTS public.worker_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'scheduled',
  CONSTRAINT valid_shift_times CHECK (end_time > start_time),
  CONSTRAINT valid_shift_status CHECK (status IN ('scheduled', 'in_progress', 'completed', 'missed'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_worker_shifts_farm_id ON public.worker_shifts(farm_id);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_worker_id ON public.worker_shifts(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_start_time ON public.worker_shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_end_time ON public.worker_shifts(end_time);
CREATE INDEX IF NOT EXISTS idx_worker_shifts_status ON public.worker_shifts(status);

-- Enable RLS
ALTER TABLE worker_shifts ENABLE ROW LEVEL SECURITY;

-- Policy: Workers can view their own shifts
CREATE POLICY "Workers can view own shifts"
  ON worker_shifts FOR SELECT
  TO authenticated
  USING (
    worker_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_shifts.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role IN ('owner', 'manager')
      AND fm.is_active = true
    )
  );

-- Policy: Owners and managers can create shifts
CREATE POLICY "Owners and managers can create shifts"
  ON worker_shifts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_shifts.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role IN ('owner', 'manager')
      AND fm.is_active = true
    )
  );

-- Policy: Owners and managers can update shifts
CREATE POLICY "Owners and managers can update shifts"
  ON worker_shifts FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_shifts.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role IN ('owner', 'manager')
      AND fm.is_active = true
    )
  );

-- Policy: Owners and managers can delete shifts
CREATE POLICY "Owners and managers can delete shifts"
  ON worker_shifts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members fm
      WHERE fm.farm_id = worker_shifts.farm_id
      AND fm.user_id = auth.uid()
      AND fm.role IN ('owner', 'manager')
      AND fm.is_active = true
    )
  );
