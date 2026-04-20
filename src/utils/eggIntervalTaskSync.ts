import { supabase } from '../lib/supabaseClient';

export type EggSizeKey = 'small_eggs' | 'medium_eggs' | 'large_eggs' | 'jumbo_eggs';

export interface EggIntervalSizes {
  small_eggs: number;
  medium_eggs: number;
  large_eggs: number;
  jumbo_eggs: number;
  damaged_eggs: number;
  notes: string | null;
}

export function getTotalGoodEggs(s: EggIntervalSizes) {
  return (
    Number(s.small_eggs || 0) +
    Number(s.medium_eggs || 0) +
    Number(s.large_eggs || 0) +
    Number(s.jumbo_eggs || 0)
  );
}

function clampNonNegative(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

async function getEggInventory(farmId: string) {
  const { data } = await supabase
    .from('egg_inventory')
    .select('small_eggs, medium_eggs, large_eggs, jumbo_eggs')
    .eq('farm_id', farmId)
    .maybeSingle();
  return data as any | null;
}

async function applyEggInventoryDelta(params: {
  farmId: string;
  delta: Pick<EggIntervalSizes, EggSizeKey | 'damaged_eggs'>;
}) {
  const inv = await getEggInventory(params.farmId);

  const next = {
    small_eggs: clampNonNegative(Number((inv?.small_eggs ?? 0)) + Number((params.delta as any).small_eggs ?? 0)),
    medium_eggs: clampNonNegative(Number((inv?.medium_eggs ?? 0)) + Number((params.delta as any).medium_eggs ?? 0)),
    large_eggs: clampNonNegative(Number((inv?.large_eggs ?? 0)) + Number((params.delta as any).large_eggs ?? 0)),
    jumbo_eggs: clampNonNegative(Number((inv?.jumbo_eggs ?? 0)) + Number((params.delta as any).jumbo_eggs ?? 0)),
  };

  if (inv) {
    const { error } = await supabase
      .from('egg_inventory')
      .update({
        ...next,
        last_updated: new Date().toISOString(),
      })
      .eq('farm_id', params.farmId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('egg_inventory')
      .insert({
        farm_id: params.farmId,
        ...next,
        last_updated: new Date().toISOString(),
      });
    if (error) throw error;
  }
}

function isMissingIntervalTrackingColumns(err: any) {
  const code = err?.code;
  const msg = String(err?.message || '').toLowerCase();
  return code === '42703' || msg.includes('source_task_id') || msg.includes('interval_start_at');
}

export interface SyncEggIntervalFromTaskParams {
  farmId: string;
  flockId: string | null;
  taskId: string;
  collectionDate: string; // YYYY-MM-DD local date chosen by the user
  intervalStartAtIso: string; // timestamptz moment for ordering; does not drive collection_date
  sourceIntervalKey: string; // stable bucket id (e.g. "02:00" or "02:00|2h")
  eggsPerTray: number;
  sizes: EggIntervalSizes;
  syncToInventory: boolean;
  collectedBy: string | null; // profile.id
}

export async function syncEggIntervalFromTaskCompletion(
  params: SyncEggIntervalFromTaskParams
): Promise<{ eggCollectionId: string | null; synced: boolean }> {
  const existingQuery = await supabase
    .from('egg_collections')
    .select('*')
    .eq('farm_id', params.farmId)
    .eq('source_task_id', params.taskId)
    .maybeSingle();

  if ((existingQuery as any).error) {
    const err = (existingQuery as any).error;
    if (isMissingIntervalTrackingColumns(err)) {
      throw new Error(
        'Interval egg sync is not available yet because your Supabase schema is missing `source_task_id` / `interval_start_at`. Apply migration `20260318000100_add_egg_interval_tracking.sql`, then try syncing again.'
      );
    }
    throw err;
  }

  let existing = (existingQuery.data || null) as any;

  // Fallback for legacy/unlinked rows:
  // If the interval was created before `source_task_id` was backfilled,
  // we won't find it by taskId. Try to find an unlinked row for the same interval bucket.
  if (!existing) {
    try {
      const intervalExistingQuery = await supabase
        .from('egg_collections')
        .select('*')
        .eq('farm_id', params.farmId)
        .eq('flock_id', params.flockId)
        .eq('interval_start_at', params.intervalStartAtIso)
        .limit(1)
        .maybeSingle();

      const intervalExisting = (intervalExistingQuery.data || null) as any;
      // Only hijack truly unlinked rows; if it's linked to another task, prefer insert/update elsewhere.
      if (intervalExisting && (intervalExisting.source_task_id == null)) {
        existing = intervalExisting;
      }
    } catch (fallbackErr) {
      // If interval_start_at is missing, the earlier "missing columns" error path will already guide migrations.
      // Ignore fallback errors to avoid breaking task completion.
    }
  }

  // Normalize sizes
  const normalized: EggIntervalSizes = {
    small_eggs: Number(params.sizes.small_eggs || 0),
    medium_eggs: Number(params.sizes.medium_eggs || 0),
    large_eggs: Number(params.sizes.large_eggs || 0),
    jumbo_eggs: Number(params.sizes.jumbo_eggs || 0),
    damaged_eggs: Number(params.sizes.damaged_eggs || 0),
    notes: params.sizes.notes ?? null,
  };

  const totalGood = getTotalGoodEggs(normalized);
  const trays = params.eggsPerTray > 0 ? Math.ceil(totalGood / params.eggsPerTray) : 0;

  if (!params.syncToInventory) {
    if (!existing) {
      // Task-only: nothing else to do.
      return { eggCollectionId: null, synced: false };
    }

    // Revert inventory
    const delta = {
      small_eggs: -Number(existing.small_eggs ?? 0),
      medium_eggs: -Number(existing.medium_eggs ?? 0),
      large_eggs: -Number(existing.large_eggs ?? 0),
      jumbo_eggs: -Number(existing.jumbo_eggs ?? 0),
      damaged_eggs: 0,
    };

    await applyEggInventoryDelta({ farmId: params.farmId, delta });

    const { error } = await supabase
      .from('egg_collections')
      .delete()
      .eq('id', existing.id);
    if (error) throw error;

    return { eggCollectionId: existing.id, synced: false };
  }

  // syncToInventory === true
  if (existing) {
    const old = {
      small_eggs: Number(existing.small_eggs ?? 0),
      medium_eggs: Number(existing.medium_eggs ?? 0),
      large_eggs: Number(existing.large_eggs ?? 0),
      jumbo_eggs: Number(existing.jumbo_eggs ?? 0),
    };

    const delta = {
      small_eggs: normalized.small_eggs - old.small_eggs,
      medium_eggs: normalized.medium_eggs - old.medium_eggs,
      large_eggs: normalized.large_eggs - old.large_eggs,
      jumbo_eggs: normalized.jumbo_eggs - old.jumbo_eggs,
      damaged_eggs: 0,
    };

    if (delta.small_eggs !== 0 || delta.medium_eggs !== 0 || delta.large_eggs !== 0 || delta.jumbo_eggs !== 0) {
      await applyEggInventoryDelta({ farmId: params.farmId, delta: delta as any });
    }

    const { error } = await supabase
      .from('egg_collections')
      .update({
        // Keep legacy fields compatible for existing UI
        collection_date: params.collectionDate,
        collected_on: params.collectionDate,
        trays,
        broken: normalized.damaged_eggs,
        damaged_eggs: normalized.damaged_eggs,
        small_eggs: normalized.small_eggs,
        medium_eggs: normalized.medium_eggs,
        large_eggs: normalized.large_eggs,
        jumbo_eggs: normalized.jumbo_eggs,
        total_eggs: totalGood,
        notes: normalized.notes,
        collected_by: params.collectedBy,

        // Interval linkage
        interval_start_at: params.intervalStartAtIso,
        source_task_id: params.taskId,
        source_interval_key: params.sourceIntervalKey,
      })
      .eq('id', existing.id);

    if (error) {
      if (isMissingIntervalTrackingColumns(error)) {
        throw new Error(
          'Interval egg sync is not available yet because your Supabase schema is missing `source_task_id` / `interval_start_at`. Apply migration `20260318000100_add_egg_interval_tracking.sql`, then try syncing again.'
        );
      }
      throw error;
    }

    return { eggCollectionId: existing.id, synced: true };
  }

  // Insert new interval record
  const insertPayload = {
    farm_id: params.farmId,
    flock_id: params.flockId,
    collection_date: params.collectionDate,
    collected_on: params.collectionDate,
    trays,
    broken: normalized.damaged_eggs,
    small_eggs: normalized.small_eggs,
    medium_eggs: normalized.medium_eggs,
    large_eggs: normalized.large_eggs,
    jumbo_eggs: normalized.jumbo_eggs,
    damaged_eggs: normalized.damaged_eggs,
    total_eggs: totalGood,
    notes: normalized.notes,
    collected_by: params.collectedBy,

    // Interval linkage
    interval_start_at: params.intervalStartAtIso,
    source_task_id: params.taskId,
    source_interval_key: params.sourceIntervalKey,
  };

  const { data, error: insertError } = await supabase
    .from('egg_collections')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError) {
    if (isMissingIntervalTrackingColumns(insertError)) {
      throw new Error(
        'Interval egg sync is not available yet because your Supabase schema is missing `source_task_id` / `interval_start_at`. Apply migration `20260318000100_add_egg_interval_tracking.sql`, then try syncing again.'
      );
    }
    throw insertError;
  }

  // Add to inventory
  const delta = {
    small_eggs: normalized.small_eggs,
    medium_eggs: normalized.medium_eggs,
    large_eggs: normalized.large_eggs,
    jumbo_eggs: normalized.jumbo_eggs,
    damaged_eggs: 0,
  };

  await applyEggInventoryDelta({ farmId: params.farmId, delta: delta as any });

  return { eggCollectionId: data?.id ?? null, synced: true };
}

