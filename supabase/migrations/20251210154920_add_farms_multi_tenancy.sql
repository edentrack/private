/*
  # Add Farms Multi-Tenancy

  ## Overview
  This migration adds a farm-based multi-tenancy system to the application.
  Each user belongs to a farm, and all data is scoped to farms.

  ## 1. New Tables
  - `farms`
    - `id` (uuid, primary key)
    - `name` (text, farm name)
    - `owner_id` (uuid, references profiles.id)
    - `created_at` (timestamptz)
    - `updated_at` (timestamptz)

  ## 2. Modified Tables
  All tables updated to include `farm_id` foreign key:
  - `profiles` - Users now belong to a farm
  - `flocks` - Flocks belong to a farm
  - `expenses` - Expenses belong to a farm
  - `tasks` - Tasks belong to a farm
  - `vaccinations` - Vaccinations belong to a farm
  - `mortality_logs` - Mortality logs belong to a farm
  - `weight_logs` - Weight logs belong to a farm

  ## 3. Data Migration
  - Creates a farm for each existing user
  - Assigns farm ownership to the user
  - Backfills farm_id for all existing records based on user relationships

  ## 4. Security Changes
  - Updates all RLS policies to enforce farm-based access
  - Users can only access data where farm_id matches their profile's farm_id
  - Policies check farm membership for all operations (SELECT, INSERT, UPDATE, DELETE)

  ## 5. Important Notes
  - All existing data is preserved and properly migrated
  - Farm relationships are established through foreign keys with CASCADE on delete
  - RLS policies are restrictive by default - users can only access their farm's data
*/

-- Create farms table
CREATE TABLE IF NOT EXISTS farms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;

-- Create a farm for each existing user and update profiles
DO $$
DECLARE
  profile_record RECORD;
  new_farm_id uuid;
