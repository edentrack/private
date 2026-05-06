# Brief — Phase 2: Eden AI UI redesign (implementation)

**Pairs with:** `docs/EDEN_AI_REDESIGN.md` (the design doc — read it first).
**Status:** design doc approved with the 5 open questions answered (below). Ready for implementation.
**Owner:** Claude Code.
**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch model:** one PR per implementation step, in the order listed below.

---

## The 5 open questions are now answered

These were left open at the bottom of `EDEN_AI_REDESIGN.md`. Locking them in here so implementation can proceed.

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Card styling | **Slim accent stripe + white background** | Cleaner on mobile; reads at arm's length; doesn't fight the existing app's neutral palette |
| 2 | Voice TTS reply | **Optional, default OFF** | Noisy farm environments + variable language quality. Users who want it can flip it in Settings → Eden AI |
| 3 | Suggestion chip generation | **Haiku-personalized, 24h cache per (user, farm)** | Cost is ~$0.0003 per page load uncached; cache amortizes to ~1 call/farm/day. Worth it — chips are the empty-state hook |
| 4 | Streaming fallback on slow connections | **Silent retry as non-streaming once → if that also fails, manual "Tap to retry" button** | One auto-retry covers transient network drops; a button covers persistent failures without making Eden look broken |
| 5 | Avatar animation budget | **Subtle — pure CSS transitions, no Lottie/JSON** | Keeps bundle small, runs on every Android the app has to support |

These decisions go INTO `EDEN_AI_REDESIGN.md` as resolved (close out the "Open questions for Greg" section) before implementation begins.

---

## Implementation order (one PR each)

### PR #EDEN-1 — Component decomposition (no behavior change)

Split `AIAssistantPage.tsx` (currently ~2,100 lines) into the 8 sub-components specified in the design doc. Pure refactor — every existing test must still pass with no changes.

Files to create:
- `src/components/ai/EdenHeader.tsx`
- `src/components/ai/EdenMessageList.tsx`
- `src/components/ai/EdenMessage.tsx`
- `src/components/ai/EdenStructuredResponse.tsx`
- `src/components/ai/EdenLogActionCard.tsx` *(extract from existing renderConfirmationCard)*
- `src/components/ai/EdenInput.tsx`
- `src/components/ai/EdenLoadingState.tsx`
- `src/components/ai/EdenEmptyState.tsx`

`AIAssistantPage.tsx` shrinks to ~300 lines — orchestration only.

