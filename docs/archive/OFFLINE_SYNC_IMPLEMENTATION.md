# EdenTrack Offline-First Write Reliability Implementation

## Overview

This document describes the offline-first write reliability system for EdenTrack, enabling rural Cameroonian farm workers with unreliable mobile internet to log data that auto-syncs when connection is restored.

## Architecture

### Queue System (Existing + Enhanced)

**Location:** `src/lib/offlineDB.ts`, `src/lib/offlineSync.ts`

- **Database:** Dexie (IndexedDB wrapper) - already in use
- **Queue Tables:**
  - `pendingCreates` - new rows to insert
  - `pendingUpdates` - rows to update (includes field updates)
  - `pendingDeletes` - rows to delete
- **Auto-sync:** Listens to `window.ononline` event and retries failed operations
- **Max retries:** 5 attempts per operation
- **Retry interval:** 5 seconds between retries, 30 seconds for periodic checks

### Network Error Detection

**Location:** `src/lib/offlineSync.ts` (new `isNetworkError()` function)

Detects network errors by checking:
1. `navigator.onLine` status
2. Error message patterns (network, timeout, connection, etc.)
3. HTTP status codes (0, 4xx, 5xx)

### Write Path Integration

**Location:** `src/hooks/useOfflineWrite.ts` (new hook)

Provides a standardized interface for wrapping Supabase writes:

```typescript
const { tryWrite, isNetworkError } = useOfflineWrite();

// On network error, automatically queue the write
const { error: insertError } = await supabase
  .from('table')
  .insert(payload);

if (insertError) {
  if (isNetworkError(insertError)) {
    await tryWrite('table', 'insert', payload);
  } else {
    throw insertError;
  }
}
```

## Wired Write Paths

### 1. Mortality Logs
**File:** `src/components/mortality/LogMortalityModal.tsx`
**Function:** `handleSubmit()`
**Queued Table:** `mortality_logs`
**Operations:** INSERT

When a farm worker goes offline and logs mortality:
- The insert attempt fails with network error
- System detects network error via `isNetworkError()`
- Payload is queued using `tryWrite('mortality_logs', 'insert', mortalityPayload)`
- UI shows success (optimistic) with "pending sync" indicator
- On reconnect, queue auto-flushes in FIFO order

### 2. Feed Usage Recording
**File:** `src/components/dashboard/InventoryUsageWidget.tsx`
**Function:** `recordUsage()`
**Queued Tables:** 
  - `inventory_usage` (INSERT) - tracks usage record
  - `feed_inventory` (UPDATE) - decrements stock
**Operations:** INSERT + UPDATE

When recording feed consumed:
- Both `inventory_usage` insert and `feed_inventory` update are wrapped
- Network errors queue both operations
- Stock decrements are idempotent (same update payload if retried)
- Water tracking (no inventory) has no stock update, only usage record

### 3. Egg Collection
**File:** `src/components/dashboard/QuickEggCollectionWidget.tsx`
**Function:** `handleSubmit()`
**Queued Tables:**
  - `egg_collections` (INSERT) - records collection event
  - `egg_inventory` (INSERT or UPDATE) - updates total inventory
**Operations:** INSERT + INSERT/UPDATE

Handles both new collection records and inventory updates. If egg_inventory doesn't exist, creates it; otherwise updates existing record.

### 4. Task Completion
**File:** `src/components/tasks/CompleteTaskModal.tsx`
**Function:** `handleSubmit()`
**Queued Table:** `tasks`
**Operations:** UPDATE

When marking a task as complete:
- Task status, completion time, and notes are queued on network error
- Optional inventory effects (decrease/increase) handled separately
- Photo uploads still fail offline (storage limitation)

### 5. Inline Quick-Log Writes (New)
**File:** `src/components/dashboard/TodayTasksWidget.tsx`
**Functions:** 
  - `handleQuickLogMortality()` - mortality quick-log
  - `handleQuickLogFeed()` - feed quick-log
  - `handleQuickLogEgg()` - egg quick-log
**Queued Tables:** `mortality_logs`, `inventory_usage`, `egg_collections`
**Operations:** INSERT

These are new quick-entry forms embedded in the Tasks widget. When offline:
- Mortality count queued to `mortality_logs`
- Feed quantity queued to `inventory_usage`
- Egg count queued to `egg_collections`
- Task is marked complete optimistically
- Queue flushes on reconnect

### 6. Weight Records
**Status:** NOT YET IMPLEMENTED

Weight entry component not found in codebase. When implemented, follow the pattern:

```typescript
const { tryWrite, isNetworkError } = useOfflineWrite();

// After attempt fails with network error:
if (isNetworkError(error)) {
  await tryWrite('weight_logs', 'insert', { 
    flock_id, farm_id, average_weight, recorded_date, recorded_by 
  });
}
```

## UI Indicator

**Location:** `src/components/common/OfflineIndicator.tsx`

### When Offline
- **Top banner:** Amber bar with "Offline Mode - Data will sync when connection is restored"
- **Bottom indicator (desktop):** Detailed offline status card

### When Syncing
- **Pending count:** Shows "X pending item(s)" in blue card with manual sync button
- **Auto-sync:** Automatic on connection restoration + periodic checks every 30 seconds
- **Sync result:** Green success card showing count synced, or amber warning if failures

### Indicators Shown
```
Offline: WifiOff icon + banner
Pending: "3 pending items" + blue card
Syncing: Spinning RefreshCw icon
Success: "3 items synced successfully" + CheckCircle
Failed: "2 synced, 1 failed" + AlertCircle
```