BEGIN
  -- Only proceed if farm_id column doesn't exist in profiles yet
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'farm_id'
  ) THEN
    -- First, add farm_id column to profiles (nullable initially)
    ALTER TABLE profiles ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE SET NULL;
    
    -- Create a farm for each existing profile
    FOR profile_record IN SELECT id, full_name, farm_name FROM profiles LOOP
      -- Create farm with name from profile's farm_name or full_name
      INSERT INTO farms (name, owner_id)
      VALUES (
        COALESCE(NULLIF(profile_record.farm_name, ''), profile_record.full_name || '''s Farm'),
        profile_record.id
      )
      RETURNING id INTO new_farm_id;
      
      -- Update profile with farm_id
      UPDATE profiles SET farm_id = new_farm_id WHERE id = profile_record.id;
    END LOOP;
    
    -- Make farm_id NOT NULL after backfilling
    ALTER TABLE profiles ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to flocks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flocks' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE flocks ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from user's profile
    UPDATE flocks f
    SET farm_id = p.farm_id
    FROM profiles p
    WHERE f.user_id = p.id;
    
    ALTER TABLE flocks ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to expenses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'expenses' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE expenses ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from user's profile
    UPDATE expenses e
    SET farm_id = p.farm_id
    FROM profiles p
    WHERE e.user_id = p.id;
    
    ALTER TABLE expenses ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from user's profile
    UPDATE tasks t
    SET farm_id = p.farm_id
    FROM profiles p
    WHERE t.user_id = p.id;
    
    ALTER TABLE tasks ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to vaccinations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vaccinations' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE vaccinations ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from flock's user's profile
    UPDATE vaccinations v
    SET farm_id = p.farm_id
    FROM flocks f
    JOIN profiles p ON f.user_id = p.id
    WHERE v.flock_id = f.id;
    
    ALTER TABLE vaccinations ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to mortality_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mortality_logs' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE mortality_logs ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from flock's user's profile
    UPDATE mortality_logs m
    SET farm_id = p.farm_id
    FROM flocks f
    JOIN profiles p ON f.user_id = p.id
    WHERE m.flock_id = f.id;
    
    ALTER TABLE mortality_logs ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Add farm_id to weight_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weight_logs' AND column_name = 'farm_id'
  ) THEN
    ALTER TABLE weight_logs ADD COLUMN farm_id uuid REFERENCES farms(id) ON DELETE CASCADE;
    
    -- Backfill farm_id from flock's user's profile
    UPDATE weight_logs w
    SET farm_id = p.farm_id
    FROM flocks f
    JOIN profiles p ON f.user_id = p.id
    WHERE w.flock_id = f.id;
    
    ALTER TABLE weight_logs ALTER COLUMN farm_id SET NOT NULL;
  END IF;
END $$;

-- Create indexes for farm_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_farm_id ON profiles(farm_id);
CREATE INDEX IF NOT EXISTS idx_flocks_farm_id ON flocks(farm_id);
CREATE INDEX IF NOT EXISTS idx_expenses_farm_id ON expenses(farm_id);
CREATE INDEX IF NOT EXISTS idx_tasks_farm_id ON tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_vaccinations_farm_id ON vaccinations(farm_id);
CREATE INDEX IF NOT EXISTS idx_mortality_logs_farm_id ON mortality_logs(farm_id);
CREATE INDEX IF NOT EXISTS idx_weight_logs_farm_id ON weight_logs(farm_id);

-- RLS Policies for farms
DROP POLICY IF EXISTS "Users can view their own farm" ON farms;
CREATE POLICY "Users can view their own farm"
  ON farms FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update their own farm" ON farms;
CREATE POLICY "Users can update their own farm"
  ON farms FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    id IN (SELECT farm_id FROM profiles WHERE id = auth.uid())
  );

-- Update RLS Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Update RLS Policies for flocks
DROP POLICY IF EXISTS "Users can view flocks in their farm" ON flocks;
CREATE POLICY "Users can view flocks in their farm"
  ON flocks FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert flocks in their farm" ON flocks;
CREATE POLICY "Users can insert flocks in their farm"
  ON flocks FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update flocks in their farm" ON flocks;
CREATE POLICY "Users can update flocks in their farm"
  ON flocks FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete flocks in their farm" ON flocks;
CREATE POLICY "Users can delete flocks in their farm"
  ON flocks FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

-- Update RLS Policies for expenses
DROP POLICY IF EXISTS "Users can view expenses in their farm" ON expenses;
CREATE POLICY "Users can view expenses in their farm"
  ON expenses FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert expenses in their farm" ON expenses;
CREATE POLICY "Users can insert expenses in their farm"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update expenses in their farm" ON expenses;
CREATE POLICY "Users can update expenses in their farm"
  ON expenses FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete expenses in their farm" ON expenses;
CREATE POLICY "Users can delete expenses in their farm"
  ON expenses FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

-- Update RLS Policies for tasks
DROP POLICY IF EXISTS "Users can view tasks in their farm" ON tasks;
CREATE POLICY "Users can view tasks in their farm"
  ON tasks FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert tasks in their farm" ON tasks;
CREATE POLICY "Users can insert tasks in their farm"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update tasks in their farm" ON tasks;
CREATE POLICY "Users can update tasks in their farm"
  ON tasks FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete tasks in their farm" ON tasks;
CREATE POLICY "Users can delete tasks in their farm"
  ON tasks FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

-- Update RLS Policies for vaccinations
DROP POLICY IF EXISTS "Users can view vaccinations in their farm" ON vaccinations;
CREATE POLICY "Users can view vaccinations in their farm"
  ON vaccinations FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert vaccinations in their farm" ON vaccinations;
CREATE POLICY "Users can insert vaccinations in their farm"
  ON vaccinations FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update vaccinations in their farm" ON vaccinations;
CREATE POLICY "Users can update vaccinations in their farm"
  ON vaccinations FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete vaccinations in their farm" ON vaccinations;
CREATE POLICY "Users can delete vaccinations in their farm"
  ON vaccinations FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

-- Update RLS Policies for mortality_logs
DROP POLICY IF EXISTS "Users can view mortality logs in their farm" ON mortality_logs;
CREATE POLICY "Users can view mortality logs in their farm"
  ON mortality_logs FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert mortality logs in their farm" ON mortality_logs;
CREATE POLICY "Users can insert mortality logs in their farm"
  ON mortality_logs FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update mortality logs in their farm" ON mortality_logs;
CREATE POLICY "Users can update mortality logs in their farm"
  ON mortality_logs FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete mortality logs in their farm" ON mortality_logs;
CREATE POLICY "Users can delete mortality logs in their farm"
  ON mortality_logs FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

-- Update RLS Policies for weight_logs
DROP POLICY IF EXISTS "Users can view weight logs in their farm" ON weight_logs;
CREATE POLICY "Users can view weight logs in their farm"
  ON weight_logs FOR SELECT
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can insert weight logs in their farm" ON weight_logs;
CREATE POLICY "Users can insert weight logs in their farm"
  ON weight_logs FOR INSERT
  TO authenticated
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can update weight logs in their farm" ON weight_logs;
CREATE POLICY "Users can update weight logs in their farm"
  ON weight_logs FOR UPDATE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can delete weight logs in their farm" ON weight_logs;
CREATE POLICY "Users can delete weight logs in their farm"
  ON weight_logs FOR DELETE
  TO authenticated
  USING (farm_id IN (SELECT farm_id FROM profiles WHERE id = auth.uid()));