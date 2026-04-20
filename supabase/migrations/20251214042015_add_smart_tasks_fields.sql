/*
  # Add Smart Tasks System Fields

  1. Changes to Tasks Table
    - Add `critical` boolean flag for urgent tasks
    - Add `auto_generated` boolean flag to track system-generated tasks
    - Add `recurring` boolean flag for daily tasks
    - Add indexes for performance

  2. Indexes
    - Index on flock_id for quick flock-based queries
    - Index on due_date for date-based filtering
    - Index on status for completion tracking
*/

-- Add new columns for smart tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  critical BOOLEAN DEFAULT FALSE;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  auto_generated BOOLEAN DEFAULT FALSE;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  recurring BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_flock ON tasks(flock_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_auto_generated ON tasks(auto_generated);