The indicator is always updated by:
1. `getPendingOperationsCount()` - counts queued operations
2. `offline-sync-complete` event - fired when sync finishes
3. `online`/`offline` events - network status changes

## Idempotency & Deduplication

### Client-Generated UUIDs
**Location:** `src/lib/offlineDB.ts` - `generatePendingId()`

Each queued operation gets a unique ID:
```typescript
export function generatePendingId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
```

### Preventing Duplicates
1. **INSERT operations:** Use server-generated UUIDs for the actual data (not shown)
2. **UPDATE operations:** Idempotent by design (same update applied multiple times = same result)
3. **Retry logic:** Up to 5 retries; if it fails after that, it's moved to the error bucket

### Caching Strategy
Local cache tables (in offlineDB) store synced data:
- `cachedFlocks`, `cachedMortality`, `cachedInventoryUsage`, `cachedEggCollections`, `cachedWeightLogs`, etc.
- Updated after successful sync
- Provides read access to synced data even if server doesn't return full results

## Error Handling

### Network Errors (Queued)
- Device is offline
- Failed to fetch (connectivity loss mid-request)
- Timeout
- HTTP 4xx/5xx errors from server

### Non-Network Errors (Thrown)
- Validation errors (e.g., count > flock size)
- Authorization errors
- Schema validation failures
- Malformed data

### Max Retries Behavior
After 5 retries:
- Operation is moved to a "failed" bucket (currently deleted from queue)
- User sees "X failed" in the sync indicator
- Manual sync button allows retry of failed operations

## Known Limitations

### 1. Foreign Key Constraints
If two operations reference each other (e.g., egg collection → inventory update), retrying out of order may fail:
```
Scenario: Offline, create flock + log mortality for that flock
Problem: Mortality references flock_id that doesn't exist yet if mortality syncs first
Solution: Log mortality first (it will queue), then flock will sync on reconnect
```

**Mitigation:** FIFO queue order ensures dependent operations sync in correct sequence.

### 2. Photo Uploads
Photo uploads in `CompleteTaskModal` still fail offline because Supabase Storage doesn't queue. Workaround: skip photos offline, add later.

### 3. Conflicting Offline Edits
If two devices edit the same row offline, last-write-wins applies on sync (no conflict resolution):
```
Device A: offline, updates task status to "completed"
Device B: offline, updates same task with notes
Result: One overwrites the other on sync
```

**Mitigation:** Not an issue for single-user farm workers; larger teams should implement conflict resolution.

### 4. No Partial Rollback
If operation 1/3 succeeds but 2/3 fails, there's no rollback:
```
1. Insert mortality_log ✓
2. Update flock count (fails) ✗
3. Insert activity_log ✓
Result: Partial data synced, inconsistent state
```

**Mitigation:** Each write path should be self-contained. Use transactions on server if needed.

### 5. Deleted Items During Offline Window
If a record is deleted server-side while offline, the offline update will fail on sync:
```
Device A: offline, updates flock status
Device B: deletes flock
Device A: reconnects, tries to update deleted flock → fails
```

**Impact:** Low for farm workers (unlikely to delete while others work offline)

## Testing Checklist

- [ ] **Offline Mortality:** Log mortality offline → see "pending" indicator → reconnect → syncs
- [ ] **Offline Feed:** Record feed usage offline → indicator shows pending → reconnect → syncs
- [ ] **Offline Eggs:** Collect eggs offline → pending → reconnect → syncs
- [ ] **Offline Tasks:** Mark task complete offline → pending → reconnect → syncs
- [ ] **Offline Quick-Log:** Use quick-log forms offline → pending → reconnect → syncs
- [ ] **No Duplicates:** Refresh page while offline → queue persists → reconnect → no duplicates
- [ ] **Retry Logic:** Turn off network, attempt write, retry count increments, reconnect → syncs
- [ ] **Manual Sync:** Click "Sync" button while pending → manual sync triggers
- [ ] **Network Error Detection:** Test with various network conditions (offline, timeout, 500 error)
- [ ] **Optimistic UI:** Offline write shows success immediately (before actual sync)
- [ ] **Failed Operations:** After 5 retries, operation shows "failed" in UI

## Future Improvements

1. **Failed Bucket UI:** Show list of permanently failed syncs with option to retry or delete
2. **Conflict Resolution:** Implement merge strategy for conflicting offline edits
3. **Resumable Uploads:** Queue photo uploads separately, resume on reconnect
4. **Transactional Queuing:** Group related operations so all succeed/fail together
5. **Sync History:** Show detailed sync logs (what synced, when, errors)
6. **Data Expiration:** Delete old successful syncs from local cache after N days
7. **Bandwidth Awareness:** Defer sync on metered connections, batch larger payloads

## Code References

- **Queue Management:** `src/lib/offlineSync.ts` - `queueCreate()`, `queueUpdate()`, `queueDelete()`, `syncPendingOperations()`
- **Hook Interface:** `src/hooks/useOfflineWrite.ts` - `useOfflineWrite()`, `tryOfflineWrite()`
- **Network Detection:** `src/lib/offlineSync.ts` - `isNetworkError()`
- **UI Indicator:** `src/components/common/OfflineIndicator.tsx`
- **Database Schema:** `src/lib/offlineDB.ts` - `OfflineDB` class and table definitions
- **Write Paths:** All component files listed in "Wired Write Paths" section above
