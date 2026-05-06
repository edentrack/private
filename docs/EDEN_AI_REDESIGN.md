# Eden AI — UI Redesign

## What this is

A design proposal for the Eden AI surface that shifts it from "another wall-of-text chat box" to a classy, fresh, mobile-first AI coach. The core question is *not* "how do we make it look prettier" — it's "how do we get a Lagos broiler farmer on a 5" Android, holding their phone in one hand at 5am while feeding birds, to actually use Eden every day".

## Why we're doing this

Greg's direct feedback (May 2026): *"I don't like the way the Eden AI is represented. There's just too much writing in between. I want it to look classy. I want it to look fresh. I want it to look exciting."*

That's the brief. This document specifies how we get there. **Greg approves this doc before any code is written.**

## Design principles

### 1. Less wall-of-text, more cards
Long prose responses get auto-broken into visual cards:
- A **key finding** card at the top with the headline answer ("Your FCR climbed from 1.6 to 1.9 this week — that's 18% above last week")
- A **next steps** card with action items as a numbered list
- A **data referenced** card with the farm numbers Eden cited

The user sees structure, not paragraphs.

### 2. Voice-first surface
A **big mic button** in the input bar — not a tiny icon. Tap-and-hold to record. Visual waveform while recording. This is the interaction farmers should default to. Voice typing reduces the friction of logging on the field by 10×.

### 3. Eden has personality
- Avatar animates subtly while thinking (eyes blink, slight bob)
- Loading states say things like *"Checking your pond's water quality history…"* not just `…`
- Responses can include tasteful emoji/icons to break up text: ✓ confirmed · ⚠️ alert · 📊 data · 🎯 action

### 4. Confirmation cards become the hero of the UI
When Eden generates a `[LOG]` block, the card it produces is **the most visually distinct element on the page** — colored border, species emoji, big confirm/decline buttons, microcopy that makes the action feel safe ("This will save 12 deaths to Pond 2 — you can undo within 24h.").

### 5. Suggestion chips at empty state are personalized, not generic
Use farm context to surface chips like:
- *"Why is FCR up this week?"*
- *"Help me plan next harvest"*
- *"What should I do about the high mortality this week?"*

…not *"Ask Eden a question."*

### 6. Mobile-first
Designed for one-handed thumb use on a 5–6" Android. All tap targets ≥44px. Chat fills the viewport; nav collapses. Keyboard handling: input stays focused, content doesn't slide under it.

### 7. Empty state has personality
Not *"Eden — your pond advisor."* More like:

> *Hey Greg, your tilapia look good today. Pond 1 is on day 87 of 150 and your water quality has been stable all week. What can I help with?*

…generated from live data on each page load.

### 8. Streaming
Eden's responses **stream token-by-token** instead of appearing all at once. Feels alive. Backed by Anthropic's stream API; the `ai-chat` edge function pipes via SSE.

## Mockup (ASCII for now; Figma later)

### Header (single-farm mode)

```
┌──────────────────────────────────────────────────────┐
│ ╭─╮  Eden                  [🐠 Riverside Fish ▾] [⋯] │
│ ╰─╯  Your pond advisor                              │
└──────────────────────────────────────────────────────┘
```

The species emoji + farm name dropdown (from Phase 1) sits to the right of the title.

### Empty state

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                       ╭──────╮                       │
│                       │  EDEN │  (animated avatar)   │
│                       ╰──────╯                       │
│                                                      │
│      Hey Greg, your tilapia look good today.        │
│      Pond 1 is on day 87 of 150 and your water       │
│      quality has been stable all week.              │
│      What can I help with?                          │
│                                                      │
│  ┌───────────────────────────┐                      │
│  │ 📊 Why is FCR up this week?│                      │
│  └───────────────────────────┘                      │
│  ┌───────────────────────────┐                      │
│  │ 🎯 Plan my next harvest   │                      │
│  └───────────────────────────┘                      │
│  ┌───────────────────────────┐                      │
│  │ ⚠️ High mortality alert?  │                      │
│  └───────────────────────────┘                      │
│                                                      │
│  ╔═══════════════════════════════════════════════╗  │
│  ║ [🎤]  Ask Eden anything…                  📎 ➤ ║  │
│  ╚═══════════════════════════════════════════════╝  │
└──────────────────────────────────────────────────────┘
```

The mic button is the most prominent input element. Tap-and-hold to record.

### Structured response

```
┌──────────────────────────────────────────────────────┐
│ User: Why is my mortality higher this week?          │
│                                                      │
│ ╭─╮ Eden                                             │
│ ╰─╯                                                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🎯 KEY FINDING                                │   │
│  │ Mortality jumped from 0.5% to 1.8% this week.│   │
│  │ The cause looks like ammonia stress.         │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ ✓ NEXT STEPS                                  │   │
│  │ 1. Test ammonia today (target: < 0.5 mg/L)   │   │
│  │ 2. Increase aeration to 16h/day              │   │
│  │ 3. Skip feeding tomorrow morning             │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📊 DATA REFERENCED                            │   │
│  │ • 12 deaths in Pond 2 (May 1-5)              │   │
│  │ • Last water test: 8 days ago (May 1)        │   │
│  │ • Feed: 8 bags this week (was 7)             │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### `[LOG]` confirmation card (the hero element)

