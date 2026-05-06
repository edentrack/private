-- Phase 6 #ONBO-A — Conversational onboarding state.
--
-- A user can take one of two paths after signup:
--   1. Chat with Eden  → Eden creates farm + flock + first log via
--      CREATE_FARM/CREATE_FLOCK/CREATE_POND/CREATE_RABBITRY action blocks.
--   2. Fill out a form → existing setup wizard (unchanged).
--
-- This column tracks where they are. The legacy boolean
-- profiles.onboarding_completed stays in place for compatibility — the
-- new column is the source of truth for routing decisions.
--
-- See docs/BRIEF_PHASE_6_CONVERSATIONAL_ONBOARDING.md.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'chose_chat', 'chose_form', 'completed'));

-- Backfill: anyone who already belongs to a farm has clearly finished
-- whatever path they took, so they skip the choice screen on next load.
UPDATE public.profiles p
SET onboarding_status = 'completed'
WHERE EXISTS (
  SELECT 1 FROM public.farm_members fm WHERE fm.user_id = p.id
);

-- Defensive: if the legacy boolean is set, mark completed too.
UPDATE public.profiles
SET onboarding_status = 'completed'
WHERE onboarding_completed = true
  AND onboarding_status <> 'completed';

COMMENT ON COLUMN public.profiles.onboarding_status IS
  'Phase 6 onboarding state machine: not_started → chose_chat|chose_form → completed. Source of truth for the post-auth routing decision. See docs/BRIEF_PHASE_6_CONVERSATIONAL_ONBOARDING.md.';
