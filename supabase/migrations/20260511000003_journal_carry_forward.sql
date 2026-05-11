/*
  Farm Journal — carry-forward feature.

  When a flock is archived (cycle close-out, spent layers sold, etc.)
  some of the journal notes are still valuable for the next batch:

    - Owner-written observations ("Pen 2 had ventilation issues until
      we added the second exhaust fan in June")
    - Lessons learned ("Switched to Hy-Line Brown supplier mid-cycle,
      mortality dropped 0.4%")
    - Vet diagnoses + treatments worth remembering
    - Eden's cycle close-out milestone

  The goal: when the owner starts a new batch, surface those carry-
  forward notes at the top of the new flock's journal so the lessons
  travel from cycle to cycle. Memory across batches becomes a real
  thing instead of relying on the owner to remember.

  Two columns:

  - `is_carry_forward` (boolean, default false) — when true, this
    entry shows in the "Previous Batch" widget of any NEW flock on
    the same farm until the new flock has its own carry-forward
    entries (then it falls off).

  - `carried_from_flock_id` (uuid, nullable, FK to flocks) — set
    when a carry-forward note is COPIED from a previous flock onto
    a new flock. Lets the UI badge it as "From cycle 4" with a tap
    back to the original. We copy rather than reference so deleting
    the old flock doesn't lose the lesson.
*/

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS is_carry_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS carried_from_flock_id uuid NULL REFERENCES public.flocks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS journal_entries_farm_carry_forward_idx
  ON public.journal_entries (farm_id, is_carry_forward, created_at DESC)
  WHERE is_carry_forward = true AND is_deleted = false;

COMMENT ON COLUMN public.journal_entries.is_carry_forward IS
  'When true, the entry surfaces in the "Previous Batch" widget of new flocks on the same farm. Set by the archive-flock curate modal.';

COMMENT ON COLUMN public.journal_entries.carried_from_flock_id IS
  'For entries copied forward from a previous flock — points at the original flock so the UI can show "From cycle 4 of [Flock Name]".';
