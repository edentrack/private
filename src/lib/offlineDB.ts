import Dexie, { Table } from 'dexie';

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

export interface DeadLetterOp {
  id: string;
  operation: 'create' | 'update' | 'delete';
  table: string;
  recordId?: string;
  data?: any;
  errorCode: number | string;
  errorMessage: string;
  failedAt: number;
  retries: number;
}

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
  pendingCreates!: Table<PendingCreate>;
  pendingUpdates!: Table<PendingUpdate>;
  pendingDeletes!: Table<PendingDelete>;
  deadLetter!: Table<DeadLetterOp>;

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
      pendingCreates: 'id, table, timestamp',
      pendingUpdates: 'id, table, recordId, timestamp',
      pendingDeletes: 'id, table, recordId, timestamp',
      cachedFlocks: 'id, farm_id, synced, last_updated',
      cachedExpenses: 'id, farm_id, synced, last_updated',
      cachedTasks: 'id, farm_id, synced, last_updated',
      cachedSales: 'id, farm_id, synced, last_updated',
      cachedMortality: 'id, farm_id, synced, last_updated',
      cachedInventoryUsage: 'id, farm_id, synced, last_updated',
      cachedEggCollections: 'id, farm_id, synced, last_updated',
      cachedWeightLogs: 'id, farm_id, synced, last_updated',
    });

    // Version 2: add deadLetter table for failed ops (never silently delete farmer data)
    this.version(2).stores({
      pendingCreates: 'id, table, timestamp',
      pendingUpdates: 'id, table, recordId, timestamp',
      pendingDeletes: 'id, table, recordId, timestamp',
      deadLetter: 'id, table, operation, failedAt',
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

export function generatePendingId(): string {
  return crypto.randomUUID();
}

export function isOnline(): boolean {
  return navigator.onLine;
}

export async function getPendingOperationsCount(): Promise<number> {
  const [creates, updates, deletes] = await Promise.all([
    offlineDB.pendingCreates.count(),
    offlineDB.pendingUpdates.count(),
    offlineDB.pendingDeletes.count(),
  ]);
  return creates + updates + deletes;
}

export async function getDeadLetterCount(): Promise<number> {
  return offlineDB.deadLetter.count();
}
