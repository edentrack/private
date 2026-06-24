/*
  Fix the vaccine-reminders cron — it was scheduled but broken.

  The original migration (20260604000002) built the request URL from
  current_setting('app.supabase_url'), but that custom setting does
  NOT exist on Supabase Postgres (verified: pg_settings has no
  app.supabase_url or app.service_role_key). With a NULL setting the
  URL evaluates to NULL and net.http_post silently fails every run —
  so no vaccine reminders were ever sent.

  Fix: match the pattern used by the working crons
  (pond-alerts-evaluator, send-whatsapp-daily-report) — a hardcoded
  project URL plus current_setting('app.settings.service_role_key',
  true) for the bearer token (the `true` makes a missing setting
  return NULL instead of erroring). vaccine-reminders is deployed
  with verify_jwt = false, so it runs regardless of the auth header.
*/

SELECT cron.unschedule('vaccine-reminders-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'vaccine-reminders-daily'
);

SELECT cron.schedule(
  'vaccine-reminders-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mnxnoggxdgijsbdhgzwc.supabase.co/functions/v1/vaccine-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
