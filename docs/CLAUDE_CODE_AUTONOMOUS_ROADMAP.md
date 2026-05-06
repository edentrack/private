# Claude Code — Autonomous Roadmap (May 2026 onward)

This is a self-contained brief for Claude Code to execute over the next
8–12 weeks of work without per-PR human prompting. Each phase has clear
acceptance criteria, test plans, and stop conditions. Greg approves at
phase boundaries, not per-step.

**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch model:** one branch per phase, PR back to main, auto-deploy via Vercel.
**Authorization granted:** push branches/main, force Vercel deploys, deploy edge functions, apply Supabase migrations to staging then prod, install npm packages (flag if >100 KB).
**Authorization denied:** delete user data, modify auth/billing, disable RLS, change pricing, modify other Twilio/Meta accounts.

═══════════════════════════════════════════════════════════════
## OVERARCHING RULES
═══════════════════════════════════════════════════════════════

1. **Never raise the TS baseline.** Currently 367. Must stay ≤ baseline at every PR. Fix any new errors you introduce, before commit.
2. **Never skip the verification gate.** Every PR runs `npm run typecheck && npm test && npm run build` locally first; if any fail, fix before push.
3. **Always ping Greg with `Phase N shipped, bundle <hash>, test plan: ...`** when a phase is complete. Wait for Greg to verify (via Claude in Cowork) before marking the phase closed.
4. **Use the Cowork file mounts properly.** Code lives at `/Users/greatadigwe/Documents/edentrack`; bash sandbox at `/sessions/.../mnt/edentrack/`. Don't mix them.
5. **Multi-tenant safety is sacred.** Every new Supabase query MUST scope by `farm_id`. Every new table MUST have RLS policies matching `RLS_AUDIT.md` template. No exceptions.
6. **Small PRs.** Each phase below should produce 1–3 PRs, not one giant one. Easier to review, easier to revert.

═══════════════════════════════════════════════════════════════
## PHASE 1 — Per-farm chat frontend (in flight)
═══════════════════════════════════════════════════════════════

**Status:** Migration + edge function shipped. React frontend pending.

**Reference:** `docs/EDEN_PER_FARM_CHAT.md` (full design)
**Deliverable:** Eden chat history is per-farm; cross-tenant contamination bug is gone; "All my farms" mode lets users query/operate across all their farms.

**Implementation:** Follow the Step C prompt already prepared:
1. Create `src/hooks/useEdenChat.ts` — Supabase source of truth, localStorage cache.
2. Refactor `AIAssistantPage.tsx` to use the hook instead of in-memory state.
3. Add `EdenFarmSelector.tsx` dropdown next to Eden avatar.
4. Update confirmation card renderer to show target farm in cross-farm mode.
5. Update fetch call to pass `cross_farm` and `cross_farm_farm_ids`.

**Acceptance:**
- Switch tenants — chat history scoped to that tenant; no cross-farm leakage.
- Switch back — original tenant's history preserved.
- "All my farms" mode shows aggregated context; Eden asks before writing.
- localStorage wipe → on next load, history reloads from Supabase. No data lost.

**Test on prod after merge:**
- Riverside Fish: send a message about water quality. Switch to Greenfield Rabbitry. Confirm chat is empty. Send a rabbit message. Switch back to Riverside — fish message still there.
- "All my farms" mode: ask "compare my farms" — response references both. Ask "log feed" — Eden asks which farm. Specify "Riverside" — confirmation card shows 🐠 Riverside Fish Farm.

═══════════════════════════════════════════════════════════════
## PHASE 2 — Eden AI UI redesign (the "classy / fresh / exciting" ask)
═══════════════════════════════════════════════════════════════

**Why:** Greg's direct feedback — "I don't like the way the Eden AI is represented. There's just too much writing in between. I want it to look classy. I want it to look fresh. I want it to look exciting."

**Reference:** `docs/EDEN_AI_REDESIGN.md` (write this first as the design doc; then implement against it).