```
┌──────────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════════╗   │
│  ║ 🐠 Save to Riverside Fish Farm              ║   │
│  ║ ┌────────────────────────────────────────┐  ║   │
│  ║ │ LOG 12 deaths in Pond 2                │  ║   │
│  ║ │ Cause: ammonia stress                  │  ║   │
│  ║ │ Date: 6 May 2026                       │  ║   │
│  ║ └────────────────────────────────────────┘  ║   │
│  ║                                              ║   │
│  ║       ╭──────────╮     ╭──────────╮         ║   │
│  ║       │ ✓ Confirm│     │ ✗ Cancel │         ║   │
│  ║       ╰──────────╯     ╰──────────╯         ║   │
│  ║                                              ║   │
│  ║  Undo available for 24 hours.                ║   │
│  ╚══════════════════════════════════════════════╝   │
└──────────────────────────────────────────────────────┘
```

Distinct color (emerald-50 fill + emerald-300 border for fish farms; amber- for poultry, pink- for rabbits). Big confirm button. Microcopy reassures.

### Streaming animation

While Eden is typing, the avatar pulses + a 3-dot indicator appears:

```
╭─╮ Eden
╰─╯ ● ● ●  Checking your pond's water quality history…
```

Then tokens fade in one-by-one as they arrive.

## Component decomposition

The current `AIAssistantPage.tsx` is ~2100 lines. Breaking it down:

| File | Responsibility |
|---|---|
| `EdenHeader.tsx` | Avatar, farm selector (Phase 1), monthly usage counter, clear chat |
| `EdenMessageList.tsx` | Scrollable list, auto-scroll-to-bottom |
| `EdenMessage.tsx` | Single message; if assistant + structured response → renders cards via EdenStructuredResponse |
| `EdenStructuredResponse.tsx` | Renders Key Finding / Next Steps / Data cards |
| `EdenLogActionCard.tsx` | The redesigned `[LOG]` confirmation card |
| `EdenInput.tsx` | Text input + big mic button + attach + suggestion chips |
| `EdenLoadingState.tsx` | Animated avatar + contextual loading text |
| `EdenEmptyState.tsx` | Personalized greeting + suggestion chips from live farm data |

The existing `AIAssistantPage.tsx` becomes ~300 lines of orchestration: state plumbing, the `useEdenChat` hook from Phase 1, the request flow.

## Streaming protocol

### Edge function changes

`supabase/functions/ai-chat/index.ts` learns to stream:

```typescript
// New optional flag in request
interface ChatRequest {
  // ... existing fields
  stream?: boolean;
}

// When stream=true, the function returns an SSE stream:
//   event: token   data: { delta: "Mortality" }
//   event: token   data: { delta: " jumped" }
//   ...
//   event: log     data: { logAction: { type: "LOG_MORTALITY", ... } }
//   event: done    data: { msgsUsed, msgsCap, tier }
```

Anthropic's SDK supports streaming natively (`messages.stream()`). The function pipes their tokens directly to the client.

### Frontend handling

`fetch('/api/ai-chat', { ..., body: JSON.stringify({ stream: true, ... }) })` → consume `response.body` via `ReadableStream`. As tokens arrive, update the in-flight assistant message's `.content` so React re-renders progressively.

When `event: log` arrives, set the message's `logAction`. When `event: done` arrives, persist the full message via `useEdenChat.appendAssistantMessage`.

This is backward-compatible — old clients (`stream` not passed or false) get the existing single-shot JSON response.

## Structured-response parsing

Eden's system prompt grows a new optional block:

```
When your response is best represented as cards, append at the end:
<eden:structured>
{ "headline": "...", "next_steps": [ "..." ], "data": [ "..." ] }
</eden:structured>
```

