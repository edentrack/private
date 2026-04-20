/**
 * Offline Sync Service
 * Handles syncing pending operations when connection is restored
 */

import { supabase } from './supabaseClient';
import { offlineDB, generatePendingId, PendingCreate, PendingUpdate, PendingDelete } from './offlineDB';

const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds

/**
 * Add operation to sync queue
 */
export async function queueCreate(table: string, data: any): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingCreates.add({
    id,
    table,
    data,
    timestamp: Date.now(),
    retries: 0,
  });
  return id;
}

export async function queueUpdate(table: string, recordId: string, data: any): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingUpdates.add({
    id,
    table,
    recordId,
    data,
    timestamp: Date.now(),
    retries: 0,
  });
  return id;
}

export async function queueDelete(table: string, recordId: string): Promise<string> {
  const id = generatePendingId();
  await offlineDB.pendingDeletes.add({
    id,
    table,
    recordId,
    timestamp: Date.now(),
    retries: 0,
  });
  return id;
}

/**
 * Sync pending operations
 */
export async function syncPendingOperations(): Promise<{
  success: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  if (!navigator.onLine) {
    return { success: 0, failed: 0, errors: ['Device is offline'] };
  }

  // Sync creates
  const pendingCreates = await offlineDB.pendingCreates.toArray();
  for (const operation of pendingCreates) {
    try {
      const { data, error } = await supabase
        .from(operation.table)
        .insert(operation.data)
        .select()
        .single();

      if (error) throw error;

      // Remove from queue on success
      await offlineDB.pendingCreates.delete(operation.id);
      success++;

      // Update local cache if exists
      await updateLocalCache(operation.table, data);
    } catch (error: any) {
      operation.retries++;
      if (operation.retries >= MAX_RETRIES) {
        // Remove after max retries
        await offlineDB.pendingCreates.delete(operation.id);
        errors.push(`Failed to sync create for ${operation.table}: ${error.message}`);
        failed++;
      } else {
        // Update retry count
        await offlineDB.pendingCreates.update(operation.id, { retries: operation.retries });
        errors.push(`Retrying create for ${operation.table} (attempt ${operation.retries})`);
      }
    }
  }

  // Sync updates
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

      // Update local cache
      await updateLocalCache(operation.table, { id: operation.recordId, ...operation.data });
    } catch (error: any) {
      operation.retries++;
      if (operation.retries >= MAX_RETRIES) {
        await offlineDB.pendingUpdates.delete(operation.id);
        errors.push(`Failed to sync update for ${operation.table}: ${error.message}`);
        failed++;
      } else {
        await offlineDB.pendingUpdates.update(operation.id, { retries: operation.retries });
        errors.push(`Retrying update for ${operation.table} (attempt ${operation.retries})`);
      }
    }
  }

  // Sync deletes
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

      // Remove from local cache
      await removeFromLocalCache(operation.table, operation.recordId);
    } catch (error: any) {
      operation.retries++;
      if (operation.retries >= MAX_RETRIES) {
        await offlineDB.pendingDeletes.delete(operation.id);
        errors.push(`Failed to sync delete for ${operation.table}: ${error.message}`);
        failed++;
      } else {
        await offlineDB.pendingDeletes.update(operation.id, { retries: operation.retries });
        errors.push(`Retrying delete for ${operation.table} (attempt ${operation.retries})`);
      }
    }
  }

  return { success, failed, errors };
}

/**
 * Update local cache after sync
 */
async function updateLocalCache(table: string, data: any): Promise<void> {
  const now = Date.now();
  
  switch (table) {
    case 'flocks':
      await offlineDB.cachedFlocks.put({
        id: data.id,
        farm_id: data.farm_id,
        name: data.name,
        type: data.type,
        current_count: data.current_count || 0,
        initial_count: data.initial_count || 0,
        arrival_date: data.arrival_date,
        status: data.status || 'active',
        synced: true,
        last_updated: now,
        data,
      });
      break;
    case 'expenses':
      await offlineDB.cachedExpenses.put({
        id: data.id,
        farm_id: data.farm_id,
        amount: data.amount,
        category: data.category,
        description: data.description,
        date: data.date || data.incurred_on,
        synced: true,
        last_updated: now,
        data,
      });
      break;
    case 'tasks':
      await offlineDB.cachedTasks.put({
        id: data.id,
        farm_id: data.farm_id,
        title: data.title || data.title_override || '',
        status: data.status,
        due_date: data.due_date || data.scheduled_for,
        synced: true,
        last_updated: now,
        data,
      });
      break;
    // Add more table mappings as needed
  }
}

/**
 * Remove from local cache
 */
async function removeFromLocalCache(table: string, recordId: string): Promise<void> {
  switch (table) {
    case 'flocks':
      await offlineDB.cachedFlocks.delete(recordId);
      break;
    case 'expenses':
      await offlineDB.cachedExpenses.delete(recordId);
      break;
    case 'tasks':
      await offlineDB.cachedTasks.delete(recordId);
      break;
    // Add more table mappings as needed
  }
}

let syncInitialized = false;

function handleSyncError(err: unknown): void {
  if (import.meta.env.DEV) {
    console.warn('[OfflineSync] Sync error:', err);
  }
}

/**
 * Auto-sync on connection restore
 */
function setupAutoSync(): void {
  if (syncInitialized) return;
  syncInitialized = true;

  window.addEventListener('online', () => {
    if (import.meta.env.DEV) {
      console.log('[OfflineSync] Connection restored, syncing...');
    }
    syncPendingOperations().then((result) => {
      if (result.success > 0 || result.failed > 0) {
        window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: result }));
        if (import.meta.env.DEV) {
          console.log(`[OfflineSync] Sync done: ${result.success} ok, ${result.failed} failed`);
        }
      }
    }).catch(handleSyncError);
  });

  setInterval(() => {
    if (navigator.onLine) {
      syncPendingOperations().catch(handleSyncError);
    }
  }, 30000);
}

/**
 * Initialize offline sync
 */
export function initOfflineSync(): void {
  setupAutoSync();
  if (navigator.onLine) {
    syncPendingOperations().catch(handleSyncError);
  }
}