**Design principles to apply:**
1. **Less wall-of-text, more cards.** Long prose responses get auto-broken into visual cards: a "key finding" card at top with the headline answer, a "next steps" card with action items, a "data referenced" card with the farm numbers Eden cited. The user sees structure, not paragraphs.
2. **Voice-first surface.** A big mic button in the input bar — not a tiny icon. Tap-and-hold to record. Visual waveform while recording. This is the interaction farmers should default to.
3. **Eden has personality.** Avatar animates subtly while thinking. Loading states say things like "Checking your pond's water quality history..." not "..." Responses can include tasteful emoji/icons to break up text (✓ confirmed, ⚠️ alert, 📊 data, 🎯 action).
4. **Confirmation cards become the hero of the UI.** When Eden generates a `[LOG]` block, the card it produces is the most visually distinct element on the page — colored border, species emoji, big confirm/decline buttons, microcopy that makes the action feel safe.
5. **Suggestions chips at empty state are personalized, not generic.** Use farm context to surface chips like "Why is FCR up this week?" or "Help me plan next harvest" — not "Ask Eden a question."
6. **Mobile-first.** Designed for one-handed thumb use on a 5–6" Android. All tap targets ≥44px. Chat fills the viewport; nav collapses.
7. **Empty state has personality.** Not "Eden — your pond advisor." More like "Hey Greg, your tilapia look good today. What can I help with?" — generated from live data.
8. **Streaming.** Eden's responses stream token-by-token instead of appearing all at once. Feels alive.

**Implementation steps:**

1. Write `docs/EDEN_AI_REDESIGN.md` with mockups (ASCII or Figma links) and the design principles above. Get Greg's approval before coding.

2. Refactor `AIAssistantPage.tsx` into smaller components:
   - `EdenHeader.tsx` — avatar, farm selector (from Phase 1), monthly usage counter, clear chat
   - `EdenMessageList.tsx` — scrollable list, auto-scroll-to-bottom
   - `EdenMessage.tsx` — single message, parses Eden's response into structured cards if applicable
   - `EdenStructuredResponse.tsx` — renders Key Finding / Next Steps / Data cards
   - `EdenLogActionCard.tsx` — the confirmation card for `[LOG]` actions, redesigned
   - `EdenInput.tsx` — text input + mic button (tap-and-hold) + attach + suggestions chips
   - `EdenLoadingState.tsx` — animated avatar + contextual loading text
   - `EdenEmptyState.tsx` — personalized greeting + suggestion chips

3. Add response streaming:
   - Update `ai-chat` edge function to support streaming via Anthropic's stream API
   - Frontend uses `EventSource` or fetch streaming to render tokens as they arrive

4. Implement structured response parsing:
   - Eden's system prompt updated to optionally output structured JSON-in-response: `<eden:structured>{ "headline": "...", "next_steps": [...], "data": [...] }</eden:structured>`
   - Frontend parses; if present, renders cards. Otherwise renders prose.
   - Backward-compatible — old responses still render fine.

5. Voice input via Web Speech API or Whisper:
   - Tap-and-hold the mic button
   - On release, send to Whisper (use existing OpenAI key in env, or via Anthropic if they expose it)
   - Show transcribed text in input before sending — user can edit
   - Keyboard shortcut: hold spacebar to record

6. Streaming animation:
   - Avatar pulses while waiting
   - Show typing indicator (3-dot animation) before first token arrives
   - Tokens arrive one-by-one with a subtle fade-in

