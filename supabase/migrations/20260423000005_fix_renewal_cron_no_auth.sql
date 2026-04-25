-- subscription-renewal is deployed with --no-verify-jwt so no Authorization header needed.
-- Drop the previous attempt and register the clean version.
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
    url     := 'https://mnxnoggxdgijsbdhgzwc.supabase.co/functions/v1/subscription-renewal',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := convert_to('{}', 'UTF8')
  ) AS request_id;
  $cron$
);
