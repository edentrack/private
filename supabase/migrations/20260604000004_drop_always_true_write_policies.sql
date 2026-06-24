/*
  Security fix — drop always-true client write policies.

  The linter flagged 5 rls_policy_always_true findings. All are
  INSERT/UPDATE policies scoped to the PUBLIC role with
  `WITH CHECK (true)` — meaning any authenticated (or anon) client
  could write arbitrary rows:

    referrals          — service_insert_referrals     (INSERT, public, true)
    referrals          — service_update_referrals     (UPDATE, public, true)
    daily_report_sends — Service role can insert ...   (INSERT, public, true)
    daily_report_sends — Service role can update ...   (UPDATE, public, true)
    ai_message_counts  — service_role_insert           (INSERT, public, true)

  The policy NAMES say "service role", but they were scoped to PUBLIC,
  not service_role — so the intent (server-only writes) was not
  enforced. Concretely:
    - referrals: a user could insert referrals with referrer_id = self
      to forge referral activity (reward-gaming risk).
    - ai_message_counts: a user could insert rows for ANOTHER user's
      id, exhausting that victim's AI message quota (griefing).
    - daily_report_sends: a user could forge report-send records.

  Verified in code: clients NEVER write these tables directly.
    - referrals          → read-only in ReferralSection.tsx
    - ai_message_counts  → written only by ai-chat edge function,
                           which uses the SERVICE ROLE key
    - daily_report_sends → written only by report cron (service role)

  Because the service role bypasses RLS entirely, dropping these
  public write policies does NOT break any server write path — it
  only removes the unintended client-side write access.

  The SELECT policies (users_see_own_counts, users_see_own_referrals,
  "Farm owners can view their report sends") are correct and stay.
*/

DROP POLICY IF EXISTS "service_insert_referrals"               ON public.referrals;
DROP POLICY IF EXISTS "service_update_referrals"               ON public.referrals;
DROP POLICY IF EXISTS "Service role can insert report sends"   ON public.daily_report_sends;
DROP POLICY IF EXISTS "Service role can update report sends"   ON public.daily_report_sends;
DROP POLICY IF EXISTS "service_role_insert"                    ON public.ai_message_counts;