7. Mobile testing:
   - Slow 3G via Chrome DevTools throttling
   - Real Android phone (Greg does this; Claude Code can't)
   - Tap targets all ≥44px
   - Keyboard doesn't push content under input
   - Input stays focused when keyboard opens

**Acceptance:**
- Eden response with multiple sections renders as cards, not one wall of text
- Mic button is the most prominent input
- Streaming works (tokens appear progressively)
- Empty state references the user's actual farm by name
- Mobile UX is one-handed thumb-friendly
- Confirmation cards visually pop (clear distinction from advice)

**Test on prod after merge:**
- Send a complex question to Eden — response should have visual structure, not just paragraphs
- Hold mic button → say a query → release → text appears → send
- Refresh page on mobile → empty state mentions farm name + 3–4 personalized chips
- Trigger a `[LOG]` action → confirmation card stands out

═══════════════════════════════════════════════════════════════
## PHASE 3 — Mobile UX optimization
═══════════════════════════════════════════════════════════════

**Why:** Bundle is 463 KB main + 398 KB PDF chunk. African farmers on 3G need ≤200 KB initial JS. PDF chunk should never load until user opens the report feature.

**Steps:**

1. Run `npm run build` and analyze with `npx vite-bundle-visualizer`. Identify the 5 largest dependencies.

2. Lazy-load the PDF stack:
   - `jspdf`, `jspdf-autotable`, `html2canvas` — only load when user clicks "Generate Report"
   - Use dynamic `import()` on the report button click
   - Verify with bundle analyzer that PDF code is in a separate chunk

3. Lazy-load chart libraries (`recharts`, `Chart.js`):
   - Insights page only — split out into separate chunk
   - Loading state shows a thin skeleton while chart code loads

4. Compress all `/public/species/*.jpg` images:
   - Currently 86 KB layer.jpg. Should be ≤15 KB at the size used (40×40 thumbnail).
   - Run `imagemin` or use Squoosh CLI to optimize all 8 species images
   - Convert to WebP with JPG fallback

5. Lazy-load aquaculture/rabbit/poultry knowledge files:
   - Currently inlined in `knowledge-inline.ts` (sent on every Eden request)
   - Move to a per-species lookup table; only inline the active species' knowledge

6. Audit other heavyweight dependencies:
   - Framer Motion (52 KB) — use only where needed; replace with CSS where possible
   - Lucide React — tree-shake to only used icons (currently full library imported in some files)

7. Add a Lighthouse CI gate:
   - GitHub Action that runs Lighthouse on every PR
   - Score must be ≥85 mobile / ≥90 desktop on Performance
   - PR can't merge if score drops

**Acceptance:**
- Initial JS bundle ≤200 KB gzipped (currently 463 KB ungzipped)
- Time-to-interactive on Slow 3G ≤3.5s
- Lighthouse Performance ≥85 mobile
- All species images ≤15 KB

**Test on prod after merge:**
- Greg does the real-Android-on-3G walkthrough (Step 28 in the original master plan)
- Lighthouse scores in the deploy report

═══════════════════════════════════════════════════════════════
## PHASE 4 — TS error reduction + CI gate hardening
═══════════════════════════════════════════════════════════════

**Why:** Baseline crept from 358 to 367 over recent PRs. Real silent bugs in `pdfGenerator`, `predictiveAnalytics`, `weightAnalysis`, `reportGenerator`. Financial reports are the highest-risk path; type bugs there are unacceptable.

**Steps:**

1. Audit which files have the most errors:
   ```
   npm run typecheck 2>&1 | awk -F'(' '{print $1}' | sort | uniq -c | sort -rn | head
   ```
   Expect `pdfGenerator.ts`, `reportGenerator.ts`, `predictiveAnalytics.ts` at top.

2. Fix `pdfGenerator.ts` errors first (financial reports — riskiest):
   - All `Color | undefined` errors: import jsPDF types properly, use `[r, g, b]` tuples not `number[]`
   - All `spread argument` errors: type the args correctly
   - Aim: 0 TS errors in this file

3. Fix `reportGenerator.ts` errors next:
   - `prevExpensesTotal`/`prevRevenue` undefined-but-used errors: declare before use
   - `Property 'catch'` errors: chain with `.then().catch()` properly
   - Unused vars: remove

4. Fix `predictiveAnalytics.ts` errors:
   - Unused exports: remove or mark with underscore prefix
   - `simpleMovingAverage` declared but never used: remove

5. Fix `weightAnalysis.ts`:
   - `targetWeight`, `dailyGain` declared but never used: remove

6. After clearing those 4 files, run typecheck again. Expect baseline to drop from 367 to ~50.

7. Once baseline is ≤50, **lower the CI gate**:
   - Update `.github/workflows/ci.yml` "no-new-ts-errors" check to use the new lower number
   - Test by intentionally adding a TS error in a throwaway PR — CI should block.

8. Add a separate gate: "no critical-path TS errors":
   - Critical files: `expenses/`, `sales/`, `payroll/`, `pdfGenerator.ts`, `reportGenerator.ts`
   - This subset must always be 0 errors, no baseline tolerance

**Acceptance:**
- TS baseline ≤50
- Zero TS errors in critical financial files
- CI gate prevents regression

**No prod test needed** — this is internal hygiene. Verify via `npm run typecheck` showing the new baseline.

═══════════════════════════════════════════════════════════════
## PHASE 5 — Eden over WhatsApp (the killer feature)
═══════════════════════════════════════════════════════════════

**Status:** Twilio account creation + Meta Business Verification is on Greg's side, not Claude Code's. **DO NOT START THIS PHASE until Greg confirms:**
1. Twilio account is set up
2. EdenTrack number is purchased and active
3. Meta Business Verification is approved (3–7 days from submission)

**Greg's manual prep:**
- Open Twilio account
- Buy one number for EdenTrack ($1–3/month)
- Submit Meta Business Verification through Twilio's wizard
- Provide Claude Code with: Twilio account SID, auth token, the WhatsApp-enabled number

**Implementation steps (after the above is ready):**

1. Add Twilio inbound webhook:
   - New Supabase edge function: `twilio-inbound` at `supabase/functions/twilio-inbound/`
   - Receives Twilio webhook on inbound WhatsApp message
   - Verifies the request signature (Twilio's signature header — security critical)
   - Looks up the sender's phone number in `profiles.phone` to find user_id
   - Looks up that user's farm membership; default to first active farm
   - Calls existing `ai-chat` function with the message + farm context
   - Sends Eden's response back via Twilio's reply API

2. Phone-to-user lookup table:
   - Migration: add `whatsapp_phone` column to `profiles` (separate from billing phone)
   - Migration: add an `eden_whatsapp_user_lookup` materialized view OR helper RPC
   - User can register their WhatsApp number in Settings → Eden AI tab → "Connect WhatsApp"
   - Verification: send OTP via Twilio Verify, user enters code, link confirmed

3. Voice note inbound:
   - Twilio webhook delivers an `MediaUrl0` for audio attachments
   - Edge function downloads, sends to Whisper API for transcription
   - Transcribed text flows into `ai-chat` like a normal text message
   - Eden's response goes back as text by default; voice-out is a future feature

4. Outbound proactive Eden:
   - New cron job: `eden-proactive-nudges` running daily at 6am UTC (configurable per user)
   - Checks each farm: any logged activity in past 3 days?
   - If no: queue a WhatsApp template message asking "Hey, all OK at the farm?"
   - Templates approved with Meta during Phase 5 setup
   - User opt-in via Settings → Notifications → "Daily WhatsApp check-in"

5. Existing in-app cron alerts → WhatsApp delivery:
   - The pond-alerts-evaluator that fires every 15 min already writes notifications
   - For users who have linked WhatsApp, also send via Twilio
   - Critical alerts (DO < 2 mg/L, mortality spike) → send regardless of opt-in
   - Non-critical → only if opted-in

6. Settings UI:
   - New "Eden AI" tab in Settings (might already exist — extend it)
   - Show: linked WhatsApp number (or "Not linked"), opt-ins per alert type, monthly message count
   - "Test Eden on WhatsApp" button — sends a test template to your verified number

**Acceptance:**
- User links their WhatsApp; gets OTP; verifies; sees "✓ Connected"
- User texts the EdenTrack Twilio number from WhatsApp; Eden replies within 10s
- User sends a voice note; Eden transcribes + responds
- Critical alert (e.g., DO emergency) auto-fires WhatsApp message to opted-in users within 2 min
- Cost tracking shows per-user message counts; matches Twilio dashboard

**Test on prod after Phase 5 merges:**
- Greg's own WhatsApp links to his test number on each tenant
- Greg sends "log feed for pond 1, 1 bag" → Eden generates LOG card → Greg confirms via WhatsApp ("yes") → record saved
- Greg gets the daily morning template (if opted-in)

**Cost guardrails to enforce:**
- Hard rate limit: max 1 outbound WhatsApp per farmer per hour (no spam)
- Hard daily cap: $X/day total Twilio spend (Greg sets in Twilio dashboard)
- Alert if daily spend exceeds budget (auto-pause outbound, alert via email)

═══════════════════════════════════════════════════════════════
## PHASE 6 — Conversational onboarding
═══════════════════════════════════════════════════════════════

**Why:** Eden can now write data via the action layer. The right onboarding for a new farmer is a 5-minute conversation, not a 7-step wizard. Bypass forms entirely for users who prefer chat.

**Steps:**

1. Add a new flag in `profiles`: `prefers_conversational_onboarding boolean DEFAULT false`.

2. After signup, present a choice:
   - "Set up via guided form" (existing wizard)
   - "Set up via Eden chat" (new path) — Recommended badge

3. New onboarding edge function: `eden-onboarding` (or extend `ai-chat` with a flag):
   - System prompt forces Eden into onboarding mode
   - Eden asks structured questions: farm name, country, species, count of flocks/ponds/rabbitries, dates stocked, current count, any past mortality
   - Each answer triggers an action (`CREATE_FARM`, `LOG_STOCKING`, `LOG_MORTALITY` retroactively)
   - At end: user is dropped into dashboard with everything set up

4. Flow:
   ```
   Eden: "Hi, I'm Eden. What's your farm called?"
   User: "Greenfield Tilapia"
   → CREATE_FARM(name=Greenfield Tilapia, country=Cameroon, species=aquaculture)
   Eden: "Got it. How many ponds do you have right now?"
   User: "Just one — Pond 1"
   → CREATE_POND(name=Pond 1)
   Eden: "When did you stock Pond 1, and with what?"
   User: "Last month, 500 tilapia fingerlings, 5g each"
   → LOG_STOCKING(pond=Pond 1, count=500, species=tilapia, date=2026-04-06)
   Eden: "Anything died since stocking?"
   User: "Yeah maybe 3-4"
   → LOG_FISH_LOSS(pond=Pond 1, count=4, cause=unknown, date=today)
   Eden: "Perfect — Greenfield Tilapia is set up. Let me show you the dashboard."
   → Navigate to /dashboard
   ```

5. Acceptance:
   - New farmer can go from signup → working farm record in ≤5 minutes
   - Fewer support tickets about onboarding
   - Higher first-week activation (track via PostHog event)

**Test on prod:**
- Create a fresh test account, pick "Set up via Eden chat"
- Complete the conversational flow with a fictional fish farm
- Verify all records exist in DB
- Dashboard renders correctly with the new data

═══════════════════════════════════════════════════════════════
## PHASE 7 — Vet telehealth + cash-flow forecast (financial wedge)
═══════════════════════════════════════════════════════════════

**Why:** Two Tier 2 features that increase per-user value and unlock revenue. Both are smaller than they sound — Eden + the action layer + the credit-score PDF infrastructure already cover most of the foundation.

**Part A — Vet Telehealth:**

1. New `vet_directory` table: vet_id, name, specialty (poultry/aqua/rabbit/multi), country, phone, email, hourly_rate, currency, verified_at, photo_url
2. New `vet_consultations` table: id, farm_id, vet_id, scheduled_at, type (chat/video), status, payment_status, notes, fee, currency
3. New page: `/vets` — directory with filter by species, country, rating
4. Booking flow:
   - User picks vet → picks slot → pays via Flutterwave (existing integration)
   - Confirmation creates a calendar entry (Google Calendar via OAuth)
   - 1 hour before consultation: Eden sends WhatsApp reminder
5. After consultation: vet writes notes; user can ask Eden to "what did the vet say about X" and Eden looks up the consultation notes
6. Revenue: 15–20% commission on each consultation; Flutterwave splits payment

**Part B — Cash-flow forecast:**

1. New util: `src/utils/cashFlowForecast.ts`
2. Inputs:
   - Active flocks/ponds/rabbitries with stocking dates + species + count
   - Historical expense data (feed cost per week, labour, etc.)
   - Historical sales / harvest revenue
   - Default cycle lengths per species
3. Outputs (next 12 weeks):
   - Projected expenses per week (feed, vaccines, labour)
   - Projected revenue per week (egg sales, harvest)
   - Net cash position week-by-week
   - Flag weeks with negative cash
   - "You'll need ₦X feed money in week 8" actionable insights
4. New page: `/cash-flow` — line chart + table + Eden-generated commentary
5. Eden integration: "ask Eden what's my cash flow next month" → Eden invokes the forecast util and explains

**Acceptance:**
- 5 verified vets in directory at launch (Greg's relationships)
- First booking goes through end-to-end (pay → consult → notes saved)
- Cash flow forecast ships with 12-week projection on the Insights page
- Forecast accuracy validated against historical data (within ±20%)

═══════════════════════════════════════════════════════════════
## PHASE 8 — Small bug cleanup from prior verifications
═══════════════════════════════════════════════════════════════

These are accumulated small fixes from prior audit rounds. Bundle into one cleanup PR.

1. **InsightsPage rabbit tenant: "DEATHS: 0 birds"** — label was fixed but inline unit text "birds" still hardcoded. Find the metric value renderer for `mortality.count` and either drop the unit (label already says DEATHS) or pipe it through `farmSpecies.animalTermPlural`.

2. **Survival rate doesn't update for restocks** — currently uses `(initial_count - mortality) / initial_count`. After a `LOG_STOCKING` event, should use `(initial_count + sum_of_stockings - mortality) / (initial_count + sum_of_stockings)`. Fix in FlockManagement.tsx and Insights metric calc.

3. **Riverside pond named "Catfish" but stocking species "Tilapia"** — data inconsistency on the existing test pond. Either rename the pond or update the species field. (Greg's call; default to renaming pond to "Pond 1 — Tilapia".)

4. **FlockSwitcher surrounding labels** — "Filter by flock" and "All flocks combined" still hardcoded. Grep + replace via `useFarmSpecies()`.

5. **Inventory feed visibility regression** — the 3 default seeded items disappeared on Greenfield Rabbitry after PR #8 fix #3 heuristic. Either restore visibility (remove the visibility filter) or improve empty state copy with species-aware feed suggestions.

6. **Activity ring tooltip on score** — small UX polish; the ring shows "22% INACTIVE" with no clear path to raise the score. Add a click → modal showing what counts toward the score and what's missing.

7. **Audit log UI surface** — `eden_chat_messages.log_action` rows are an audit trail. Surface them in `/audit` page so users + investors see Eden's actions.

**Acceptance:** all 7 small bugs verified fixed via the standard verification gate.

═══════════════════════════════════════════════════════════════
## PHASE BOUNDARIES — pings to Greg
═══════════════════════════════════════════════════════════════

After each phase merges and deploys, ping Greg in Cowork chat with this format:

```
Phase N shipped. Bundle index-XXXXXXXX.js. Deploy URL: <vercel-url>.

Test plan for Greg + Claude (Cowork):
1. <specific action user takes>
2. <specific action user takes>
3. <specific action user takes>

Known follow-ups for next phase: <list>
```

Wait for Greg's "verified, ship next" before starting the next phase. If verification fails, fix in a follow-up PR before moving on.

═══════════════════════════════════════════════════════════════
## REALISTIC TIMING
═══════════════════════════════════════════════════════════════

Assuming Claude Code in agent mode, ~6 hours/day of focused work:

| Phase | Estimate | Blocking |
|---|---|---|
| 1 — Per-farm chat frontend | 1–2 days | None (in flight) |
| 2 — Eden AI UI redesign | 5–7 days | Phase 1 |
| 3 — Mobile UX optimization | 3–4 days | Phase 2 |
| 4 — TS error reduction | 2–3 days | Independent |
| 5 — WhatsApp/Eden | 4–6 days | Greg's Twilio + Meta setup (3–10 days lead time) |
| 6 — Conversational onboarding | 3–4 days | Phase 1 + Phase 5 |
| 7 — Vet + Cash-flow | 5–7 days each | Independent |
| 8 — Small bugs | 1–2 days | None |

**Total elapsed:** 8–12 weeks from May 6, 2026 to feature-complete on this roadmap. Adjusts based on Greg's Twilio/Meta unblock time.

═══════════════════════════════════════════════════════════════
## STOP CONDITIONS
═══════════════════════════════════════════════════════════════

Pause and report to Greg if any of the following:
- Build fails locally and fix is non-obvious
- Migration fails on staging Supabase
- Vercel deploy fails repeatedly
- Test fails that you can't trace to a recent change
- A new TS error appears in a file you're not actively editing
- Any RLS policy needs to be relaxed (defer to Greg)
- Any pricing/billing/auth-related code needs changing
- WhatsApp template gets rejected by Meta
- Twilio account gets suspended

Don't guess. Don't paper over. Report and wait.

═══════════════════════════════════════════════════════════════
## WHAT IS NOT ON THIS ROADMAP
═══════════════════════════════════════════════════════════════

Explicit non-goals for this 8–12 week window:

1. **No new species.** Cattle, goats, sheep, bees come later — only after 60-day retention on existing species hits 50%.
2. **No cohort benchmarks.** Defer until you have 5,000+ farms producing clean data.
3. **No outbreak heat-map.** Defer until clean disease taxonomy + epidemiologist review.
4. **No SOC 2 audit.** Just the prep checklist (in Phase 7 or as a side task).
5. **No marketplace.** Phase G of the original master plan; defer.

If a feature request comes in that fits one of these categories, log it in `docs/BACKLOG.md` for later — don't insert into this roadmap mid-flight.
