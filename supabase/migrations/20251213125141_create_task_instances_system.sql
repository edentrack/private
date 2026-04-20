/*
  # Task Instances System for On-Demand Task Generation

  1. Overview
    This migration creates a task_instances table that allows tasks to be generated
    on-demand rather than pre-creating 60 days worth of tasks. Templates define
    the recurring pattern, instances are created only when needed (today or viewing a specific day).

  2. New Tables
    - `task_instances` - Individual task instances for specific dates
      - `id` (uuid, primary key)
      - `template_id` (uuid, references task_templates)
      - `farm_id` (uuid, required)
      - `flock_id` (uuid, nullable)
      - `scheduled_date` (date, the day this instance is for)
      - `due_time` (time, when the task is due)
      - `status` (text: 'pending'|'completed'|'skipped'|'overdue')
      - `completed_at` (timestamptz)
      - `completed_by` (uuid)
      - `completion_data` (jsonb, recorded values)
      - `notes` (text)
      - `is_custom` (boolean, true if one-off task not from template)
      - `show_on_dashboard` (boolean)
      - `created_at` timestamp

  3. Changes to task_templates
    - Add completion_window_minutes (default 120)
    - Add flock_type_scope (general|broiler|layer)
    - Add is_active toggle

  4. Security
    - Enable RLS on task_instances
    - Farm members can view/manage instances in their farm

  5. Functions
    - generate_task_instances_for_date() - creates instances for a given date
    - get_tasks_for_date() - returns instances for dashboard/view
*/

