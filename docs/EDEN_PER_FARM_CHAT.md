# Eden — Per-Farm Chat History

## What this is

A persistence + scoping layer for Eden AI conversations. Each chat message is tagged with the `farm_id` it belongs to. When a user switches tenants, Eden loads that farm's history and ignores everything else. A new "All my farms" mode lets the user query/operate across all their farms in one conversation.

## Why we built this

Live verification on May 6 2026 caught a critical bug: switching from the rabbit tenant (Greenfield Rabbitry) to the poultry tenant (Sunrise Layers) without clearing chat caused Eden to use the rabbit conversation as ground truth on the poultry farm — Eden asked for a "rabbitry name" and referenced doe/buck IDs (R-01, R-02) on the poultry farm. The chat history was bleeding across tenants.

This document specifies the fix.

## Architecture decisions

(All five decisions confirmed with Greg on May 6 2026.)

1. **Storage:** Supabase is source of truth. `localStorage` caches recent messages per-farm for read-speed. On every send, write to Supabase first; on read, prefer cache then refresh from Supabase. localStorage wipe never loses data because Supabase is authoritative.

2. **Cross-farm mode shape:** A dropdown next to the Eden avatar in the AI Assistant header. Options are each farm the user belongs to, plus "All my farms". Selecting "All my farms" enters cross-farm mode for that conversation thread.

3. **Cross-farm mode capabilities:**
   - **Reads everywhere.** Eden can compare metrics, answer "which farm is most profitable?", surface trends across the user's portfolio.
   - **Writes require disambiguation.** Eden must always ask "which farm should I log this to?" before generating a `[LOG]` block in cross-farm mode. The action confirmation card prominently displays the target farm name.

4. **Action card in cross-farm mode:** Same component as today, but shows the destination farm header at top with the species emoji. Confirm button reads "Save to {Farm Name}" not just "Save".

5. **Existing chat history:** Dropped on first deploy. Acceptable loss — chat is lightly used currently, not worth a backfill.

## Schema

```sql
CREATE TABLE eden_chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- farm_id NULL when the message was sent in "All my farms" cross-farm mode.
  -- Cross-farm messages are visible only to that user, scoped via user_id.
  farm_id         uuid REFERENCES farms(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         text NOT NULL,
  -- Optional payloads:
  attachments     jsonb,                       -- [{url, mediaType}], for image inputs
  log_action      jsonb,                       -- the LOG block JSON if Eden proposed an action
  log_confirmed   boolean,                     -- NULL = no log, true = saved, false = declined
  -- In cross-farm mode, Eden's action might target a different farm than the
  -- conversation context. Captured here so the confirmation card and audit trail
  -- show the right destination.
  log_target_farm_id uuid REFERENCES farms(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Per-farm scrollback (most common query)
CREATE INDEX eden_chat_user_farm_idx
  ON eden_chat_messages(user_id, farm_id, created_at DESC);

-- Cross-farm mode scrollback (farm_id IS NULL)
CREATE INDEX eden_chat_user_all_idx
  ON eden_chat_messages(user_id, created_at DESC)
  WHERE farm_id IS NULL;

-- Audit trail for actions Eden took (analytics, debugging, future fine-tuning)
CREATE INDEX eden_chat_log_actions_idx
  ON eden_chat_messages(user_id, log_target_farm_id, created_at DESC)
  WHERE log_action IS NOT NULL;

ALTER TABLE eden_chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can read their own messages. Cross-farm messages (farm_id IS NULL)
-- are scoped to the user only. Per-farm messages are visible to other farm
-- members too — useful for shared contexts like co-op admins.
CREATE POLICY eden_chat_select ON eden_chat_messages
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      farm_id IS NOT NULL
      AND farm_id IN (SELECT farm_id FROM farm_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY eden_chat_insert ON eden_chat_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY eden_chat_update ON eden_chat_messages
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY eden_chat_delete ON eden_chat_messages
  FOR DELETE USING (user_id = auth.uid());
```

## Read patterns

**Single-farm mode** (most common):

```sql
SELECT * FROM eden_chat_messages
WHERE user_id = $auth.uid()
  AND farm_id = $current_farm_id
ORDER BY created_at DESC
LIMIT 50;
```

Then reverse for chronological display. 50 messages ≈ 25 turns; rarely will a user want more in-view at once. Older history is queryable via "Load more".

**All-farms mode:**

```sql
SELECT * FROM eden_chat_messages
WHERE user_id = $auth.uid()
  AND farm_id IS NULL          -- only messages sent IN cross-farm mode
ORDER BY created_at DESC
LIMIT 50;
```

This intentionally excludes per-farm messages. Cross-farm mode is its own thread, distinct from each farm's per-farm thread.

## Write patterns

Every send writes two rows: the user's message and Eden's reply.

