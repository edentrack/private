-- Phase G — WhatsApp messages audit log.
--
-- Persists inbound + outbound WhatsApp messages for the conversation
-- history. Used for debugging, support, and (later) feature discovery
-- (which questions do farmers ask most? what voice notes can't we
-- transcribe well?).
--
-- Free-form text only — voice notes are stored as their transcribed
-- text. The original audio lives on Meta's CDN (which expires) so we
-- don't keep it; if you need the raw audio for transcription debugging,
-- have the user send the same voice note again.

CREATE TABLE IF NOT EXISTS public.whatsapp_messages_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id         uuid NOT NULL REFERENCES public.farms(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  text            text NOT NULL,
  -- For inbound: Meta's wamid. For outbound: our generated id (optional).
  raw_message_id  text,
  -- For inbound voice notes, what Whisper detected
  transcribed_lang text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_log_farm_idx ON public.whatsapp_messages_log (farm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_log_user_idx ON public.whatsapp_messages_log (user_id, created_at DESC);

ALTER TABLE public.whatsapp_messages_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_log_select ON public.whatsapp_messages_log;
CREATE POLICY whatsapp_log_select ON public.whatsapp_messages_log
  FOR SELECT USING (
    farm_id IN (SELECT farm_id FROM public.farm_members WHERE user_id = auth.uid())
  );

-- Inserts come from the service role (the webhook function), so no INSERT
-- policy is needed for end users. Service role bypasses RLS.