**Acceptance:** all 74 tests pass, no UI pixel diff (use Greg's manual eyeball on prod), TS baseline does not increase.

### PR #EDEN-2 — Empty state personalization

Implement the personalized greeting + Haiku-generated suggestion chips.

- New edge function: `supabase/functions/eden-suggest-chips/index.ts` — takes `{user_id, farm_id, species}` → calls Haiku with last 7 days of farm data → returns `{ chips: string[], greeting: string }`. Cache for 24h in `eden_chip_cache` table (new migration).
- Frontend: `EdenEmptyState.tsx` calls the function on mount; while loading shows the existing static chips; on success swaps in personalized.
- New migration: `eden_chip_cache(user_id, farm_id, payload jsonb, generated_at timestamptz, expires_at timestamptz)` with RLS.

Cost note: ~1 Haiku call per (user × farm) per day. At 1,000 active farms = ~$0.30/day = ~$10/month. Acceptable.

**Acceptance:** empty state references the user's farm by name and shows 3 chips that mention real flock/pond/hutch names from their data. Cache hit on second load (< 50ms response).

### PR #EDEN-3 — `EdenLogActionCard` redesign (the hero element)

Replace the existing confirmation card with the design-doc spec:
- Slim accent stripe on the left edge (color by species: amber for poultry, blue for fish, pink for rabbits)
- Species emoji in the header next to the farm name
- Big "Save to {farm name}" button (≥48px tall, full-width on mobile)
- "Cancel" as a secondary text-button below — not a sibling
- "Undo for 24h" microcopy below the buttons in 12px gray
- The action target (e.g. "12 deaths in Pond 2") in a neutral gray pill above the buttons

The `confirmLog` function's behavior does NOT change — this is purely the visual swap.

**Acceptance:** card visually pops from the surrounding chat (Greg's eyeball). Mobile hit-target ≥44px. Reads correctly in en + fr.

### PR #EDEN-4 — Voice input via Web Speech API + Whisper fallback

- Big mic button replaces the small icon in `EdenInput.tsx`
- Tap-and-hold to record (mouse + touch); release to stop
- Visual: avatar pulses red while recording, "Listening…" text appears
- On supported browsers: `webkitSpeechRecognition` → text appears in input field
- On unsupported (older Android Chrome, in-app browsers): `MediaRecorder` → POST to existing `transcribe-audio` edge function (already shipped)
- Spacebar held = record (keyboard shortcut for power users)
- Long-press auto-submits at 30s mark

**Acceptance:** Greg records "log feed for pond 1, two bags" → transcribed text appears → editable → sends. Works on iOS Safari, Android Chrome, and his desktop Chrome.

### PR #EDEN-5 — Response streaming (largest single piece)

The implementation work spans:
- `supabase/functions/ai-chat/index.ts` — add `stream?: boolean` to request schema. When true, return SSE response with events `token`, `log`, `done` per the design doc.
- `useEdenChat` hook — new method `sendMessageStreaming(content)` that returns an async iterator over tokens.
- `EdenMessage.tsx` — handles partial content (re-renders as tokens arrive).
- Fallback: if `EventSource` errors, retry once as non-streaming. If THAT fails, surface a "Tap to retry" button.

**Important:** the current non-streaming path is preserved exactly. `stream=true` is opt-in; the frontend default flips to true only after this PR ships.

**Acceptance:** tokens visibly arrive progressively (no perceptible "wait → drop"). On a throttled Slow-3G connection, the first token appears in <1s. SSE drop is silently retried; second drop shows the manual button.

### PR #EDEN-6 — Structured response cards

System prompt update: append optional `<eden:structured>{ "headline": "...", "next_steps": [...], "data": [...] }</eden:structured>` block guidance. Eden uses this for analytical questions (FCR analysis, mortality root-cause, weekly review) but not chat-style answers.

Frontend:
- `EdenMessage.tsx` parses the message text for the structured block
- If present: strip from displayed text, render via `EdenStructuredResponse.tsx`
- If absent: today's plain-markdown render

`EdenStructuredResponse.tsx` renders three card types per the design doc:
- 🎯 Key finding (slim accent stripe, ~2-line headline)
- ✓ Next steps (slim accent stripe, numbered list)
- 📊 Data referenced (slim accent stripe, bullet list of farm numbers Eden cited)

**Acceptance:** ask Eden "why is my mortality higher this week" — response renders as 3 cards, not a paragraph. Ask "what's the weather" — renders as plain text (Eden chose not to use structured output). Backward-compatible — old messages still render.

### PR #EDEN-7 — Mobile UX pass

This is the cleanup PR after all the above. Test on real Android (Greg) + iOS Safari + desktop. Fix anything that doesn't feel right at 375px width. Ship the polish that emerges from real-device testing.

Specific items to verify:
- All tap targets ≥44px
- Keyboard does not push input under the fold (visualViewport listener)
- Send doesn't lose input focus
- Long messages wrap (no horizontal scroll)
- Mic button reachable with thumb on a 6.1" screen held in right hand
- Suggestion chips wrap properly (don't overflow)

**Acceptance:** Greg can use Eden one-handed on his Android while doing morning feed.

---

## Cross-cutting requirements (apply to every PR)

- TS baseline does not increase (currently 277, dropping per Brief #3)
- All 74 tests pass before commit
- Bundle size delta logged in PR description (`npm run build` output)
- Per-tenant verification on prod after merge (Sunrise Layers / Riverside Fish / Greenfield Rabbitry)
- en + fr translations for all new copy

## Stop conditions

- Streaming PR (#EDEN-5) breaks non-streaming fallback → ship without streaming as default, get the streaming working in a follow-up
- Voice input doesn't work on iOS Safari → ship Whisper-only fallback, no Web Speech API on iOS
- Structured cards regress message rendering for any old conversation → roll back PR #EDEN-6 immediately

## Definition of done

- All 7 PRs merged
- Eden page is the most premium-feeling surface in the app (Greg's eyeball)
- Greg can use Eden one-handed on Android with voice input
- Streaming works on his connection
- A long analytical question renders as cards, not a wall of text
- TS baseline did not creep up
- Bundle gain ≤ 50 KB across the whole phase

After this brief: Phase 2 in the master roadmap is closed.
