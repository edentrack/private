/*
  Schedule the vaccine-reminders edge function to run daily at 07:00 UTC.
  Uses pg_cron (already enabled on Supabase Pro projects).

  Sends push notifications to farm owners/managers when a vaccine is
  due in 1 day or 3 days. Respects the `vaccination_due` push
  preference category — users who opted out won't receive alerts.
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove old schedule if re-running this migration
SELECT cron.unschedule('vaccine-reminders-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'vaccine-reminders-daily'
);

-- Run daily at 07:00 UTC
SELECT cron.schedule(
  'vaccine-reminders-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/vaccine-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
