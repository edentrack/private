/**
 * Offline Database Manager using IndexedDB
 * Stores data locally for offline access and sync
 */

import Dexie, { Table } from 'dexie';

// Types for offline queue items
export interface PendingCreate<T = any> {
  id: string;
  table: string;
  data: T;
  timestamp: number;
  retries: number;
}

export interface PendingUpdate<T = any> {
  id: string;
  table: string;
  recordId: string;
  data: Partial<T>;
  timestamp: number;
  retries: number;
}

export interface PendingDelete {
  id: string;
  table: string;
  recordId: string;
  timestamp: number;
  retries: number;
}

// Local cache tables
export interface CachedFlock {
  id: string;
  farm_id: string;
  name: string;
  type: string;
  current_count: number;
  initial_count: number;
  arrival_date: string;
  status: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedExpense {
  id: string;
  farm_id: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedTask {
  id: string;
  farm_id: string;
  title: string;
  status: string;
  due_date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedSale {
  id: string;
  farm_id: string;
  type: 'bird' | 'egg';
  amount: number;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedMortality {
  id: string;
  farm_id: string;
  flock_id: string;
  count: number;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedInventoryUsage {
  id: string;
  farm_id: string;
  item_id: string;
  quantity: number;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedEggCollection {
  id: string;
  farm_id: string;
  flock_id: string;
  total_eggs: number;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export interface CachedWeightLog {
  id: string;
  farm_id: string;
  flock_id: string;
  average_weight: number;
  date: string;
  synced: boolean;
  last_updated: number;
  data: any;
}

export class OfflineDB extends Dexie {
  // Sync queue
  pendingCreates!: Table<PendingCreate>;
  pendingUpdates!: Table<PendingUpdate>;
  pendingDeletes!: Table<PendingDelete>;

  // Local cache
  cachedFlocks!: Table<CachedFlock>;
  cachedExpenses!: Table<CachedExpense>;
  cachedTasks!: Table<CachedTask>;
  cachedSales!: Table<CachedSale>;
  cachedMortality!: Table<CachedMortality>;
  cachedInventoryUsage!: Table<CachedInventoryUsage>;
  cachedEggCollections!: Table<CachedEggCollection>;
  cachedWeightLogs!: Table<CachedWeightLog>;

  constructor() {
    super('EdentrackOfflineDB');

    this.version(1).stores({
      // Sync queue tables
      pendingCreates: 'id, table, timestamp',
      pendingUpdates: 'id, table, recordId, timestamp',
      pendingDeletes: 'id, table, recordId, timestamp',

      // Local cache tables
      cachedFlocks: 'id, farm_id, synced, last_updated',
      cachedExpenses: 'id, farm_id, synced, last_updated',
      cachedTasks: 'id, farm_id, synced, last_updated',
      cachedSales: 'id, farm_id, synced, last_updated',
      cachedMortality: 'id, farm_id, synced, last_updated',
      cachedInventoryUsage: 'id, farm_id, synced, last_updated',
      cachedEggCollections: 'id, farm_id, synced, last_updated',
      cachedWeightLogs: 'id, farm_id, synced, last_updated',
    });
  }
}

export const offlineDB = new OfflineDB();

/**
 * Generate unique ID for pending operations
 */
export function generatePendingId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Check if device is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Get pending operations count
 */
export async function getPendingOperationsCount(): Promise<number> {
  const [creates, updates, deletes] = await Promise.all([
    offlineDB.pendingCreates.count(),
    offlineDB.pendingUpdates.count(),
    offlineDB.pendingDeletes.count(),
  ]);
  return creates + updates + deletes;
}