```typescript
// User message
await supabase.from('eden_chat_messages').insert({
  user_id: user.id,
  farm_id: mode === 'cross-farm' ? null : currentFarm.id,
  role: 'user',
  content: userMessage,
  attachments: attachments,
});

// Eden's response (after edge function returns)
await supabase.from('eden_chat_messages').insert({
  user_id: user.id,
  farm_id: mode === 'cross-farm' ? null : currentFarm.id,
  role: 'assistant',
  content: edenReply.text,
  log_action: edenReply.logAction || null,
  log_target_farm_id: edenReply.logAction
    ? (mode === 'cross-farm' ? logAction.target_farm_id : currentFarm.id)
    : null,
});

// On user confirming/declining a LOG action, UPDATE the assistant row:
await supabase.from('eden_chat_messages')
  .update({ log_confirmed: true })
  .eq('id', assistantMessageId);
```

## localStorage cache

Key per scope:
- `eden_chat:user_{userId}:farm_{farmId}` for per-farm
- `eden_chat:user_{userId}:all` for cross-farm

Value: serialized last 50 messages. Updated on every successful Supabase write.

On mount:
1. Read from cache instantly (renders in <50ms).
2. In background, query Supabase for latest 50.
3. If Supabase has newer rows than cache, replace cache and re-render.

If Supabase fetch fails, the cache is still good. If cache is missing/corrupt, render an empty state and rely on Supabase fetch to populate.

## Edge function changes

The `ai-chat` edge function currently accepts a single `farm_id`. We extend it:

```typescript
interface ChatRequest {
  // Single-farm mode: pass the current farm_id (existing behavior, preserved).
  farm_id?: string;
  // Cross-farm mode: pass an array of all farms the user belongs to.
  // When cross_farm is true, farm_id should be null; cross_farm_farm_ids
  // should contain the user's farm IDs.
  cross_farm?: boolean;
  cross_farm_farm_ids?: string[];
  messages: ChatMessage[];
  // ... existing fields
}
```

When `cross_farm === true`:
1. `getFarmContext` is called once per `cross_farm_farm_ids` and the contexts are concatenated under per-farm headers.
2. To keep total context bounded, each farm's context is capped to recent 7 days (vs all-time for single-farm) plus farm-level summary.
3. The system prompt gets an additional section telling Eden:
   - It is operating across multiple farms.
   - Reads can span all farms ("compare", "which farm has the highest FCR").
   - Writes (`[LOG]` blocks) MUST disambiguate by including a `target_farm_id` field referring to one of the user's farms by name OR id. Eden must ask which farm if not clear.
   - The action card the user sees will show the target farm name; Eden's conversational reply should also mention the destination ("I'll log this to your fish farm — confirm below").

## Migration of existing chats

Drop. The current chat is in-memory React state — there's nothing in Supabase to migrate. On first deploy after this lands, all existing conversations are lost. Acceptable per Greg's call.

## Testing matrix

| Scenario | Expected |
|---|---|
| Send message on Fish farm; switch to Rabbit farm | Rabbit chat is empty (or shows only rabbit messages). Fish messages NOT visible. |
| Send message on Rabbit farm; switch back to Fish farm | Fish messages preserved. Rabbit messages NOT visible. |
| Switch to "All my farms"; ask "compare my farms" | Eden responds with cross-farm comparison. Reads context from all farms. |
| In "All my farms", ask "log feed for pond 1" | Eden asks "Which farm? You have Riverside Fish Farm and Greenfield Rabbitry." Does NOT generate a LOG block. |
| In "All my farms", clarify "Riverside" | Eden generates LOG block with `target_farm_id` = Riverside's id. Confirmation card shows "Save to Riverside Fish Farm". |
| Clear localStorage, refresh app | Chat history reloads from Supabase. No data loss. |
| Send message offline | Optimistic write to localStorage; Supabase write retried when online. (V2 — not in this PR.) |
| Switch back to single-farm mode after cross-farm conversation | Single-farm thread is its own thread; cross-farm thread preserved separately. |

## What's explicitly NOT in this PR

- Offline support / write queue. Optimistic-only for now; if Supabase write fails, surface a retry button.
- Cross-farm context fetching at full all-time depth. Capped at 7 days per farm to keep token usage tractable.
- Chat search ("find that thing Eden told me about FCR last week"). Future feature, not scoped here.
- Export chat to PDF/CSV. Future.
- Eden suggestion chips for cross-farm mode (e.g., "Compare profit across farms"). Future.

## Rollout plan

1. Apply migration to staging Supabase, verify schema.
2. Deploy edge function with new request shape (backward-compatible — old `farm_id`-only requests still work).
3. Deploy frontend with new chat persistence + farm selector.
4. Apply migration to production Supabase.
5. Verify across 3 tenants: contamination is gone, cross-farm mode works, no regressions.
6. Watch Supabase logs for 24 hours for any RLS errors or schema mismatches.

## Implementation order

- **Step A** (this doc + migration): Greg's lead.
- **Step B** (edge function): Greg's lead — small, surgical edits to existing function.
- **Step C** (React frontend): delegate to Claude Code — large refactor across 3-4 files, lots of state plumbing.
- **Step D** (verification on prod): Greg via Chrome MCP across all 3 tenants.
