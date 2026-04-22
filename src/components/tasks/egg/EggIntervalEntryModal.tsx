import { useEffect, useMemo, useState } from 'react';
import { X, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import { TaskTemplate } from '../../../types/database';
import { syncEggIntervalFromTaskCompletion, EggIntervalSizes, EggSizeKey } from '../../../utils/eggIntervalTaskSync';
import { farmLocalToUtcIso, getFarmTimeZone } from '../../../utils/farmTime';

type IntervalGranularity = 'hourly' | 'every_2_hours';

export interface EggIntervalEntryModalProps {
  onClose: () => void;
  onSaved: () => void;
  eggTemplate: TaskTemplate;
  existingTask: {
    id: string;
    flock_id: string | null;
    scheduled_for: string;
    scheduled_time: string | null;
    data_payload: Record<string, unknown> | null;
    status: string;
  } | null;
  collectionDate: string; // YYYY-MM-DD
  intervalTimeHHMM: string; // HH:MM
  flockId: string | null;
  intervalGranularity: IntervalGranularity;
  eggsPerTray: number;
  canComplete: boolean;
  canSyncToInventory: boolean;
  initialSyncToInventory: boolean;
  initialSizes: EggIntervalSizes;
}

export function EggIntervalEntryModal({
  onClose,
  onSaved,
  eggTemplate,
  existingTask,
  collectionDate,
  intervalTimeHHMM,
  flockId,
  intervalGranularity,
  eggsPerTray,
  canComplete,
  canSyncToInventory,
  initialSyncToInventory,
  initialSizes,
}: EggIntervalEntryModalProps) {
  const { user, currentFarm, profile } = useAuth();
  const farmTz = useMemo(() => getFarmTimeZone(currentFarm), [currentFarm]);

  const todayISO = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isPastDateAtOpen = collectionDate !== todayISO;
  const initialSyncSafe = useMemo(() => {
    // Safety default: for brand-new past-date entries, default OFF.
    if (!existingTask && isPastDateAtOpen) return false;
    return initialSyncToInventory;
  }, [existingTask, initialSyncToInventory, isPastDateAtOpen]);

  const [collectionDateState, setCollectionDateState] = useState<string>(collectionDate);
  const [syncToInventory, setSyncToInventory] = useState<boolean>(initialSyncSafe && canSyncToInventory);
  const [sizes, setSizes] = useState<EggIntervalSizes>(initialSizes);
  const [notes, setNotes] = useState<string>(initialSizes.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Draft raw strings for loose-egg inputs — committed on blur so typing isn't interrupted by conversion
  const [looseDrafts, setLooseDrafts] = useState<Partial<Record<EggSizeKey, string>>>({});

  const sourceIntervalKey = useMemo(() => `${intervalGranularity}|${intervalTimeHHMM}`, [intervalGranularity, intervalTimeHHMM]);

  const intervalStartAtIso = useMemo(() => {
    // Use farm-local date+time; convert to UTC for storage/order.
    return farmLocalToUtcIso({ dateISO: collectionDateState, timeHHMM: intervalTimeHHMM, farmTz });
  }, [collectionDateState, intervalTimeHHMM, farmTz]);

  const totalGoodEggs = useMemo(() => {
    const t =
      Number(sizes.small_eggs || 0) +
      Number(sizes.medium_eggs || 0) +
      Number(sizes.large_eggs || 0) +
      Number(sizes.jumbo_eggs || 0);
    return t;
  }, [sizes.small_eggs, sizes.medium_eggs, sizes.large_eggs, sizes.jumbo_eggs]);

  const canEdit = canComplete;

  useEffect(() => {
    // When the parent opens the modal for a different interval/date,
    // ensure inputs reset to the latest props.
    setCollectionDateState(collectionDate);
    setSizes(initialSizes);
    setNotes(initialSizes.notes || '');
    setLooseDrafts({});
    setSyncToInventory((prev) => {
      // If editing an existing task, respect the stored initial sync.
      // If creating new, keep the initial safety default for past dates.
      return initialSyncSafe && canSyncToInventory;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionDate, intervalTimeHHMM, existingTask?.id]);

  const normalizeLoose = (looseRaw: number) => {
    if (!Number.isFinite(looseRaw) || eggsPerTray <= 0) return 0;
    // Allow any non-negative loose count. It will be auto-normalized
    // into trays + remainder via computeTrays/computeLoose on re-render.
    return Math.max(0, Math.floor(looseRaw));
  };

  const computeTrays = (eggs: number) => {
    if (!Number.isFinite(eggs) || eggsPerTray <= 0) return 0;
    return Math.floor(Math.max(0, eggs) / eggsPerTray);
  };

  const computeLoose = (eggs: number) => {
    if (!Number.isFinite(eggs) || eggsPerTray <= 0) return 0;
    return Math.max(0, Math.floor(eggs)) % eggsPerTray;
  };

  const updateSizeFromTraysLoose = (key: EggSizeKey, trays: number, loose: number) => {
    const safeTrays = !Number.isFinite(trays) ? 0 : Math.max(0, Math.floor(trays));
    const safeLoose = normalizeLoose(loose);
    const eggs = eggsPerTray > 0 ? safeTrays * eggsPerTray + safeLoose : safeLoose;
    setSizes((prev) => ({ ...prev, [key]: eggs } as EggIntervalSizes));
  };

  const handleSave = async () => {
    if (!user || !currentFarm?.id) return;
    if (!canEdit) return;

    setLoading(true);
    setError(null);

    try {
      const small_eggs = Number(sizes.small_eggs || 0);
      const medium_eggs = Number(sizes.medium_eggs || 0);
      const large_eggs = Number(sizes.large_eggs || 0);
      const jumbo_eggs = Number(sizes.jumbo_eggs || 0);
      const damaged_eggs = Number(sizes.damaged_eggs || 0);

      const total = small_eggs + medium_eggs + large_eggs + jumbo_eggs;
      if (total === 0 && damaged_eggs === 0) {
        setError('Enter at least some good eggs or damaged eggs.');
        return;
      }

      // `tasks.due_date` is the selected calendar day.
      // Keep `tasks.scheduled_time` as the interval time (HH:MM).
      // `window_start/window_end` remain full timestamps for the completion window.
      const scheduledForDate = collectionDateState;

      // Upsert task row for progress tracking
      let taskId = existingTask?.id || null;

      const payload = {
        interval_time: intervalTimeHHMM,
        collection_date: collectionDateState,
        flock_id: flockId,
        small_eggs,
        medium_eggs,
        large_eggs,
        jumbo_eggs,
        damaged_eggs,
        total_eggs: total,
        notes: notes || null,
        sync_to_inventory: syncToInventory,
        source_interval_key: sourceIntervalKey,
      };

      const completedBy = user!.id;
      const completedAt = new Date().toISOString();

      const windowBefore = eggTemplate.window_before_minutes ?? 60;
      const windowAfter = eggTemplate.window_after_minutes ?? 60;
      const scheduledTsISO = farmLocalToUtcIso({ dateISO: collectionDateState, timeHHMM: intervalTimeHHMM, farmTz });
      const windowStart = new Date(new Date(scheduledTsISO).getTime() - windowBefore * 60 * 1000).toISOString();
      const windowEnd = new Date(new Date(scheduledTsISO).getTime() + windowAfter * 60 * 1000).toISOString();

      if (taskId) {
        const { error: updateErr } = await supabase
          .from('tasks')
          .update({
            status: 'completed',
            completed_at: completedAt,
            completed_by: completedBy,
            data_payload: payload,
            notes: notes || null,
          })
          .eq('id', taskId);

        if (updateErr) throw updateErr;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('tasks')
          .insert({
            farm_id: currentFarm.id,
            flock_id: flockId,
            template_id: eggTemplate.id,
            title_override: eggTemplate.title,
            scheduled_for: scheduledForDate,
            window_start: windowStart,
            window_end: windowEnd,
            due_date: collectionDateState,
            scheduled_time: intervalTimeHHMM,
            status: 'completed',
            requires_input: eggTemplate.requires_input,
            data_payload: payload,
            completed_at: completedAt,
            completed_by: completedBy,
            is_archived: false,
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        taskId = inserted?.id ?? null;
      }

      if (!taskId) throw new Error('Task id missing after save');

      await syncEggIntervalFromTaskCompletion({
        farmId: currentFarm.id,
        flockId,
        taskId,
        collectionDate: collectionDateState,
        intervalStartAtIso,
        sourceIntervalKey,
        eggsPerTray,
        sizes: {
          ...sizes,
          notes: notes || null,
          damaged_eggs,
        },
        syncToInventory,
        collectedBy: profile?.id ?? null,
      });

      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save egg interval');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#3D5F42]/10 rounded-xl">
              <CheckCircle className="w-5 h-5 text-[#3D5F42]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Egg Interval Entry</h2>
              <p className="text-xs text-gray-500">
                {collectionDateState} at {intervalTimeHHMM}
                {existingTask ? ' (edit)' : ' (new)'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!canEdit && (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600">
              You don't have permission to update this entry.
            </div>
          )}

          <div className="mt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Collection Date</label>
                <input
                  type="date"
                  value={collectionDateState}
                  disabled={!canEdit || Boolean(existingTask)}
                  onChange={(e) => setCollectionDateState(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] disabled:bg-gray-50"
                />
              </div>
              {existingTask && (
                <div className="text-[11px] text-gray-500 whitespace-nowrap">
                  Date fixed while editing
                </div>
              )}
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-3">
            <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-gray-600 mb-2">
              <div>Size</div>
              <div className="text-center">Trays</div>
              <div className="text-center">Loose</div>
            </div>

            <div className="space-y-2">
              {(['small_eggs', 'medium_eggs', 'large_eggs', 'jumbo_eggs'] as const).map((k) => {
                const label = k === 'small_eggs' ? 'Small' : k === 'medium_eggs' ? 'Medium' : k === 'large_eggs' ? 'Large' : 'Jumbo';
                const eggs = (sizes as any)[k] ?? 0;
                const trays = computeTrays(eggs);
                const loose = computeLoose(eggs);
                const looseDraft = looseDrafts[k];
                return (
                  <div key={k} className="grid grid-cols-3 gap-2 items-center">
                    <div className="font-semibold text-sm text-gray-900">{label}</div>
                    <input
                      type="number"
                      min={0}
                      disabled={!canEdit}
                      value={trays}
                      onChange={(e) => updateSizeFromTraysLoose(k, Number(e.target.value), loose)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] disabled:bg-gray-50"
                    />
                    <input
                      type="number"
                      min={0}
                      disabled={!canEdit}
                      value={looseDraft !== undefined ? looseDraft : loose}
                      onChange={(e) => setLooseDrafts((prev) => ({ ...prev, [k]: e.target.value }))}
                      onBlur={(e) => {
                        updateSizeFromTraysLoose(k, trays, Number(e.target.value));
                        setLooseDrafts((prev) => { const next = { ...prev }; delete next[k]; return next; });
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] disabled:bg-gray-50"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-[11px] text-gray-600">
            Loose eggs can be any number and auto-convert to trays + remainder ({eggsPerTray} eggs per tray).
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Damaged Eggs</label>
            <input
              type="number"
              min={0}
              value={String(sizes.damaged_eggs ?? 0)}
              onChange={(e) => setSizes((prev) => ({ ...prev, damaged_eggs: Number(e.target.value) }))}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] disabled:bg-gray-50"
            />
          </div>

          <div className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Sync to Inventory</p>
              <p className="text-xs text-gray-600">If OFF, entry stays task-only.</p>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncToInventory}
                onChange={(e) => setSyncToInventory(e.target.checked)}
                disabled={!canEdit || !canSyncToInventory}
              />
              <span className="text-xs text-gray-600">{syncToInventory ? 'ON' : 'OFF'}</span>
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] disabled:bg-gray-50 resize-none"
              placeholder="Any notes about this interval..."
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600">
            Total good eggs: <span className="font-semibold text-gray-900">{totalGoodEggs.toLocaleString()}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={loading || !canEdit}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#3D5F42] text-white rounded-xl hover:bg-[#2F4A34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

