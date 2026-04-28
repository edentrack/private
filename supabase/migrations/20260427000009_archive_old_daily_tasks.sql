-- Archive overdue recurring/template-based daily tasks older than 1 day.
-- These pile up from flock creation date; farmers shouldn't see a wall of
-- 60+ overdue tasks on first login.
UPDATE tasks
SET
  is_archived   = true,
  archived_at   = now(),
  archived_by   = null
WHERE
  is_archived  = false
  AND status   = 'pending'
  AND template_id IS NOT NULL
  AND COALESCE(due_date, scheduled_for::date) < CURRENT_DATE - 1;
