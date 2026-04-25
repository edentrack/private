-- Schedule daily subscription renewal job at 6:00 AM UTC.
-- Requires pg_cron + pg_net extensions (both enabled by default on Supabase).
--
-- Before this runs you must set two database parameters:
--   ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<project-id>.supabase.co';
--   ALTER DATABASE postgres SET app.settings.service_role_key = '<service_role_key>';
-- OR set them temporarily per-session; the function reads them at call time.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN

    PERFORM cron.unschedule('subscription-renewal') ;

    PERFORM cron.schedule(
      'subscription-renewal',
      '0 6 * * *',
      $cron$
      SELECT net.http_post(
        url        := current_setting('app.settings.supabase_url') || '/functions/v1/subscription-renewal',
        headers    := jsonb_build_object(
                        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
                        'Content-Type',  'application/json'
                      ),
        body       := '{}'::jsonb
      );
      $cron$
    );

    RAISE NOTICE 'Scheduled subscription-renewal to run daily at 06:00 UTC';

  ELSE
    RAISE NOTICE 'pg_cron or pg_net not available — schedule the subscription-renewal edge function manually';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule subscription-renewal: %', SQLERRM;
END $$;
