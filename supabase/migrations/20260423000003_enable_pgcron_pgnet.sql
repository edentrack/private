-- Enable pg_net (async HTTP from SQL) and pg_cron (job scheduling)
-- Both are available on all Supabase plans.
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Now schedule the subscription-renewal edge function daily at 06:00 UTC.
-- Requires app.settings.supabase_url and app.settings.service_role_key to be set:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://mnxnoggxdgijsbdhgzwc.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_key>';
DO $outer$
BEGIN
  PERFORM cron.unschedule('subscription-renewal');
EXCEPTION WHEN OTHERS THEN NULL; END $outer$;

SELECT cron.schedule(
  'subscription-renewal',
  '0 6 * * *',
  $cron$
  SELECT extensions.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/subscription-renewal',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
                 'Content-Type', 'application/json'
               ),
    body    := '{}'
  );
  $cron$
);
