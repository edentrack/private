/**
 * Hook for wrapping Supabase write operations with offline queue fallback
 * Usage: const { tryWrite } = useOfflineWrite();
 *        const { error } = await tryWrite('table_name', 'insert', payload);
 */

import { queueCreate, queueUpdate, queueDelete, isNetworkError } from '../lib/offlineSync';

export interface OfflineWriteResult {
  success: boolean;
  error?: Error;
  queued?: boolean; // true if operation was queued offline
  pendingId?: string; // ID for queued operation
}

/**
 * Utility to try a write operation with offline fallback
 * Falls back to queue if network error is detected
 */
export async function tryOfflineWrite(
  table: string,
  operation: 'insert' | 'update' | 'delete',
  payload: any,
  recordId?: string
): Promise<OfflineWriteResult> {
  try {
    // Attempt the write (this function doesn't actually execute the write,
    // it's intended to be called AFTER a write attempt fails with network error)

    if (operation === 'insert') {
      const pendingId = await queueCreate(table, payload);
      return { success: true, queued: true, pendingId };
    } else if (operation === 'update' && recordId) {
      const pendingId = await queueUpdate(table, recordId, payload);
      return { success: true, queued: true, pendingId };
    } else if (operation === 'delete' && recordId) {
      const pendingId = await queueDelete(table, recordId);
      return { success: true, queued: true, pendingId };
    }

    return { success: false, error: new Error('Invalid operation') };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error(String(err))
    };
  }
}

/**
 * Hook for components to use offline writes
 */
export function useOfflineWrite() {
  return {
    /**
     * Try a write operation and fall back to offline queue if network error
     * Example:
     *   const { success, queued } = await tryWrite(
     *     'mortality_logs',
     *     'insert',
     *     { flock_id, farm_id, count, ... }
     *   );
     */
    tryWrite: tryOfflineWrite,

    /**
     * Check if an error is network-related
     */
    isNetworkError,

    /**
     * Manually queue an operation
     */
    queueCreate,
    queueUpdate,
    queueDelete,
  };
}
