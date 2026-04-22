-- Track AI message usage per user for tier enforcement
CREATE TABLE IF NOT EXISTS public.ai_message_counts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_id     uuid REFERENCES public.farms(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_message_counts_user_created_idx ON public.ai_message_counts (user_id, created_at);

ALTER TABLE public.ai_message_counts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own counts
CREATE POLICY "users_see_own_counts" ON public.ai_message_counts
  FOR SELECT USING (auth.uid() = user_id);

-- Service role inserts (edge function uses service role)
CREATE POLICY "service_role_insert" ON public.ai_message_counts
  FOR INSERT WITH CHECK (true);

-- Auto-purge counts older than 35 days to keep table lean
-- (run via pg_cron or a scheduled job)
-- DELETE FROM ai_message_counts WHERE created_at < now() - interval '35 days';