-- Add new columns to task_templates if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'completion_window_minutes'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN completion_window_minutes int DEFAULT 120;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'flock_type_scope'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN flock_type_scope text DEFAULT 'general' 
      CHECK (flock_type_scope IN ('general', 'broiler', 'layer'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'task_templates' AND column_name = 'default_time'
  ) THEN
    ALTER TABLE task_templates ADD COLUMN default_time time DEFAULT '08:00';
  END IF;
END $$;

-- Create task_instances table
CREATE TABLE IF NOT EXISTS task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES task_templates(id) ON DELETE CASCADE,
  farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  flock_id uuid REFERENCES flocks(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  due_time time DEFAULT '08:00',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'overdue')),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  completion_data jsonb DEFAULT '{}',
  notes text,
  title text,
  description text,
  is_custom boolean DEFAULT false,
  show_on_dashboard boolean DEFAULT true,
  priority int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT unique_template_date_flock UNIQUE NULLS NOT DISTINCT (template_id, scheduled_date, flock_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_task_instances_farm_id ON task_instances(farm_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_template_id ON task_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_scheduled_date ON task_instances(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_task_instances_status ON task_instances(status);
CREATE INDEX IF NOT EXISTS idx_task_instances_flock_id ON task_instances(flock_id);
CREATE INDEX IF NOT EXISTS idx_task_instances_farm_date ON task_instances(farm_id, scheduled_date);

-- Enable RLS
ALTER TABLE task_instances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_instances
CREATE POLICY "Farm members can view task instances"
  ON task_instances FOR SELECT
  TO authenticated
  USING (is_farm_member(farm_id));

CREATE POLICY "Farm members can create task instances"
  ON task_instances FOR INSERT
  TO authenticated
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Farm members can update task instances"
  ON task_instances FOR UPDATE
  TO authenticated
  USING (is_farm_member(farm_id))
  WITH CHECK (is_farm_member(farm_id));

CREATE POLICY "Managers can delete task instances"
  ON task_instances FOR DELETE
  TO authenticated
  USING (
    is_farm_member(farm_id) AND
    get_user_farm_role(farm_id) IN ('owner', 'manager')
  );

-- Function to generate task instances for a specific date
CREATE OR REPLACE FUNCTION generate_task_instances_for_date(
  p_farm_id uuid,
  p_date date,
  p_flock_id uuid DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_flock RECORD;
  v_count int := 0;
  v_day_of_week int;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_date)::int;

  FOR v_template IN
    SELECT tt.*
    FROM task_templates tt
    WHERE tt.farm_id = p_farm_id
      AND tt.is_active = true
      AND (tt.scope = 'farm' OR tt.scope = 'flock')
      AND (
        tt.frequency = 'daily'
        OR (tt.frequency = 'weekly' AND tt.days_of_week IS NOT NULL AND v_day_of_week = ANY(tt.days_of_week))
        OR (tt.frequency = 'custom' AND tt.custom_interval_days IS NOT NULL 
            AND (p_date - COALESCE(tt.start_date, CURRENT_DATE)) % tt.custom_interval_days = 0)
      )
  LOOP
    IF v_template.scope = 'flock' THEN
      FOR v_flock IN
        SELECT f.id, f.purpose
        FROM flocks f
        WHERE f.farm_id = p_farm_id
          AND f.is_archived = false
          AND (p_flock_id IS NULL OR f.id = p_flock_id)
          AND (
            v_template.flock_type_scope = 'general'
            OR (v_template.flock_type_scope = 'broiler' AND LOWER(f.purpose::text) = 'broiler')
            OR (v_template.flock_type_scope = 'layer' AND LOWER(f.purpose::text) = 'layer')
          )
      LOOP
        INSERT INTO task_instances (
          template_id, farm_id, flock_id, scheduled_date, due_time,
          title, description, priority, show_on_dashboard
        )
        VALUES (
          v_template.id, p_farm_id, v_flock.id, p_date, 
          COALESCE(v_template.default_time, '08:00'::time),
          v_template.name, v_template.description, v_template.priority,
          COALESCE(v_template.show_on_dashboard, true)
        )
        ON CONFLICT (template_id, scheduled_date, flock_id) DO NOTHING;
        
        v_count := v_count + 1;
      END LOOP;
    ELSE
      INSERT INTO task_instances (
        template_id, farm_id, flock_id, scheduled_date, due_time,
        title, description, priority, show_on_dashboard
      )
      VALUES (
        v_template.id, p_farm_id, NULL, p_date,
        COALESCE(v_template.default_time, '08:00'::time),
        v_template.name, v_template.description, v_template.priority,
        COALESCE(v_template.show_on_dashboard, true)
      )
      ON CONFLICT (template_id, scheduled_date, flock_id) DO NOTHING;
      
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Function to get tasks for a specific date (generates if needed)
CREATE OR REPLACE FUNCTION get_tasks_for_date(
  p_farm_id uuid,
  p_date date
)
RETURNS TABLE (
  id uuid,
  template_id uuid,
  farm_id uuid,
  flock_id uuid,
  flock_name text,
  scheduled_date date,
  due_time time,
  status text,
  completed_at timestamptz,
  completed_by uuid,
  completion_data jsonb,
  notes text,
  title text,
  description text,
  is_custom boolean,
  show_on_dashboard boolean,
  priority int,
  template_name text,
  template_category text,
  input_fields jsonb,
  completion_window_minutes int,
  flock_type_scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM generate_task_instances_for_date(p_farm_id, p_date);

  RETURN QUERY
  SELECT 
    ti.id,
    ti.template_id,
    ti.farm_id,
    ti.flock_id,
    f.name AS flock_name,
    ti.scheduled_date,
    ti.due_time,
    ti.status,
    ti.completed_at,
    ti.completed_by,
    ti.completion_data,
    ti.notes,
    COALESCE(ti.title, tt.name) AS title,
    COALESCE(ti.description, tt.description) AS description,
    ti.is_custom,
    ti.show_on_dashboard,
    COALESCE(ti.priority, tt.priority, 0) AS priority,
    tt.name AS template_name,
    tt.category AS template_category,
    tt.input_fields,
    COALESCE(tt.completion_window_minutes, 120) AS completion_window_minutes,
    COALESCE(tt.flock_type_scope, 'general') AS flock_type_scope
  FROM task_instances ti
  LEFT JOIN task_templates tt ON ti.template_id = tt.id
  LEFT JOIN flocks f ON ti.flock_id = f.id
  WHERE ti.farm_id = p_farm_id
    AND ti.scheduled_date = p_date
  ORDER BY ti.due_time, ti.priority DESC, ti.title;
END;
$$;

-- Function to complete a task instance
CREATE OR REPLACE FUNCTION complete_task_instance(
  p_instance_id uuid,
  p_completion_data jsonb DEFAULT '{}',
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance task_instances%ROWTYPE;
BEGIN
  SELECT * INTO v_instance
  FROM task_instances
  WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task instance not found';
  END IF;

  IF NOT is_farm_member(v_instance.farm_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE task_instances
  SET 
    status = 'completed',
    completed_at = now(),
    completed_by = auth.uid(),
    completion_data = COALESCE(p_completion_data, '{}'),
    notes = COALESCE(p_notes, notes)
  WHERE id = p_instance_id;

  PERFORM log_audit_entry(
    v_instance.farm_id,
    'task.complete',
    'task_instance',
    p_instance_id,
    jsonb_build_object('title', v_instance.title, 'completion_data', p_completion_data)
  );

  RETURN true;
END;
$$;

-- Function to create a custom one-off task
CREATE OR REPLACE FUNCTION create_custom_task(
  p_farm_id uuid,
  p_title text,
  p_scheduled_date date,
  p_due_time time DEFAULT '08:00',
  p_description text DEFAULT NULL,
  p_flock_id uuid DEFAULT NULL,
  p_show_on_dashboard boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_id uuid;
BEGIN
  IF NOT is_farm_member(p_farm_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO task_instances (
    farm_id, flock_id, scheduled_date, due_time,
    title, description, is_custom, show_on_dashboard
  )
  VALUES (
    p_farm_id, p_flock_id, p_scheduled_date, p_due_time,
    p_title, p_description, true, p_show_on_dashboard
  )
  RETURNING id INTO v_instance_id;

  RETURN v_instance_id;
END;
$$;
