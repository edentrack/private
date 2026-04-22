import { supabase } from './supabaseClient';
import { offlineDB, generatePendingId, PendingCreate, PendingUpdate, PendingDelete, DeadLetterOp } from './offlineDB';

/**
 * True network errors: no connection, or gateway-level server failures.
 * 4xx errors (401, 403, 422, etc.) are NOT network errors — the server
 * deliberately rejected the request. Retrying them wastes time and data.
 */
export function isNetworkError(error: any): boolean {
  if (!navigator.onLine) return true;

  const msg = (error?.message || error?.error_description || '').toLowerCase();
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network request failed') ||
    msg.includes('networkerror')
  ) return true;

  const code = Number(error?.code || error?.status || 0);
  // Only gateway/server-down codes — NOT 4xx client errors
  return code === 0 || code === 502 || code === 503 || code === 504;
}

const MAX_RETRIES = 5;

async function moveToDeadLetter(
  op: PendingCreate | PendingUpdate | PendingDelete,
  operation: DeadLetterOp['operation'],
  error: any
): Promise<void> {
  const entry: DeadLetterOp = {
    id: generatePendingId(),
    operation,
    table: op.table,
    recordId: 'recordId' in op ? op.recordId : undefined,
    data: 'data' in op ? op.data : undefined,
    errorCode: error?.code || error?.status || 0,
    errorMessage: error?.message || String(error),
    failedAt: Date.now(),
    retries: op.retries,
  };
  await offlineDB.deadLetter.add(entry);
}

export async function queueCreate(table: string, data: any): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingCreates.add({ id, table, data, timestamp: Date.now(), retries: 0 });
  return id;
}

export async function queueUpdate(table: string, recordId: string, data: any): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingUpdates.add({ id, table, recordId, data, timestamp: Date.now(), retries: 0 });
  return id;
}

export async function queueDelete(table: string, recordId: string): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingDeletes.add({ id, table, recordId, timestamp: Date.now(), retries: 0 });
  return id;
}

export async function syncPendingOperations(): Promise<{
  success: number;
  failed: number;
  deadLettered: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  let deadLettered = 0;

  if (!navigator.onLine) {
    return { success: 0, failed: 0, deadLettered: 0, errors: ['Device is offline'] };
  }

  // --- Creates ---
  const pendingCreates = await offlineDB.pendingCreates.toArray();
  for (const operation of pendingCreates) {
    try {
      const { data, error } = await supabase
        .from(operation.table)
        .insert(operation.data)
        .select()
        .single();

      if (error) throw error;

      await offlineDB.pendingCreates.delete(operation.id);
      success++;
      await updateLocalCache(operation.table, data);
    } catch (error: any) {
      if (!isNetworkError(error)) {
        // Permanent failure (auth, validation, permission) — move to dead letter
        await moveToDeadLetter(operation, 'create', error);
        await offlineDB.pendingCreates.delete(operation.id);
        errors.push(`Permanent failure for ${operation.table} create: ${error.message}`);
        deadLettered++;
      } else {
        // True network error — retry up to MAX_RETRIES
        const newRetries = operation.retries + 1;
        if (newRetries >= MAX_RETRIES) {
          await moveToDeadLetter(operation, 'create', error);
          await offlineDB.pendingCreates.delete(operation.id);
          errors.push(`Max retries exceeded for ${operation.table} create`);
          deadLettered++;
        } else {
          await offlineDB.pendingCreates.update(operation.id, { retries: newRetries });
          failed++;
        }
      }
    }
  }

  // --- Updates ---
  const pendingUpdates = await offlineDB.pendingUpdates.toArray();
  for (const operation of pendingUpdates) {
    try {
      const { error } = await supabase
        .from(operation.table)
        .update(operation.data)
        .eq('id', operation.recordId);

      if (error) throw error;

      await offlineDB.pendingUpdates.delete(operation.id);
      success++;
      await updateLocalCache(operation.table, { id: operation.recordId, ...operation.data });
    } catch (error: any) {
      if (!isNetworkError(error)) {
        await moveToDeadLetter(operation, 'update', error);
        await offlineDB.pendingUpdates.delete(operation.id);
        errors.push(`Permanent failure for ${operation.table} update: ${error.message}`);
        deadLettered++;
      } else {
        const newRetries = operation.retries + 1;
        if (newRetries >= MAX_RETRIES) {
          await moveToDeadLetter(operation, 'update', error);
          await offlineDB.pendingUpdates.delete(operation.id);
          errors.push(`Max retries exceeded for ${operation.table} update`);
          deadLettered++;
        } else {
          await offlineDB.pendingUpdates.update(operation.id, { retries: newRetries });
          failed++;
        }
      }
    }
  }

  // --- Deletes ---
  const pendingDeletes = await offlineDB.pendingDeletes.toArray();
  for (const operation of pendingDeletes) {
    try {
      const { error } = await supabase
        .from(operation.table)
        .delete()
        .eq('id', operation.recordId);

      if (error) throw error;

      await offlineDB.pendingDeletes.delete(operation.id);
      success++;
      await removeFromLocalCache(operation.table, operation.recordId);
    } catch (error: any) {
      if (!isNetworkError(error)) {
        await moveToDeadLetter(operation, 'delete', error);
        await offlineDB.pendingDeletes.delete(operation.id);
        errors.push(`Permanent failure for ${operation.table} delete: ${error.message}`);
        deadLettered++;
      } else {
        const newRetries = operation.retries + 1;
        if (newRetries >= MAX_RETRIES) {
          await moveToDeadLetter(operation, 'delete', error);
          await offlineDB.pendingDeletes.delete(operation.id);
          errors.push(`Max retries exceeded for ${operation.table} delete`);
          deadLettered++;
        } else {
          await offlineDB.pendingDeletes.update(operation.id, { retries: newRetries });
          failed++;
        }
      }
    }
  }

  return { success, failed, deadLettered, errors };
}

