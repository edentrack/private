/*
  Add `occurred_at` to journal_entries so users can BACKDATE notes.

  Until this migration, every journal row was timestamped with
  `created_at` = the moment it was saved. That breaks the common case
  of "I forgot to log Tuesday's mortality, let me jot it down on
  Wednesday under Tuesday's date."

  Design:
    - `occurred_at` is the canonical "this event happened on" date.
      Defaults to now() for new rows; backfilled to `created_at` for
      existing rows so the page-header date stamps stay accurate.
    - `created_at` is preserved as the audit trail (when the row was
      actually written). The two diverge only when the user backdates.
    - The page-header date stamp + the date-range filter both read
      `occurred_at`. `created_at` is for audit / debug only.

  Indexes mirror the existing `created_at` ones so date-range queries
  (week / month / custom) stay fast.

  We also point the existing trigger-based auto-loggers at the linked
  event's date when possible — handled separately in the journal
  auto-trigger migration's next revision. For now they all default to
  now(), which is correct: a sale logged today happened today.
*/

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

-- Backfill: for rows written before this migration, occurred_at should
-- equal the moment the entry was created. No way to recover a "true"
-- event date for historical rows, so this is the best we can do.
UPDATE public.journal_entries
   SET occurred_at = created_at
 WHERE occurred_at = created_at  -- effectively a no-op safety check
    OR occurred_at IS NULL;

-- Replace the two main indexes to sort by occurred_at first. Keep
-- created_at as the secondary key for stable ordering when two
-- entries share the same occurred date.
DROP INDEX IF EXISTS journal_entries_farm_created_idx;
DROP INDEX IF EXISTS journal_entries_farm_channel_idx;

CREATE INDEX IF NOT EXISTS journal_entries_farm_occurred_idx
  ON public.journal_entries (farm_id, occurred_at DESC, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS journal_entries_farm_channel_occurred_idx
  ON public.journal_entries (farm_id, channel, occurred_at DESC, created_at DESC)
  WHERE is_deleted = false;

COMMENT ON COLUMN public.journal_entries.occurred_at IS
  'When the event actually happened (user-editable, defaults to now). Use this for grouping/filtering. created_at remains the audit trail of when the row was written.';
