# Brief — Phase 6: Conversational onboarding

**Supersedes:** the Phase 6 section in `CLAUDE_CODE_AUTONOMOUS_ROADMAP.md` (which is a sketch, not a spec).
**Status:** ready to start. No external blockers. **This is the highest-leverage UX work in the roadmap** — every other improvement amplifies if a new farmer can self-onboard, and every improvement is wasted if they can't.
**Owner:** Claude Code.
**Working directory:** `/Users/greatadigwe/Documents/edentrack`
**Branch model:** five sequential PRs (#ONBO-A through #ONBO-E).

---

## Why this matters more than anything else in the roadmap

A new farmer who lands on EdenTrack for the first time today sees a multi-step setup wizard with form fields and dropdowns and "what species do you raise" radio buttons. The default behavior of someone who is not Greg is to bounce.

We have already built Eden as an operator. Eden can now write data. The right onboarding experience for a non-developer farmer in Cameroon, Lagos, Nairobi, or Dhaka is **a five-minute conversation in their native language that ends with their farm fully set up and a couple of weeks of historical data already imported**. Not a wizard. Not a form. A conversation.

This brief specifies that conversation, end to end.

## What success looks like

**The 90-second test:** a farmer who has never seen the app before, on a 5" Android, with limited literacy and intermittent connectivity, can go from "tap the signup link" to "stocked first flock + logged first event" in under 90 seconds with no help from anyone.

The current setup wizard fails this test. The new conversational flow must pass it.

---

## Architecture

### Two paths from signup

After auth completes (signup OR first login of a fresh account), the user lands on a choice screen:

```
┌─────────────────────────────────────────────────┐
│                                                 │
│        Welcome to EdenTrack 🌾                 │
│                                                 │
│   How would you like to set up your farm?      │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  💬  Chat with Eden  [Recommended]       │  │
│  │  Tell me about your farm in your own     │  │
│  │  words. I'll set everything up. 5 min.   │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │  📋  Fill out a form                     │  │
│  │  Step-by-step setup wizard. 7 steps.     │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  Either way, you can switch later.             │
└─────────────────────────────────────────────────┘
```

- "Chat with Eden" → conversational onboarding (this brief)
- "Fill out a form" → existing wizard (unchanged)

### Backend: extend `ai-chat`, don't fork it

A new edge function would mean two system prompts to maintain, two sets of action handlers, two RLS surfaces. Bad. Instead:

- `ai-chat` learns a new optional request flag: `onboarding_mode?: boolean`
- When `onboarding_mode === true`, the system prompt swaps to the onboarding-specialized prompt (below)
- The action handlers are extended with 4 new types: `CREATE_FARM`, `CREATE_FLOCK`, `CREATE_POND`, `CREATE_RABBITRY` (these don't exist today)
- All existing log actions still work — Eden can mix `CREATE_FARM` then `LOG_STOCKING` then `LOG_MORTALITY` in the same session
- After the conversation completes (Eden detects "we're done" via a new `[ONBOARDING_COMPLETE]` block), the frontend navigates to /dashboard and the user lands in a fully-set-up tenant

### State: where do we know the user is mid-onboarding?

New column on `profiles`: `onboarding_status text NOT NULL DEFAULT 'not_started'`. Values:
- `not_started` — fresh signup, hasn't picked a path
- `chose_chat` — picked Eden chat path
- `chose_form` — picked form wizard path
- `completed` — finished either path

The frontend reads this on app load:
- `not_started` → show choice screen
- `chose_chat` → go straight to onboarding chat (resume mid-conversation if applicable)
- `chose_form` → go to existing wizard
- `completed` → go to dashboard (today's behavior for everyone)

If a user has zero farms and `onboarding_status = 'completed'` (data anomaly), show a "Your farm setup wasn't finished — restart?" banner with both choice buttons.

---

## PR #ONBO-A — Schema + new action types in ai-chat

### Migration

`supabase/migrations/<date>_onboarding_mode.sql`:

```sql
-- Track onboarding state per user
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'chose_chat', 'chose_form', 'completed'));

-- Backfill: existing users who have at least one farm = 'completed'
UPDATE public.profiles p
SET onboarding_status = 'completed'
FROM (
  SELECT DISTINCT user_id FROM public.farm_members
) m
WHERE p.id = m.user_id;
```

### New action types in ai-chat system prompt

Add a new section after "DATA LOGGING" called "ONBOARDING ACTIONS (only when onboarding_mode is true)":

```
create_farm: { type: "CREATE_FARM", name: string, country: string, species: "poultry"|"aquaculture"|"rabbits", currency_code?: string, location?: string }

create_flock: { type: "CREATE_FLOCK", farm_name: string, name: string, breed?: string, count: number, stocked_date: "YYYY-MM-DD", current_phase?: "chick"|"grower"|"layer"|"broiler" }

create_pond: { type: "CREATE_POND", farm_name: string, name: string, area_sqm?: number, depth_m?: number, water_source?: string }

create_rabbitry: { type: "CREATE_RABBITRY", farm_name: string, name: string, capacity?: number }

onboarding_complete: { type: "ONBOARDING_COMPLETE" }
```

### Action handlers (frontend)

Extend `executeLogAction` in `AIAssistantPage.tsx` with the 4 new CREATE handlers. Each does the corresponding Supabase insert with proper farm_id scoping (CREATE_FARM also adds the user as owner in farm_members).

`ONBOARDING_COMPLETE` is a special signal — frontend sets `profiles.onboarding_status = 'completed'` and navigates to /dashboard.

### Acceptance for #ONBO-A

- Migration applied cleanly to staging
- Existing users have `onboarding_status = 'completed'`
- ai-chat with `onboarding_mode: true` generates valid CREATE_FARM blocks
- Frontend can execute all 4 new action types and the result rows appear in the right tables with RLS

---

## PR #ONBO-B — The choice screen

### New page

`src/pages/onboarding/ChoiceScreen.tsx`:
- Renders the mockup above
- Two big tappable cards
- Tap → write `chose_chat` or `chose_form` to profile, navigate to the corresponding flow
- Mobile-first; full-viewport on phone, centered card on desktop
- Bilingual (en + fr)

### Routing

In `App.tsx`, the route guard:
```ts
const onboardingState = profile?.onboarding_status;

if (onboardingState === 'not_started') {
  return <ChoiceScreen />;
}
if (onboardingState === 'chose_chat') {
  return <OnboardingChat />;  // PR #ONBO-C
}
if (onboardingState === 'chose_form') {
  return <ExistingWizard />;
}
// completed → existing app
```

### Acceptance for #ONBO-B

- Fresh signup lands on choice screen, not the dashboard
- Tap "Chat with Eden" → state = `chose_chat`, route = onboarding chat
- Tap "Fill out a form" → state = `chose_form`, route = existing wizard
- Existing users (state = `completed`) never see the choice screen
- Reload mid-flow returns to the same screen (state persisted)

---

## PR #ONBO-C — The conversational flow

### New page

`src/pages/onboarding/OnboardingChat.tsx`:

Reuses `useEdenChat` hook with a `mode: 'onboarding'` flag. Layout is full-viewport (no nav, no header), looks like a friendly chat window. Eden's avatar bigger and centered at first.

### The conversation

The system prompt locks Eden into this flow:

```
You are Eden, EdenTrack's AI farm assistant. You are onboarding a NEW farmer who has just signed up. Your job is to set up their farm in a friendly 5-minute conversation.

Critical rules:
1. ALWAYS speak in the user's preferred language (detect from their first message; default English)
2. Ask ONE question at a time — never bunch multiple questions
3. Use plain conversational language. NEVER use technical terms like "stocking event" or "production cycle"
4. Generate a CREATE_* or LOG_* action block immediately after each user response, so the data accumulates as the conversation goes
5. Stay short. 1–2 sentences per response. This is a phone conversation, not an email
6. After the user has: created a farm, added at least one flock/pond/hutch, and logged at least one event (stocking, mortality, eggs, water test), say "We're all set!" and emit [ONBOARDING_COMPLETE]
7. If the user says "skip" or "I just want the form", emit [SWITCH_TO_FORM] and the frontend will hand them to the wizard

The conversation flow:

Step 1 — Greet + farm name
You: "Hey! I'm Eden. I'll get your farm set up in a few questions. First — what's your farm called?"
Wait for response. Then emit CREATE_FARM with name=their answer, country=detected from IP/profile, species=ask next.

Step 2 — Species
You: "Got it, [farm name]. What do you raise — chickens, fish, or rabbits?"
Wait. Update the CREATE_FARM with species (or emit a second CREATE_FARM if you already saved one).

Step 3 — First flock/pond/hutch
You: "Nice. Tell me about your first [flock/pond/hutch]. What's it called and how many [birds/fish/rabbits] do you have?"
Wait. Emit CREATE_FLOCK / CREATE_POND / CREATE_RABBITRY.

Step 4 — Stocking date
You: "When did you start with these [animals]? Today, last week, or earlier?"
Wait. Emit LOG_STOCKING with the date they gave.

Step 5 — Recent activity
You: "Has anything happened since then — any deaths, eggs collected, feed given?"
If yes → ask follow-ups, emit appropriate LOG_* blocks.
If no → skip to Step 6.

Step 6 — Wrap up
You: "Perfect. [Farm name] is set up. Want me to show you around the dashboard?"
Emit [ONBOARDING_COMPLETE].
Frontend navigates to /dashboard with a "Your farm is ready!" toast.
```

### Frontend behavior

- Each Eden message renders normally (with the existing chat UI)
- CREATE_* / LOG_* blocks render as small "✓ Saved" pills inline in Eden's response (NOT the full confirmation card — onboarding mode uses Auto-confirm, since each step is part of a continuous flow)
- A "Skip — go to form" button is always visible at the top of the screen
- A progress dots indicator at the top: ⚪ ⚪ ⚪ ⚪ ⚪ ⚪ — fills in as steps complete
- On `[ONBOARDING_COMPLETE]`: write `profiles.onboarding_status = 'completed'`, set the farm just created as the active tenant, navigate to /dashboard, show a green "🎉 Welcome to EdenTrack!" toast

### Auto-confirm vs Strict mode

In normal Eden chat we use Strict mode (user clicks Save on every action). In onboarding mode we use **Auto-confirm with a 5-second undo button** — actions execute immediately, but each appears with a "Undo" button in the chat for 5 seconds. This keeps the conversation moving while still respecting user agency.

If the user clicks Undo, the action is reversed AND Eden is told (via a system message in the next turn) "the user undid the previous action — re-ask the question differently."

### Conversation persistence

The conversation persists like any Eden chat — same `eden_chat_messages` table, scoped to the new farm. After onboarding completes, the user can scroll back through the conversation any time.

### Acceptance for #ONBO-C

- Cold-start farmer can complete the full conversation in under 90 seconds
- All 4 CREATE_* + 1 LOG_* actions execute successfully
- A new farm row exists in `farms` with the user as owner in `farm_members`
- A new flock/pond/hutch row exists in the right table
- A LOG_STOCKING (or whichever LOG was generated) appears in the right log table
- The conversation transcript is preserved in `eden_chat_messages`
- The user lands on /dashboard with a populated dashboard, not an empty state

---

## PR #ONBO-D — Skip-to-form fallback

A user might start the conversation, get frustrated, and want to switch to the form. They click "Skip — go to form" at the top.

Behavior:
- The partial chat conversation is preserved (don't delete it)
- `profiles.onboarding_status = 'chose_form'`
- Navigate to existing wizard
- The wizard is **pre-filled** with whatever data was already captured in the chat (e.g. if the user said their farm name and species in chat before bailing, those fields are pre-populated in the form)
- A small banner at the top of the wizard: "Picking up from where we left off. You can change anything below."

This means the form wizard needs to read from the same backing tables — which it already does. The pre-fill is just "load the most recent chat-created farm if any."

### Acceptance for #ONBO-D

- Mid-chat skip preserves any data already captured
- Wizard shows the captured data pre-filled
- Completing the wizard updates the same farm record (no duplicate)
- `onboarding_status` ends as `completed`

---

## PR #ONBO-E — Translations + analytics

### Translations

All onboarding copy goes into `src/i18n/en.json` and `src/i18n/fr.json` under a new `onboarding` namespace:

```json
{
  "onboarding": {
    "choice": {
      "welcome": "Welcome to EdenTrack",
      "question": "How would you like to set up your farm?",
      "chat_label": "Chat with Eden",
      "chat_recommended": "Recommended",
      "chat_description": "Tell me about your farm in your own words. I'll set everything up. 5 min.",
      "form_label": "Fill out a form",
      "form_description": "Step-by-step setup wizard. 7 steps.",
      "switch_note": "Either way, you can switch later."
    },
    "chat": {
      "skip_button": "Skip — go to form",
      "complete_toast": "🎉 Welcome to EdenTrack!"
    }
  }
}
```

The Eden onboarding system prompt itself is bilingual — it instructs Eden to detect the user's language and respond in it. No translation file needed for the conversation content.

### Analytics

PostHog events to add (or whatever analytics is currently wired up):
- `onboarding_choice_shown`
- `onboarding_chat_started`
- `onboarding_form_started`
- `onboarding_chat_completed`
- `onboarding_form_completed`
- `onboarding_chat_to_form_switched`
- `onboarding_first_action_executed` (the moment the user has any data in their farm)

These let us measure the 90-second goal: median `first_action_executed` time for chat-path users should be ≤90s.

### Acceptance for #ONBO-E

- Switching app language to French shows the choice screen in French
- Eden conducts the onboarding in French if the user's first reply is in French
- Analytics events fire and appear in the dashboard
- Median onboarding time (analytics) is tracked

---

## Cross-cutting requirements

- TS baseline does not increase
- All 74 tests pass
- Bundle size delta logged per PR
- Mobile-first — every onboarding screen designed for 375px viewport first, scaled up for desktop
- Eden's tone in onboarding is warmer than in normal chat (the user is brand new and may be nervous)
- Auto-confirm in onboarding mode uses Strict mode's underlying logic — the only difference is the UI flow, not the safety semantics

## Stop conditions

- The conversation flow gets confused if the user is too brief or too verbose → tighten the system prompt; add few-shot examples in the prompt
- LOG_STOCKING for a brand-new flock errors because the flock_id isn't known yet → CREATE_FLOCK must complete + return the new id BEFORE LOG_STOCKING is dispatched. Sequence the actions in the frontend executor.
- A user creates a farm but bails before any flock — they end up on /dashboard with empty state. Acceptable; the dashboard's empty-state CTAs already handle this.

## Definition of done

- Cold-start farmer (Greg's family member who has never used the app) goes from signup → working farm + first event in under 90 seconds, on a real Android, with no help
- Both paths (chat + form) end at the same `completed` state
- Switching mid-flow is lossless
- Translations work
- Analytics fire

After this brief: Phase 6 in the master roadmap is closed.

---

## Why this is the most important brief in the roadmap

If a new farmer can't self-onboard in 90 seconds, every other improvement we make is wasted. The most beautifully redesigned Eden UI doesn't matter if nobody gets there. The fastest mobile experience doesn't matter if the first screen scares the user away. The best WhatsApp integration doesn't matter if the user gives up before linking their number.

This is the gating problem. Until this is solved, EdenTrack is a product for people who already understand farming software. After this is solved, it's a product for actual smallholder farmers.
