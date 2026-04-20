/*
  Task Template Recurrence Fields

  Adds optional recurrence controls so owners can configure:
  - daily tasks
  - weekly tasks on specific days
  - one-day tasks that only occur on a chosen date

  NOTE: This is intentionally additive and backward compatible.
*/

ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS days_of_week int[];

ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS one_time_date date;

CREATE INDEX IF NOT EXISTS idx_task_templates_one_time_date
  ON task_templates(one_time_date)
  WHERE one_time_date IS NOT NULL;

