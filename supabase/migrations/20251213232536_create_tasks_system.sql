/*
  # Create Tasks System

  1. New Tables
    - `daily_tasks`
      - `id` (uuid, primary key)
      - `farm_id` (uuid, references farms)
      - `title` (text)
      - `description` (text)
      - `due_time` (time)
      - `due_date` (date)
      - `completed` (boolean)
      - `completed_at` (timestamptz)
      - `recurring` (boolean)
      - `recurring_frequency` (text)
      - `created_by` (uuid, references auth.users)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `daily_tasks` table
    - Add policies for authenticated users to manage tasks in their farm
*/

CREATE TABLE IF NOT EXISTS daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id uuid REFERENCES farms(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  due_time time,
  due_date date DEFAULT CURRENT_DATE NOT NULL,
  completed boolean DEFAULT false NOT NULL,
  completed_at timestamptz,
  recurring boolean DEFAULT false NOT NULL,
  recurring_frequency text CHECK (recurring_frequency IN ('daily', 'weekly', 'monthly')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_farm ON daily_tasks(farm_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_completed ON daily_tasks(completed);

ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tasks in their farm"
  ON daily_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = daily_tasks.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can create tasks in their farm"
  ON daily_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = daily_tasks.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager', 'worker')
    )
  );

CREATE POLICY "Users can update tasks in their farm"
  ON daily_tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = daily_tasks.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = daily_tasks.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
    )
  );

CREATE POLICY "Users can delete tasks in their farm"
  ON daily_tasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM farm_members
      WHERE farm_members.farm_id = daily_tasks.farm_id
      AND farm_members.user_id = auth.uid()
      AND farm_members.is_active = true
      AND farm_members.role IN ('owner', 'manager')
    )
  );
