/*
  Extend push_subscriptions.prefs with two journal-related categories
  so users can opt in / out of each:

    - `journal_mention` — someone @-tagged me in a journal note
    - `eden_journal`    — Eden wrote an auto-summary or weekly digest
                          on my farm

  Both default to true (opt-out, not opt-in) — the existing pond/
  mortality/feed alerts also default-on. Users who don't want to be
  pinged turn them off in Settings → Notifications.

  Two operations:

  1. Update the column default so NEW push_subscriptions rows include
     the journal categories.
  2. Backfill existing rows that don't already have them defined.
     The `||` jsonb merge is order-preserving: existing keys are
     respected, only the missing two are added.
*/

ALTER TABLE public.push_subscriptions
  ALTER COLUMN prefs
  SET DEFAULT '{
    "pond_alert": true,
    "task_overdue": true,
    "vaccination_due": true,
    "low_feed": true,
    "mortality_spike": true,
    "water_quality": true,
    "journal_mention": true,
    "eden_journal": true
  }'::jsonb;

-- Backfill: existing rows missing the new keys get them set to true.
-- jsonb_set with `create_if_missing => true` is safer than `||` here
-- because it leaves untouched any user who has manually disabled
-- a category (we don't want a migration to silently re-enable it).
UPDATE public.push_subscriptions
   SET prefs = prefs
             || jsonb_build_object(
                  'journal_mention', COALESCE(prefs->'journal_mention', 'true'::jsonb),
                  'eden_journal',    COALESCE(prefs->'eden_journal',    'true'::jsonb)
                )
 WHERE NOT (prefs ? 'journal_mention')
    OR NOT (prefs ? 'eden_journal');

COMMENT ON COLUMN public.push_subscriptions.prefs IS
  'Per-category push opt-in map. Categories: pond_alert, task_overdue, vaccination_due, low_feed, mortality_spike, water_quality, journal_mention, eden_journal. Missing keys default to true (treated as opt-in).';
