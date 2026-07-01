/*
  Fix two cron jobs that have been failing on every run.

  Found via cron.job_run_details (2026-07-01):

  1. subscription-renewal — body was convert_to('{}', 'UTF8') (bytea).
     net.http_post has no bytea overload, so every run errored with
     "function net.http_post(url => unknown, headers => jsonb,
     body => bytea) does not exist". The renewal job has NEVER
     completed: no auto-renewals, no expiry reminders, no downgrades.

  2. journal-cron-daily — the stored command contained doubled
     single-quotes (''Content-Type'') from a bad escaping pass,
     producing "syntax error at or near Content" on every run.
     It also embedded the service-role JWT directly in the cron
     command; that key is removed here (the function is deployed
     with verify_jwt = false, matching the other cron targets).

  Both are rescheduled with the same known-good pattern as
  vaccine-reminders-daily (see 20260604000005).
*/

SELECT cron.unschedule('subscription-renewal') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'subscription-renewal'
);

SELECT cron.schedule(
  'subscription-renewal',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mnxnoggxdgijsbdhgzwc.supabase.co/functions/v1/subscription-renewal',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('journal-cron-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'journal-cron-daily'
);

SELECT cron.schedule(
  'journal-cron-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mnxnoggxdgijsbdhgzwc.supabase.co/functions/v1/journal-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