The frontend parses for that block:
- Present? → Strip from displayed text + render `EdenStructuredResponse` cards
- Absent? → Plain markdown render (today's behavior)

This keeps the change backward-compatible. Old responses still render fine; gradually Eden's prompt is tuned to emit structured blocks for analytical questions.

## Voice input

### Implementation plan

1. **Web Speech API first** (fast path, no API cost). On supported browsers, `navigator.mediaDevices.getUserMedia({ audio: true })` + `webkitSpeechRecognition` → text in real-time.
2. **Whisper fallback** for browsers without speech recognition (older Android Chrome, in-app browsers). On press, record audio (`MediaRecorder`), send to OpenAI Whisper via the existing `transcribe-audio` edge function (already shipped in PR #13), get text back.

### UI flow

- User taps + holds the big mic button
- Avatar pulses red; "Listening…" indicator appears
- On release, transcribed text appears in the input field — user can edit before sending
- Long-press auto-submits at 30s mark (safety net)

### Keyboard shortcut

Spacebar held = record. Common UX pattern from Slack / Loom that power users will discover.

## Streaming + structured response interaction

When streaming is on, the structured block can only be detected at the end (it's appended to the response). So the rendering is:

- Tokens stream in as plain text in real-time
- When `event: done` arrives + we detect the `<eden:structured>` block, we re-render the message: hide the streamed text, show the cards instead
- The "flip" feels smooth (~50ms) — like the message just snapped into shape

This is the exact same UX as ChatGPT's structured outputs (charts, code blocks, etc.).

## Mobile UX checklist

| Concern | Solution |
|---|---|
| Tap targets too small for thumb | All ≥44×44px (iOS HIG / Material guideline) |
| Keyboard pushes content under input | `visualViewport` listener → scroll input into view |
| Input loses focus on send | Re-focus input after response arrives |
| Long messages create horizontal scroll | `overflow-wrap: break-word` on all message bodies |
| Heavy bundle on slow 3G | Code-split per-component (lazy-load EdenLogActionCard etc. — only load when needed) |
| Hard to read at arm's length | Base font size 16px (prevents iOS zoom on input focus) |

## What this redesign does NOT change

- The action layer. `[LOG]` blocks, `executeLogAction`, etc. all stay as-is. The card UI changes, but the behavior is unchanged.
- The edge function's contract for `farm_id` / `messages` / `cross_farm` (Phase 1).
- The persistence layer (`useEdenChat`).
- Pricing or rate limits.
- The system prompt's *content* (it grows a new optional structured-output instruction, but the existing personality, action types, etc. are preserved).

## Implementation order

1. **Doc approval** (this doc → Greg signs off)
2. **Component decomposition** — refactor `AIAssistantPage.tsx` into the 8 sub-components, no behavior change
3. **Empty-state personalization** — surface farm name + first 3 chips
4. **`EdenLogActionCard` redesign** — colored border, species emoji, big buttons
5. **Mic button + voice input** — Web Speech first, Whisper fallback
6. **Streaming** — edge function + frontend (the largest single piece of work)
7. **Structured response parsing** — system prompt update + EdenStructuredResponse component
8. **Mobile QA** — Greg tests on real Android, file fixes

Each step is its own PR. Total estimate: 5–7 days of focused work.

## Acceptance criteria

- Eden response with multiple sections renders as cards, not one wall of text
- Mic button is the most prominent input element
- Streaming works (tokens appear progressively, no perceptible "wait → drop")
- Empty state references the user's actual farm by name + 3–4 personalized chips from live data
- Mobile UX is one-handed thumb-friendly (Greg's manual test on Android)
- Confirmation cards visually pop (clear distinction from advice — colored border, big buttons)
- TS baseline does not increase
- 74/74 tests pass
- Bundle stays at or below the size we hit after Phase 3

## Open questions — RESOLVED (May 6, 2026)

These are no longer open. Implementation can proceed. Decisions locked in `docs/BRIEF_PHASE_2_EDEN_UI.md`.

1. **Card styling** → **Slim accent stripe + white background.** Cleaner on mobile; reads at arm's length; doesn't fight the existing app's neutral palette.
2. **Voice TTS reply** → **Optional, default OFF.** Noisy farm environments + variable language quality. Users opt in via Settings → Eden AI.
3. **Suggestion chip generation** → **Haiku-personalized, 24h cache per (user, farm).** Cost amortizes to ~1 call/farm/day = ~$10/month at 1,000 farms. Worth it — chips are the empty-state hook.
4. **Streaming fallback on slow connections** → **Silent retry as non-streaming once → if that also fails, manual "Tap to retry" button.** One auto-retry covers transient drops; a button covers persistent failures without making Eden look broken.
5. **Avatar animation budget** → **Subtle — pure CSS transitions, no Lottie/JSON.** Keeps bundle small, runs on every Android the app supports.
