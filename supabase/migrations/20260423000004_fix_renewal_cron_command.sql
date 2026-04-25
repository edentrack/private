-- Fix renewal cron job to use correct net.http_post schema reference.
-- pg_net on Supabase exposes functions under the 'net' schema.
DO $outer$
BEGIN
  PERFORM cron.unschedule('subscription-renewal');
EXCEPTION WHEN OTHERS THEN NULL;
END $outer$;

SELECT cron.schedule(
  'subscription-renewal',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/subscription-renewal',
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
                 'Content-Type', 'application/json'
               ),
    body    := convert_to('{}', 'UTF8')
  ) AS request_id;
  $cron$
);
