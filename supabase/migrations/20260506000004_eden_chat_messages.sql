-- Per-farm Eden chat history.
--
-- Solves a critical multi-tenant bug found during prod verification on
-- 2026-05-06: switching tenants without clearing chat caused Eden to use
-- the previous tenant's conversation as ground truth on the new tenant
-- (e.g. asking for "rabbitry name" on a poultry farm, referencing rabbit
-- doe IDs that don't exist there).
--
-- Design doc: docs/EDEN_PER_FARM_CHAT.md
--
-- Key facts:
--   - Supabase is the source of truth. Frontend caches in localStorage.
--   - farm_id IS NULL means the message was sent in "All my farms"
--     cross-farm mode and is private to that user (not visible to other
--     farm members).
--   - log_action stores the LOG block JSON Eden proposed; log_confirmed
--     captures whether the user clicked Yes/No on the confirmation card.
--   - log_target_farm_id is the farm the action wrote to — important in
--     cross-farm mode where the chat's farm_id is NULL but the action
--     targeted a specific farm.
--
-- All operations are IF NOT EXISTS / additive so re-running is safe.

CREATE TABLE IF NOT EXISTS public.eden_chat_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = "All my farms" cross-farm mode message, scoped to user only.
  farm_id              uuid REFERENCES public.farms(id) ON DELETE CASCADE,
  role                 text NOT NULL CHECK (role IN ('user', 'assistant')),
  content              text NOT NULL,
  attachments          jsonb,
  log_action           jsonb,
  log_confirmed        boolean,
  log_target_farm_id   uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Per-farm scrollback (the most common query path).
CREATE INDEX IF NOT EXISTS eden_chat_user_farm_idx
  ON public.eden_chat_messages(user_id, farm_id, created_at DESC);

-- Cross-farm (All my farms) scrollback. Partial index keeps it small —
-- only rows where farm_id IS NULL are indexed.
CREATE INDEX IF NOT EXISTS eden_chat_user_all_idx
  ON public.eden_chat_messages(user_id, created_at DESC)
  WHERE farm_id IS NULL;

-- Audit trail of Eden-initiated actions (analytics + debugging + future
-- training data). Partial index keeps it small.
CREATE INDEX IF NOT EXISTS eden_chat_log_actions_idx
  ON public.eden_chat_messages(user_id, log_target_farm_id, created_at DESC)
  WHERE log_action IS NOT NULL;

ALTER TABLE public.eden_chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT — users see their own messages always.
-- For per-farm messages (farm_id NOT NULL), other members of the same
-- farm can also see them. Useful for shared contexts (co-op admins, joint
-- ownership). Cross-farm messages (farm_id NULL) stay private to the user.
DROP POLICY IF EXISTS eden_chat_select ON public.eden_chat_messages;
CREATE POLICY eden_chat_select ON public.eden_chat_messages
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND farm_id IN (
        SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid()
      )
    )
  );

-- INSERT — users only insert their own messages. The frontend always
-- writes role='user' or role='assistant' under the auth user's id.
DROP POLICY IF EXISTS eden_chat_insert ON public.eden_chat_messages;
CREATE POLICY eden_chat_insert ON public.eden_chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- UPDATE — only the original sender can update (used for setting
-- log_confirmed when the user clicks Yes/No on a confirmation card).
DROP POLICY IF EXISTS eden_chat_update ON public.eden_chat_messages;
CREATE POLICY eden_chat_update ON public.eden_chat_messages
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE — only the original sender can delete (used for "Clear chat").
DROP POLICY IF EXISTS eden_chat_delete ON public.eden_chat_messages;
CREATE POLICY eden_chat_delete ON public.eden_chat_messages
  FOR DELETE USING (user_id = auth.uid());

-- Helpful comment for future maintainers.
COMMENT ON TABLE public.eden_chat_messages IS
  'Per-farm Eden AI chat history. farm_id=NULL means cross-farm mode (private to user). See docs/EDEN_PER_FARM_CHAT.md.';