async function updateLocalCache(table: string, data: any): Promise<void> {
  const now = Date.now();
  switch (table) {
    case 'flocks':
      await offlineDB.cachedFlocks.put({
        id: data.id, farm_id: data.farm_id, name: data.name, type: data.type,
        current_count: data.current_count || 0, initial_count: data.initial_count || 0,
        arrival_date: data.arrival_date, status: data.status || 'active',
        synced: true, last_updated: now, data,
      });
      break;
    case 'expenses':
      await offlineDB.cachedExpenses.put({
        id: data.id, farm_id: data.farm_id, amount: data.amount,
        category: data.category, description: data.description,
        date: data.date || data.incurred_on, synced: true, last_updated: now, data,
      });
      break;
    case 'tasks':
      await offlineDB.cachedTasks.put({
        id: data.id, farm_id: data.farm_id,
        title: data.title || data.title_override || '',
        status: data.status, due_date: data.due_date || data.scheduled_for,
        synced: true, last_updated: now, data,
      });
      break;
  }
}

async function removeFromLocalCache(table: string, recordId: string): Promise<void> {
  switch (table) {
    case 'flocks': await offlineDB.cachedFlocks.delete(recordId); break;
    case 'expenses': await offlineDB.cachedExpenses.delete(recordId); break;
    case 'tasks': await offlineDB.cachedTasks.delete(recordId); break;
  }
}

let syncInitialized = false;

function handleSyncError(err: unknown): void {
  if (import.meta.env.DEV) console.warn('[OfflineSync] Sync error:', err);
}

function setupAutoSync(): void {
  if (syncInitialized) return;
  syncInitialized = true;

  window.addEventListener('online', () => {
    syncPendingOperations().then((result) => {
      if (result.success > 0 || result.failed > 0 || result.deadLettered > 0) {
        window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: result }));
      }
    }).catch(handleSyncError);
  });

  // Periodic sync every 30 seconds while online
  setInterval(() => {
    if (navigator.onLine) syncPendingOperations().catch(handleSyncError);
  }, 30_000);
}

export function initOfflineSync(): void {
  setupAutoSync();
  if (navigator.onLine) syncPendingOperations().catch(handleSyncError);
}
