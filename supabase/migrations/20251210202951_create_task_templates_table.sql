/*
  # Create Task Templates Table

  1. New Tables
    - `task_templates`
      - `id` (uuid, primary key) - Unique identifier for the template
      - `title` (text) - Task title/name
      - `description` (text, nullable) - Detailed description of the task
      - `task_type` (text) - Type: "data" (requires input) or "checklist" (confirmation only)
      - `category` (text) - Grouping category (e.g., "Bird Care & Health", "Data Recording")
      - `requires_input` (boolean) - Whether task requires data input
      - `input_fields` (jsonb, nullable) - JSON schema for required inputs (for data tasks)
      - `updates_inventory` (boolean) - Whether task automatically updates inventory
      - `is_active` (boolean) - Whether template is active/enabled
      - `display_order` (integer) - Order for displaying tasks
      - `icon` (text, nullable) - Icon identifier for UI
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `task_templates` table
    - Add policy for all authenticated users to read templates
    - Templates are read-only for regular users (only system/admin can modify)
*/

CREATE TABLE IF NOT EXISTS task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  task_type text NOT NULL CHECK (task_type IN ('data', 'checklist')),
  category text NOT NULL,
  requires_input boolean NOT NULL DEFAULT false,
  input_fields jsonb DEFAULT NULL,
  updates_inventory boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  icon text DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read task templates"
  ON task_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_task_templates_type ON task_templates(task_type);
CREATE INDEX IF NOT EXISTS idx_task_templates_category ON task_templates(category);
CREATE INDEX IF NOT EXISTS idx_task_templates_active ON task_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_task_templates_order ON task_templates(display_order);
