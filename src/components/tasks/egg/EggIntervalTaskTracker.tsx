import { useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Egg, Calendar, Clock, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermissions } from '../../../contexts/PermissionsContext';
import { Flock } from '../../../types/database';
import { EggIntervalEntryModal } from './EggIntervalEntryModal';
import { TaskTemplate } from '../../../types/database';
import { EggIntervalSizes, getTotalGoodEggs } from '../../../utils/eggIntervalTaskSync';
import { getFarmTimeZone, getFarmTodayISO, getNowMinutesInFarmTz } from '../../../utils/farmTime';

function normalizeTimeToHHMM(value: any) {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function normalizeTimes(times: any): string[] {
  if (Array.isArray(times)) {
    const cleaned = times
      .map((t) => String(t).trim().slice(0, 5))
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    return Array.from(new Set(cleaned)).sort();
  }

  if (typeof times === 'string') {
    const raw = times.trim();
    // Try JSON like '["08:00","10:00"]'
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        return normalizeTimes(parsed);
      } catch {
        // fall through to splitting
      }
    }

    // Try comma/space separated like '08:00,10:00' or '08:00 10:00'
    const cleaned = raw
      .split(/[,\s]+/)
      .map((t) => String(t).trim().slice(0, 5))
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    return Array.from(new Set(cleaned)).sort();
  }

  return [];
}

function parsePayloadSizes(payload: any): EggIntervalSizes {
  const s = payload || {};
  return {
    small_eggs: Number(s.small_eggs ?? 0),
    medium_eggs: Number(s.medium_eggs ?? 0),
    large_eggs: Number(s.large_eggs ?? 0),
    jumbo_eggs: Number(s.jumbo_eggs ?? 0),
    damaged_eggs: Number(s.damaged_eggs ?? 0),
    notes: (s.notes ?? null) as string | null,
  };
}

function parseCollectionSizes(row: any): EggIntervalSizes {
  return {
    small_eggs: Number(row?.small_eggs ?? 0),
    medium_eggs: Number(row?.medium_eggs ?? 0),
    large_eggs: Number(row?.large_eggs ?? 0),
    jumbo_eggs: Number(row?.jumbo_eggs ?? 0),
    damaged_eggs: Number(row?.damaged_eggs ?? 0),
    notes: null,
  };
}

interface EggIntervalTaskTrackerProps {
  readOnly?: boolean;
  /** When both are set, the parent owns the selected day (e.g. Tasks page header date). */
  selectedDate?: string;
  onSelectedDateChange?: (date: string) => void;
  /** Hide duplicate date input when parent already shows a date picker */
  hideDatePicker?: boolean;
}

export function EggIntervalTaskTracker({
  readOnly = false,
  selectedDate: selectedDateFromParent,
  onSelectedDateChange,
  hideDatePicker = false,
}: EggIntervalTaskTrackerProps) {
  const { currentFarm, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const { t } = useTranslation();
  const canManageTasks = currentRole === 'owner' || currentRole === 'manager';

  type IntervalGranularity = 'hourly' | 'every_2_hours';

  const [loading, setLoading] = useState(true);
  const [eggsPerTray, setEggsPerTray] = useState(30);

  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [selectedFlockId, setSelectedFlockId] = useState<string | null>(null);

  const [eggTemplate, setEggTemplate] = useState<TaskTemplate | null>(null);

  const isDateControlled =
    typeof selectedDateFromParent === 'string' && typeof onSelectedDateChange === 'function';

  const [internalSelectedDate, setInternalSelectedDate] = useState(() =>
    getFarmTodayISO(getFarmTimeZone(null))
  );
  const selectedDate = isDateControlled ? selectedDateFromParent! : internalSelectedDate;

  /** Last farm-local calendar day we saw; used to advance the picker when a new farm day starts (tab left open overnight). */
  const lastFarmDaySeenRef = useRef<string | null>(null);

  const [tasksToday, setTasksToday] = useState<Record<string, any>>({});
  const [tasksYesterday, setTasksYesterday] = useState<Record<string, any>>({});
  const [collectionsTodayByTime, setCollectionsTodayByTime] = useState<Record<string, any>>({});
  const [collectionsYesterdayByTime, setCollectionsYesterdayByTime] = useState<Record<string, any>>({});

  const [showModal, setShowModal] = useState(false);
  const [modalIntervalTime, setModalIntervalTime] = useState<string>('00:00');
  const [modalInitialSync, setModalInitialSync] = useState(false);
  const [modalInitialSizes, setModalInitialSizes] = useState<EggIntervalSizes>({
    small_eggs: 0,
    medium_eggs: 0,
    large_eggs: 0,
    jumbo_eggs: 0,
    damaged_eggs: 0,
    notes: null,
  });
  const [savingFromModal, setSavingFromModal] = useState(false);

  // UI compactness controls (save space on mobile)
  const [curveExpanded, setCurveExpanded] = useState(false);
  const [intervalsExpanded, setIntervalsExpanded] = useState(false);
  const [curveView, setCurveView] = useState<'hours' | 'day' | 'week' | 'month'>('hours');
  const [periodCurve, setPeriodCurve] = useState<null | {
    labels: string[];
    current: number[];
    previous: number[];
    projected: Array<number | null>;
    elapsedIndex: number;
    currentTotal: number;
    previousTotal: number;
    projectedTotal: number | null;
    trendTurningLabel?: string | null;
  }>(null);
  const [sizeHistory, setSizeHistory] = useState<
    Array<{ date: string; small: number; medium: number; large: number; jumbo: number }>
  >([]);

  const canSyncToInventory = useMemo(() => {
    if (!currentRole) return false;
    if (currentRole === 'owner') return true;
    if (currentRole === 'manager') return !!farmPermissions?.managers_can_edit_eggs;
    return false;
  }, [currentRole, farmPermissions?.managers_can_edit_eggs]);

  const defaultSyncToInventory = useMemo(() => {
    // Default ON so egg collections flow into inventory automatically.
    return canSyncToInventory;
  }, [canSyncToInventory]);

  const intervalTimes = useMemo(() => normalizeTimes(eggTemplate?.scheduled_times), [eggTemplate?.scheduled_times]);
  const farmTz = useMemo(() => getFarmTimeZone(currentFarm), [currentFarm]);

  const intervalGranularity: IntervalGranularity = useMemo(() => {
    // If configured for 24 times/day, treat as hourly. Otherwise treat as every-2-hours schedule.
    return intervalTimes.length === 24 ? 'hourly' : 'every_2_hours';
  }, [intervalTimes.length]);

  const dayOptionLabel = useMemo(() => {
    // This view is the hour-by-hour (interval) curve, even if the interval count
    // is not 24 (e.g. 8 intervals/day).
    return 'Hours';
  }, [intervalTimes.length]);

  const todayLocalDate = useMemo(() => getFarmTodayISO(farmTz), [farmTz]);
  const isSelectedDateToday = selectedDate === todayLocalDate;

  useEffect(() => {
    if (isDateControlled) return;
    // Anchor the date picker to farm-local today when switching farms / TZ.
    if (currentFarm?.id) setInternalSelectedDate(getFarmTodayISO(farmTz));
  }, [currentFarm?.id, farmTz, isDateControlled]);

  useEffect(() => {
    // Parent-controlled mode: TasksPage2 already rolls `dateISO` on farm midnight; avoid duplicate timers.
    if (isDateControlled) return;

    const bumpFarmIfNewDay = () => {
      const farmToday = getFarmTodayISO(farmTz);
      const prev = lastFarmDaySeenRef.current;
      if (prev !== null && farmToday !== prev) {
        setInternalSelectedDate((d) => (d === prev ? farmToday : d));
      }
      lastFarmDaySeenRef.current = farmToday;
    };
    bumpFarmIfNewDay();
    const id = setInterval(bumpFarmIfNewDay, 60_000);
    const onVis = () => bumpFarmIfNewDay();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [farmTz, isDateControlled]);

  useEffect(() => {
    const load = async () => {
      if (!currentFarm?.id) return;
      setLoading(true);
      try {
        // eggs_per_tray
        const { data: farmData } = await supabase
          .from('farms')
          .select('eggs_per_tray')
          .eq('id', currentFarm.id)
          .maybeSingle();
        if (farmData?.eggs_per_tray) setEggsPerTray(Number(farmData.eggs_per_tray) || 30);

        // flocks (layers only)
        const { data: flocksData } = await supabase
          .from('flocks')
          .select('id, name, type, purpose, current_count, arrival_date')
          .eq('farm_id', currentFarm.id)
          .eq('status', 'active');

        const layerFlocks = (flocksData || []).filter(
          (f: any) => f.type?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layer'
        ) as Flock[];

        setFlocks(layerFlocks);
        if (!selectedFlockId && layerFlocks.length > 0) setSelectedFlockId(layerFlocks[0].id);

        // Egg template (system template created by create_system_task_templates)
        const { data: templates } = await supabase
          .from('task_templates')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .eq('icon', 'egg')
          .order('display_order', { ascending: true });

        const egg = (templates || []).find((t: any) => String(t.title).toLowerCase().includes('egg')) as TaskTemplate | undefined;
        if (egg) {
          setEggTemplate(egg);
        } else {
          // no template; no rows
        }
      } catch (e) {
        console.error('Failed loading egg interval tracker', e);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFarm?.id]);

  async function loadTasksForDate(date: string) {
    if (!currentFarm?.id || !eggTemplate?.id) return;

    let query = supabase
      .from('tasks')
      .select('id, status, scheduled_time, scheduled_for, due_date, data_payload, flock_id')
      .eq('farm_id', currentFarm.id)
      .eq('template_id', eggTemplate.id)
      .or(`due_date.eq.${date},scheduled_for.eq.${date}`)
      .order('scheduled_time', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as any[];
    const scopedRows = (() => {
      if (!selectedFlockId) return rows;
      const exact = rows.filter((r) => r.flock_id === selectedFlockId);
      if (exact.length > 0) return exact;
      // Fallback for legacy rows saved without flock_id.
      return rows.filter((r) => r.flock_id == null);
    })();

    const scoreTask = (t: any) => {
      const hasPayload = !!(t?.data_payload && Object.keys(t.data_payload).length > 0);
      const isCompleted = t?.status === 'completed';
      return (isCompleted ? 2 : 0) + (hasPayload ? 1 : 0);
    };

    const map: Record<string, any> = {};
    scopedRows.forEach((t: any) => {
      const hhmm = normalizeTimeToHHMM(
        t.scheduled_time ||
          // scheduled_for is DATE in our schema; older rows might not have scheduled_time.
          (t.scheduled_for ? String(t.scheduled_for).slice(11, 16) : '') ||
          // Interval modal payload includes `interval_time`, which we can use as a safe fallback.
          t.data_payload?.interval_time ||
          t.data_payload?.intervalTimeHHMM
      );
      if (!hhmm) return;
      const existing = map[hhmm];
      if (!existing || scoreTask(t) >= scoreTask(existing)) {
        map[hhmm] = t;
      }
    });
    return map;
  }

  async function loadCollectionsForDate(date: string) {
    if (!currentFarm?.id) return {};

    const { data, error } = await supabase
      .from('egg_collections')
      .select(
        'id, source_task_id, source_interval_key, interval_start_at, flock_id, collection_date, collected_on, small_eggs, medium_eggs, large_eggs, jumbo_eggs, total_eggs'
      )
      .eq('farm_id', currentFarm.id)
      .or(`collection_date.eq.${date},collected_on.eq.${date}`);

    if (error) throw error;

    const rows = (data || []) as any[];
    const scopedRows = (() => {
      if (!selectedFlockId) return rows;
      const exact = rows.filter((r) => r.flock_id === selectedFlockId);
      if (exact.length > 0) return exact;
      return rows.filter((r) => r.flock_id == null);
    })();

    const map: Record<string, any> = {};
    scopedRows.forEach((c: any) => {
      const hhmmFromKey = (() => {
        const m = String(c?.source_interval_key || '').match(/(\d{2}:\d{2})/);
        return m?.[1] || '';
      })();

      const hhmm = normalizeTimeToHHMM(
        hhmmFromKey ||
          // Fallback for older rows without source_interval_key.
          (c?.interval_start_at ? new Date(c.interval_start_at).toISOString().slice(11, 16) : '')
      );
      if (!hhmm) return;
      map[hhmm] = c;
    });

    return map;
  }

  const startOfWeek = (iso: string) => {
    const d = DateTime.fromISO(iso, { zone: 'utc' });
    return d.minus({ days: d.weekday - 1 }).toISODate() || iso;
  };
  const endOfWeek = (iso: string) => {
    const s = startOfWeek(iso);
    return DateTime.fromISO(s, { zone: 'utc' }).plus({ days: 6 }).toISODate() || iso;
  };
  const startOfMonth = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).startOf('month').toISODate() || iso;
  const endOfMonth = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).endOf('month').toISODate() || iso;

  useEffect(() => {
    if (curveView === 'hours') {
      setPeriodCurve(null);
      return;
    }
    if (!currentFarm?.id || !selectedFlockId) return;

    const run = async () => {
      try {
        const fetchCollectionsRange = async (startISO: string, endISO: string) => {
          const { data, error } = await supabase
            .from('egg_collections')
            .select(
              'id, source_task_id, source_interval_key, interval_start_at, flock_id, collection_date, collected_on, small_eggs, medium_eggs, large_eggs, jumbo_eggs, total_eggs'
            )
            .eq('farm_id', currentFarm.id)
            .or(
              `and(collection_date.gte.${startISO},collection_date.lte.${endISO}),and(collected_on.gte.${startISO},collected_on.lte.${endISO})`
            );
          if (error) throw error;
          return (data || []) as any[];
        };

        const collectionTotal = (c: any) => {
          const fromSizes =
            Number(c.small_eggs || 0) +
            Number(c.medium_eggs || 0) +
            Number(c.large_eggs || 0) +
            Number(c.jumbo_eggs || 0);
          const cTotal = Number(c.total_eggs ?? fromSizes);
          return Number.isFinite(cTotal) ? cTotal : fromSizes;
        };

        if (curveView === 'day') {
          const { data: firstCollectionRow } = await supabase
            .from('egg_collections')
            .select('collection_date, collected_on, interval_start_at')
            .eq('farm_id', currentFarm.id)
            .eq('flock_id', selectedFlockId)
            .order('collection_date', { ascending: true })
            .order('collected_on', { ascending: true })
            .order('interval_start_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          const firstDate =
            String(
              firstCollectionRow?.collection_date ||
                firstCollectionRow?.collected_on ||
                firstCollectionRow?.interval_start_at ||
                selectedDate
            ).slice(0, 10) || selectedDate;
          const dayStart = /^\d{4}-\d{2}-\d{2}$/.test(firstDate) ? firstDate : selectedDate;
          const dayEnd = selectedDate;

          const eggs = await fetchCollectionsRange(dayStart, dayEnd);
          const scoped = eggs.filter((e: any) => e.flock_id === selectedFlockId || e.flock_id == null);
          const byDay = new Map<string, number>();
          scoped.forEach((c: any) => {
            const day = String(c.collection_date || c.collected_on || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
            byDay.set(day, (byDay.get(day) || 0) + collectionTotal(c));
          });
          const labels: string[] = [];
          const values: number[] = [];
          let d = DateTime.fromISO(dayStart, { zone: 'utc' });
          const end = DateTime.fromISO(dayEnd, { zone: 'utc' });
          while (d.toMillis() <= end.toMillis()) {
            const iso = d.toISODate() || '';
            labels.push(d.toFormat('LLL d'));
            values.push(Math.round(byDay.get(iso) || 0));
            d = d.plus({ days: 1 });
          }
          const selectedIdx = Math.max(
            0,
            DateTime.fromISO(selectedDate, { zone: 'utc' }).diff(
              DateTime.fromISO(dayStart, { zone: 'utc' }),
              'days'
            ).days
          );
          setPeriodCurve({
            labels,
            current: values,
            previous: [],
            projected: values.map((v) => v),
            elapsedIndex: Math.min(values.length - 1, Math.floor(selectedIdx)),
            currentTotal: values.reduce((a, b) => a + b, 0),
            previousTotal: 0,
            projectedTotal: null,
            trendTurningLabel: null,
          });
          return;
        }

        if (curveView === 'week') {
          const selectedFlock = flocks.find((f) => f.id === selectedFlockId) || null;
          const flockStart = selectedFlock?.arrival_date
            ? DateTime.fromISO(String(selectedFlock.arrival_date).slice(0, 10), { zone: 'utc' })
            : DateTime.fromISO(selectedDate, { zone: 'utc' }).minus({ days: 27 });
          const end = DateTime.fromISO(selectedDate, { zone: 'utc' });
          const eggs = await fetchCollectionsRange(flockStart.toISODate() || selectedDate, end.toISODate() || selectedDate);
          const scoped = eggs.filter((e: any) => e.flock_id === selectedFlockId || e.flock_id == null);
          const byWeek = new Map<number, number>();
          scoped.forEach((c: any) => {
            const dayIso = String(c.collection_date || c.collected_on || '').slice(0, 10);
            const d = DateTime.fromISO(dayIso, { zone: 'utc' });
            if (!d.isValid) return;
            const diffDays = Math.floor(d.diff(flockStart, 'days').days);
            if (diffDays < 0) return;
            const weekIdx = Math.floor(diffDays / 7);
            byWeek.set(weekIdx, (byWeek.get(weekIdx) || 0) + collectionTotal(c));
          });
          const totalWeeks = Math.max(1, Math.floor(end.diff(flockStart, 'days').days / 7) + 1);
          const labels = Array.from({ length: totalWeeks }, (_, i) => `W${i + 1}`);
          const values = labels.map((_, i) => Math.round(byWeek.get(i) || 0));
          setPeriodCurve({
            labels,
            current: values,
            previous: [],
            projected: values.map((v) => v),
            elapsedIndex: totalWeeks - 1,
            currentTotal: values.reduce((a, b) => a + b, 0),
            previousTotal: 0,
            projectedTotal: null,
            trendTurningLabel: null,
          });
          return;
        }

        // month => Month buckets from flock start (Month 1, Month 2, ...)
        const selectedFlock = flocks.find((f) => f.id === selectedFlockId) || null;
        const flockStart = selectedFlock?.arrival_date
          ? DateTime.fromISO(String(selectedFlock.arrival_date).slice(0, 10), { zone: 'utc' }).startOf('month')
          : DateTime.fromISO(selectedDate, { zone: 'utc' }).startOf('month');
        const rangeEnd = DateTime.fromISO(selectedDate, { zone: 'utc' }).endOf('month');
        const eggs = await fetchCollectionsRange(flockStart.toISODate() || selectedDate, rangeEnd.toISODate() || selectedDate);
        const scoped = eggs.filter((e: any) => e.flock_id === selectedFlockId || e.flock_id == null);
        const byMonthIdx = new Map<number, number>();
        scoped.forEach((c: any) => {
          const dayIso = String(c.collection_date || c.collected_on || '').slice(0, 10);
          const d = DateTime.fromISO(dayIso, { zone: 'utc' });
          if (!d.isValid) return;
          const monthIdx = Math.max(
            0,
            Math.floor(d.startOf('month').diff(flockStart, 'months').months)
          );
          byMonthIdx.set(monthIdx, (byMonthIdx.get(monthIdx) || 0) + collectionTotal(c));
        });
        const totalMonths = Math.max(
          1,
          Math.floor(rangeEnd.startOf('month').diff(flockStart, 'months').months) + 1
        );
        const labels = Array.from({ length: totalMonths }, (_, i) => `Month ${i + 1}`);
        const values = labels.map((_, i) => Math.round(byMonthIdx.get(i) || 0));
        setPeriodCurve({
          labels,
          current: values,
          previous: [],
          projected: values.map((v) => v),
          elapsedIndex: labels.length - 1,
          currentTotal: values.reduce((a, b) => a + b, 0),
          previousTotal: 0,
          projectedTotal: null,
          trendTurningLabel: null,
        });
      } catch (e) {
        console.error('Failed loading non-hour egg curve', e);
        setPeriodCurve(null);
      }
    };
    run();
  }, [
    curveView,
    currentFarm?.id,
    selectedFlockId,
    selectedDate,
    isSelectedDateToday,
    flocks,
  ]);

  useEffect(() => {
    if (!eggTemplate?.id || !currentFarm?.id || !selectedFlockId) return;
    const run = async () => {
      try {
        // `selectedDate` is a YYYY-MM-DD string. Using JS Date parsing can shift days
        // depending on local timezone (UTC vs local). Compute prev day in UTC to stay stable.
        const prevDate = DateTime.fromISO(selectedDate, { zone: 'utc' })
          .minus({ days: 1 })
          .toISODate();

        setLoading(true);
        const [todayMap, yMap, todayCollMap, yCollMap] = await Promise.all([
          loadTasksForDate(selectedDate),
          loadTasksForDate(prevDate || selectedDate),
          loadCollectionsForDate(selectedDate),
          loadCollectionsForDate(prevDate || selectedDate),
        ]);
        setTasksToday(todayMap || {});
        setTasksYesterday(yMap || {});
        setCollectionsTodayByTime(todayCollMap || {});
        setCollectionsYesterdayByTime(yCollMap || {});
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, eggTemplate?.id, currentFarm?.id, selectedFlockId]);

  const intervalRows = useMemo(() => {
    // If owner did not set times yet, show an empty hint state
    if (!intervalTimes || intervalTimes.length === 0) return [];
    return intervalTimes.map((timeHHMM) => {
      const task = tasksToday[timeHHMM] || null;
      const payload = task?.data_payload || null;

      const sizes = parsePayloadSizes(payload);
      const sync = task ? Boolean(payload?.sync_to_inventory) : defaultSyncToInventory;
      const status = task?.status || 'pending';
      return {
        timeHHMM,
        task,
        status,
        sizes,
        sync,
        notes: (sizes.notes || payload?.notes || null) as string | null,
      };
    });
  }, [intervalTimes, tasksToday, defaultSyncToInventory]);

  const resolveIntervalSizes = (
    timeHHMM: string,
    task: any,
    collectionByTime: Record<string, any>
  ): EggIntervalSizes => {
    const payload = task?.data_payload || null;
    const taskSizes = parsePayloadSizes(payload);
    const syncToInventory = Boolean(payload?.sync_to_inventory);
    if (!syncToInventory) return taskSizes;

    const byTaskId = task?.id
      ? Object.values(collectionByTime).find((c: any) => String(c?.source_task_id || '') === String(task.id))
      : null;
    const byTime = collectionByTime[timeHHMM] || null;
    const picked = (byTaskId || byTime) as any;
    if (!picked) return taskSizes;
    return parseCollectionSizes(picked);
  };

  const totals = useMemo(() => {
    const makeAcc = () => ({ total: 0, small: 0, medium: 0, large: 0, jumbo: 0 });
    const todayTotals = makeAcc();
    const yesterdayTotals = makeAcc();

    intervalTimes.forEach((timeHHMM) => {
      const todaySizes = resolveIntervalSizes(timeHHMM, tasksToday[timeHHMM], collectionsTodayByTime);
      todayTotals.total += getTotalGoodEggs(todaySizes);
      todayTotals.small += Number(todaySizes.small_eggs || 0);
      todayTotals.medium += Number(todaySizes.medium_eggs || 0);
      todayTotals.large += Number(todaySizes.large_eggs || 0);
      todayTotals.jumbo += Number(todaySizes.jumbo_eggs || 0);

      const ySizes = resolveIntervalSizes(timeHHMM, tasksYesterday[timeHHMM], collectionsYesterdayByTime);
      yesterdayTotals.total += getTotalGoodEggs(ySizes);
      yesterdayTotals.small += Number(ySizes.small_eggs || 0);
      yesterdayTotals.medium += Number(ySizes.medium_eggs || 0);
      yesterdayTotals.large += Number(ySizes.large_eggs || 0);
      yesterdayTotals.jumbo += Number(ySizes.jumbo_eggs || 0);
    });

    return { todayTotals, yesterdayTotals, yesterdayTotal: yesterdayTotals.total };
  }, [intervalTimes, tasksToday, tasksYesterday, collectionsTodayByTime, collectionsYesterdayByTime]);

  useEffect(() => {
    if (!eggTemplate?.id || !currentFarm?.id || !selectedFlockId) return;
    const run = async () => {
      try {
        const endISO = selectedDate;
        const startISO = DateTime.fromISO(selectedDate, { zone: 'utc' }).minus({ days: 6 }).toISODate() || selectedDate;

        const [{ data: taskRows, error: taskErr }, { data: eggRows, error: eggErr }] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, due_date, scheduled_for, scheduled_time, data_payload, status, flock_id')
            .eq('farm_id', currentFarm.id)
            .eq('template_id', eggTemplate.id)
            .eq('status', 'completed')
            .or(`and(due_date.gte.${startISO},due_date.lte.${endISO}),and(scheduled_for.gte.${startISO},scheduled_for.lte.${endISO})`),
          supabase
            .from('egg_collections')
            .select(
              'id, source_task_id, source_interval_key, interval_start_at, flock_id, collection_date, collected_on, small_eggs, medium_eggs, large_eggs, jumbo_eggs'
            )
            .eq('farm_id', currentFarm.id)
            .or(
              `and(collection_date.gte.${startISO},collection_date.lte.${endISO}),and(collected_on.gte.${startISO},collected_on.lte.${endISO})`
            ),
        ]);
        if (taskErr) throw taskErr;
        if (eggErr) throw eggErr;

        const allTasks = (taskRows || []) as any[];
        const scopedTasks = (() => {
          const exact = allTasks.filter((r) => r.flock_id === selectedFlockId);
          if (exact.length > 0) return exact;
          return allTasks.filter((r) => r.flock_id == null);
        })();

        const allEggs = (eggRows || []) as any[];
        const scopedEggs = (() => {
          const exact = allEggs.filter((r) => r.flock_id === selectedFlockId);
          if (exact.length > 0) return exact;
          return allEggs.filter((r) => r.flock_id == null);
        })();

        const eggByTaskId = new Map<string, any>();
        const eggByDayTime = new Map<string, any>();
        scopedEggs.forEach((c: any) => {
          const day = String(c.collection_date || c.collected_on || '').slice(0, 10);
          const hhmm = normalizeTimeToHHMM(
            String(c?.source_interval_key || '').match(/(\d{2}:\d{2})/)?.[1] ||
              (c?.interval_start_at ? new Date(c.interval_start_at).toISOString().slice(11, 16) : '')
          );
          if (!day || !hhmm) return;
          if (c?.source_task_id) eggByTaskId.set(String(c.source_task_id), c);
          eggByDayTime.set(`${day}|${hhmm}`, c);
        });

        const dedupByDayTime = new Map<string, any>();
        scopedTasks.forEach((task: any) => {
          const day = String(task?.due_date || task?.scheduled_for || '').slice(0, 10);
          if (!day) return;
          const hhmm = normalizeTimeToHHMM(
            task?.scheduled_time || task?.data_payload?.interval_time || task?.data_payload?.intervalTimeHHMM
          );
          if (!hhmm) return;
          const key = `${day}|${hhmm}`;
          const existing = dedupByDayTime.get(key);
          const score = getTotalGoodEggs(parsePayloadSizes(task?.data_payload));
          const existingScore = existing ? getTotalGoodEggs(parsePayloadSizes(existing?.data_payload)) : -1;
          if (!existing || score >= existingScore) dedupByDayTime.set(key, task);
        });

        const dayTotals = new Map<string, { small: number; medium: number; large: number; jumbo: number }>();
        dedupByDayTime.forEach((task: any, key: string) => {
          const [day, hhmm] = key.split('|');
          const payload = task?.data_payload || null;
          const syncToInventory = Boolean(payload?.sync_to_inventory);
          const fromTask = parsePayloadSizes(payload);
          const picked = syncToInventory
            ? eggByTaskId.get(String(task?.id)) || eggByDayTime.get(`${day}|${hhmm}`) || null
            : null;
          const sizes = picked ? parseCollectionSizes(picked) : fromTask;

          const acc = dayTotals.get(day) || { small: 0, medium: 0, large: 0, jumbo: 0 };
          acc.small += Number(sizes.small_eggs || 0);
          acc.medium += Number(sizes.medium_eggs || 0);
          acc.large += Number(sizes.large_eggs || 0);
          acc.jumbo += Number(sizes.jumbo_eggs || 0);
          dayTotals.set(day, acc);
        });

        const out: Array<{ date: string; small: number; medium: number; large: number; jumbo: number }> = [];
        for (let i = 0; i < 7; i++) {
          const day = DateTime.fromISO(startISO, { zone: 'utc' }).plus({ days: i }).toISODate() || startISO;
          const v = dayTotals.get(day) || { small: 0, medium: 0, large: 0, jumbo: 0 };
          out.push({ date: day, ...v });
        }
        setSizeHistory(out);
      } catch (err) {
        console.error('Failed loading egg size history', err);
        setSizeHistory([]);
      }
    };
    run();
  }, [selectedDate, eggTemplate?.id, currentFarm?.id, selectedFlockId]);

  const sizeGrowth = useMemo(() => {
    const today = totals.todayTotals;
    const yesterday = totals.yesterdayTotals || { small: 0, medium: 0, large: 0, jumbo: 0 };
    const daily = {
      small: Math.round(today.small - yesterday.small),
      medium: Math.round(today.medium - yesterday.medium),
      large: Math.round(today.large - yesterday.large),
      jumbo: Math.round(today.jumbo - yesterday.jumbo),
    };
    const first = sizeHistory[0] || { small: 0, medium: 0, large: 0, jumbo: 0 };
    const last = sizeHistory[sizeHistory.length - 1] || { small: 0, medium: 0, large: 0, jumbo: 0 };
    const weekly = {
      small: Math.round(last.small - first.small),
      medium: Math.round(last.medium - first.medium),
      large: Math.round(last.large - first.large),
      jumbo: Math.round(last.jumbo - first.jumbo),
    };
    const entries: Array<{ key: 'small' | 'medium' | 'large' | 'jumbo'; value: number }> = [
      { key: 'small', value: daily.small },
      { key: 'medium', value: daily.medium },
      { key: 'large', value: daily.large },
      { key: 'jumbo', value: daily.jumbo },
    ];
    entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    return { daily, weekly, topDaily: entries[0] };
  }, [totals.todayTotals, totals.yesterdayTotals, sizeHistory]);

  const chartData = useMemo(() => {
    const nowMinutes = getNowMinutesInFarmTz(farmTz);

    // For projection only when viewing today.
    // Respect already completed future intervals (backfill/early entry) as elapsed.
    const elapsedIndex = (() => {
      if (!isSelectedDateToday) return 0;
      let idx = -1;
      for (let i = 0; i < intervalTimes.length; i++) {
        const [hStr, mStr] = intervalTimes[i].split(':');
        const t = Number(hStr) * 60 + Number(mStr);
        if (t <= nowMinutes) idx = i;
      }
      let recordedIdx = -1;
      for (let i = 0; i < intervalTimes.length; i++) {
        const hhmm = intervalTimes[i];
        if ((tasksToday[hhmm] as any)?.status === 'completed') recordedIdx = i;
      }
      return Math.max(0, Math.max(idx, recordedIdx));
    })();

    // Day view should follow inventory (egg_collections) as source of truth.
    const getEggsForInterval = (timeHHMM: string, collectionByTime: Record<string, any>) => {
      const picked = collectionByTime[timeHHMM] || null;
      if (!picked) return 0;
      const fromSizes =
        Number(picked.small_eggs || 0) +
        Number(picked.medium_eggs || 0) +
        Number(picked.large_eggs || 0) +
        Number(picked.jumbo_eggs || 0);
      const total = Number(picked.total_eggs ?? fromSizes);
      return Number.isFinite(total) ? total : fromSizes;
    };

    const todayIntervalEggs = intervalTimes.map((timeHHMM) =>
      getEggsForInterval(timeHHMM, collectionsTodayByTime)
    );
    const yesterdayIntervalEggs = intervalTimes.map((timeHHMM) =>
      getEggsForInterval(timeHHMM, collectionsYesterdayByTime)
    );

    const eggsSoFar = todayIntervalEggs.slice(0, elapsedIndex + 1).reduce((a, b) => a + b, 0);
    const yesterdaySoFar = yesterdayIntervalEggs.slice(0, elapsedIndex + 1).reduce((a, b) => a + b, 0);
    const yesterdayTotal = yesterdayIntervalEggs.reduce((a, b) => a + b, 0);
    const recordedTodayTotal = Math.round(todayIntervalEggs.reduce((a, b) => a + b, 0));

    const todayCumAt = todayIntervalEggs.reduce<number[]>((acc, v, i) => {
      acc.push((acc[i - 1] || 0) + (v || 0));
      return acc;
    }, []);
    const yesterdayCumAt = yesterdayIntervalEggs.reduce<number[]>((acc, v, i) => {
      acc.push((acc[i - 1] || 0) + (v || 0));
      return acc;
    }, []);

    // Additive end-of-day projection at each elapsed time:
    // projectedEOD(t_i) = yesterdayEOD + (todaySoFar(t_i) - yesterdaySoFar(t_i))
    const projectedEODLine = intervalTimes.map((_, i) => {
      if (!isSelectedDateToday) return null;
      if (i > elapsedIndex) return null;
      const lead = (todayCumAt[i] || 0) - (yesterdayCumAt[i] || 0);
      const rawProjected = Math.max(0, Math.round(yesterdayTotal + lead));
      // Guard rail: if users already entered additional intervals (including backfill),
      // projected EOD should not display below today's recorded total.
      if (i === elapsedIndex) return Math.max(rawProjected, recordedTodayTotal);
      return rawProjected;
    });

    const projectedEOD = projectedEODLine[elapsedIndex] ?? null;

    // Keep these for backwards-compatible fields used elsewhere in the component.
    return {
      todayIntervalEggs,
      yesterdayIntervalEggs,
      projectedEODLine,
      elapsedIndex,
      projectedEOD,
      eggsSoFar,
      yesterdayTotal,
    };
  }, [
    intervalRows,
    intervalTimes,
    tasksToday,
    tasksYesterday,
    collectionsTodayByTime,
    collectionsYesterdayByTime,
    isSelectedDateToday,
    farmTz,
  ]);

  const projectedHeaderValue = useMemo(() => {
    if (curveView === 'hours') {
      return chartData.projectedEOD != null ? Math.round(chartData.projectedEOD) : null;
    }
    return null;
  }, [curveView, chartData.projectedEOD]);

  const expected = useMemo(() => {
    if (!isSelectedDateToday) return null;
    const yesterdayTotal = chartData.yesterdayTotal || 0;
    if (yesterdayTotal <= 0) return { ratio: 0, status: 'on_track' as const };
    const projectedEOD = chartData.projectedEOD ?? 0;
    const ratio = projectedEOD / yesterdayTotal;
    let status = 'on_track' as 'ahead' | 'on_track' | 'behind';
    if (ratio >= 1.05) status = 'ahead';
    else if (ratio <= 0.95) status = 'behind';
    return { ratio, status, projectedEOD, yesterdayTotal };
  }, [chartData, isSelectedDateToday]);

  const alerts = useMemo(() => {
    if (!isSelectedDateToday) return [];
    const idx = chartData.elapsedIndex;
    const yesterdaySoFar = chartData.yesterdayIntervalEggs.slice(0, idx + 1).reduce((a, b) => a + b, 0);
    const todaySoFar = chartData.eggsSoFar;
    if (yesterdaySoFar <= 0) return [];

    const ratio = todaySoFar / yesterdaySoFar;
    type EggAlertType =
      | 'production_dropping_hard'
      | 'production_trend_warning'
      | 'trend_looks_stable'
      | 'not_enough_yesterday_data'
      | 'size_growth_update';

    const list: Array<{
      severity: 'critical' | 'warning' | 'info';
      type: EggAlertType;
      vars?: Record<string, string | number>;
    }> = [];

    if (ratio < 0.6) {
      list.push({
        severity: 'critical',
        type: 'production_dropping_hard',
        vars: { today: todaySoFar.toFixed(0), yesterday: yesterdaySoFar.toFixed(0) },
      });
    } else if (ratio < 0.85) {
      list.push({
        severity: 'warning',
        type: 'production_trend_warning',
        vars: { today: todaySoFar.toFixed(0), yesterday: yesterdaySoFar.toFixed(0) },
      });
    } else {
      list.push({
        severity: 'info',
        type: 'trend_looks_stable',
        vars: { ratioPct: Math.round(ratio * 100) },
      });
    }

    const top = sizeGrowth.topDaily;
    if (top && Math.abs(top.value) >= 1) {
      const label =
        top.key === 'small'
          ? 'Small'
          : top.key === 'medium'
          ? 'Medium'
          : top.key === 'large'
          ? 'Large'
          : 'Jumbo';
      list.push({
        severity: Math.abs(top.value) >= 10 ? 'warning' : 'info',
        type: 'size_growth_update',
        vars: {
          size: label,
          delta: Math.abs(top.value),
          direction: top.value >= 0 ? 'up' : 'down',
        },
      });
    }

    return list;
  }, [chartData, isSelectedDateToday, sizeGrowth.topDaily]);

  const canEditInterval = useMemo(() => {
    if (readOnly) return false;
    if (!eggTemplate) return false;
    if (!currentRole) return false;
    const allowed = eggTemplate.allowed_roles_to_complete || ['owner', 'manager', 'worker'];
    return allowed.includes(currentRole);
  }, [eggTemplate, currentRole, readOnly]);

  const handleOpenModal = (timeHHMM: string) => {
    const row = intervalRows.find((r) => r.timeHHMM === timeHHMM);
    if (!row) return;

    const payload = row.task?.data_payload || {};
    const sync = row.task
      ? Boolean(payload?.sync_to_inventory)
      : defaultSyncToInventory;

    setModalIntervalTime(timeHHMM);
    setModalInitialSync(sync);
    setModalInitialSizes({
      ...row.sizes,
      notes: row.sizes.notes || (payload?.notes ?? null),
    });
    setShowModal(true);
  };

  const handleModalSaved = async () => {
    if (!eggTemplate?.id) return;
    setSavingFromModal(true);
    try {
      const prevDate = DateTime.fromISO(selectedDate, { zone: 'utc' }).minus({ days: 1 }).toISODate();
      const [todayMap, yMap, todayCollMap, yCollMap] = await Promise.all([
        loadTasksForDate(selectedDate),
        loadTasksForDate(prevDate || selectedDate),
        loadCollectionsForDate(selectedDate),
        loadCollectionsForDate(prevDate || selectedDate),
      ]);
      setTasksToday(todayMap || {});
      setTasksYesterday(yMap || {});
      setCollectionsTodayByTime(todayCollMap || {});
      setCollectionsYesterdayByTime(yCollMap || {});
    } finally {
      setSavingFromModal(false);
    }
  };

  const pieData = useMemo(() => {
    const { todayTotals } = totals;
    const mk = (name: string, value: number) => ({ name, value });
    // If nothing exists, keep zeros so PieChart still renders.
    return [
      mk('Small', todayTotals.small),
      mk('Medium', todayTotals.medium),
      mk('Large', todayTotals.large),
      mk('Jumbo', todayTotals.jumbo),
    ];
  }, [totals]);

  const COLORS = {
    Small: '#F59E0B',
    Medium: '#60A5FA',
    Large: '#34D399',
    Jumbo: '#F87171',
  } as const;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-4 border border-gray-100 animate-fade-in">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Egg className="w-4 h-4" />
          {t('tasks.egg_interval.loading')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Egg className="w-5 h-5 text-[#3D5F42]" />
            {t('tasks.egg_interval.header')}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {eggTemplate ? (
              <>
                {t('tasks.egg_interval.schedule')}:{' '}
                {intervalTimes.length > 0 ? intervalTimes.join(', ') : t('tasks.egg_interval.not_configured')} •{' '}
                {t('tasks.egg_interval.template')}:{' '}
                {eggTemplate.title}
              </>
            ) : (
              t('tasks.egg_interval.template_not_found')
            )}
          </p>
          {!isSelectedDateToday && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mt-2 inline-block">
              {t('tasks.egg_interval.historical_entry')}
            </p>
          )}
        </div>
        {!hideDatePicker && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 bg-white">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) =>
                  isDateControlled ? onSelectedDateChange!(e.target.value) : setInternalSelectedDate(e.target.value)
                }
                className="text-sm font-medium text-gray-900 outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {flocks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="border border-gray-200 rounded-xl p-3 bg-white">
            <label className="block text-xs font-semibold text-gray-700 mb-2">{t('tasks.egg_interval.flock')}</label>
            <select
              value={selectedFlockId || ''}
              onChange={(e) => setSelectedFlockId(e.target.value || null)}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
            >
              {flocks.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          <div className="border border-gray-200 rounded-xl p-3 bg-white">
            <label className="block text-xs font-semibold text-gray-700 mb-2">{t('tasks.egg_interval.mode')}</label>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-gray-50 text-gray-700">
                <Clock className="w-3.5 h-3.5 mr-1" />
                {t('tasks.egg_interval.times_per_day', { count: intervalTimes.length })}
              </span>
              <span className="text-xs text-gray-500">
                {t('tasks.egg_interval.configured_in_task_settings')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setCurveExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white hover:bg-gray-50"
          aria-expanded={curveExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{t('tasks.egg_interval.curve_card_title')}</div>
            <div className="text-[11px] text-gray-500 whitespace-nowrap">
              {intervalTimes.length} {t('tasks.egg_interval.intervals')}
            </div>
          </div>
          <div className="text-xs text-gray-600 font-medium whitespace-nowrap">
            {curveExpanded ? t('common.hide') : t('common.show')}
          </div>
        </button>

        {curveExpanded && (
          <div className="p-3 pt-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-gray-900">{t('tasks.egg_interval.curve_card_title')}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t('tasks.egg_interval.curve_description')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={curveView}
                  onChange={(e) => setCurveView(e.target.value as 'hours' | 'day' | 'week' | 'month')}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                >
                  <option value="hours">{dayOptionLabel}</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
                {curveView === 'hours' && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">{t('tasks.egg_interval.projected_eod')}</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {projectedHeaderValue != null ? projectedHeaderValue.toLocaleString() : '-'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-52 mt-2 w-full min-w-0">
              <ResponsiveContainer width="100%" height={200}>
                {curveView === 'hours' ? (
                  <LineChart
                    data={intervalTimes.map((time, i) => {
                      const rawToday = Math.round(chartData.todayIntervalEggs[i] || 0);
                      const today =
                        isSelectedDateToday && i > chartData.elapsedIndex ? null : rawToday;
                      return {
                        time,
                        today,
                        yesterday: Math.round(chartData.yesterdayIntervalEggs[i] || 0),
                        projectedEOD:
                          chartData.projectedEODLine?.[i] != null
                            ? Math.round(chartData.projectedEODLine[i] || 0)
                            : undefined,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(value: any) => Math.round(Number(value || 0)).toLocaleString()} />
                    <Line
                      type="monotone"
                      dataKey="today"
                      stroke="#3D5F42"
                      strokeWidth={2}
                      dot={false}
                      name={t('tasks.egg_interval.today')}
                      activeDot={(props: any) => {
                        const idx = Number(props?.index ?? -1);
                        if (idx !== chartData.elapsedIndex) return <></>;
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={5}
                            fill="#3D5F42"
                            stroke="#A7F3D0"
                            strokeWidth={2}
                            className="animate-pulse"
                          />
                        );
                      }}
                    />
                    <Line type="monotone" dataKey="yesterday" stroke="#60A5FA" strokeWidth={2} dot={false} name={t('tasks.egg_interval.yesterday')} />
                    {isSelectedDateToday && (
                      <Line
                        type="monotone"
                        dataKey="projectedEOD"
                        stroke="#F59E0B"
                        strokeWidth={2}
                        dot={false}
                        name={t('tasks.egg_interval.projected_eod')}
                      />
                    )}
                  </LineChart>
                ) : (
                  <LineChart
                    data={(periodCurve?.labels || []).map((label, i) => {
                      let displayLabel = label;
                      if (curveView === 'day') {
                        // Day view uses weekday labels directly (Mon..Sun).
                        displayLabel = String(label);
                      }
                      const currentRaw =
                        periodCurve?.current?.[i] != null
                          ? Math.round(Number(periodCurve?.current?.[i] || 0))
                          : undefined;
                      const current =
                        isSelectedDateToday && i > (periodCurve?.elapsedIndex ?? 0)
                          ? null
                          : currentRaw;
                      return {
                        label: displayLabel,
                        value: current,
                      };
                    })}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip formatter={(value: any) => Math.round(Number(value || 0)).toLocaleString()} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3D5F42"
                      strokeWidth={2}
                      dot={false}
                      name={
                        curveView === 'day'
                          ? 'Collected (day trend)'
                          : curveView === 'week'
                          ? 'Collected (week)'
                          : 'Collected (month)'
                      }
                      activeDot={(props: any) => {
                        const idx = Number(props?.index ?? -1);
                        const tipIndex = Number(periodCurve?.elapsedIndex ?? -1);
                        if (idx !== tipIndex) return <></>;
                        return (
                          <circle
                            cx={props.cx}
                            cy={props.cy}
                            r={5}
                            fill="#3D5F42"
                            stroke="#A7F3D0"
                            strokeWidth={2}
                            className="animate-pulse"
                          />
                        );
                      }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {curveView !== 'hours' && periodCurve && (
              <div className="mt-2">
                <div className="bg-[#3D5F42]/5 border border-[#3D5F42]/10 rounded-xl p-2">
                  <div className="text-xs text-gray-600">
                    {curveView === 'day'
                      ? 'Day trend total collected'
                      : curveView === 'week'
                      ? 'Week total collected'
                      : 'Month total collected'}
                  </div>
                  <div className="text-lg font-bold text-gray-900">{Math.round(periodCurve.currentTotal).toLocaleString()}</div>
                </div>
              </div>
            )}

            {curveView === 'hours' && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border border-gray-200 rounded-xl p-2">
                <h4 className="font-semibold text-gray-900 text-sm">{t('tasks.egg_interval.size_distribution_today')}</h4>
                <div className="h-36 mt-2 w-full min-w-0">
                  <ResponsiveContainer width="100%" height={150}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={55}
                        innerRadius={30}
                        labelLine={false}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={(COLORS as any)[entry.name] || '#9CA3AF'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-600 flex-wrap">
                  {pieData.map((e) => (
                    <span key={e.name} className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: (COLORS as any)[e.name] || '#9CA3AF' }} />
                      {e.name}: {Math.round(
                        e.name === 'Small'
                          ? totals.todayTotals.small
                          : e.name === 'Medium'
                          ? totals.todayTotals.medium
                          : e.name === 'Large'
                          ? totals.todayTotals.large
                          : totals.todayTotals.jumbo
                      )}
                    </span>
                  ))}
                </div>
                <div className="mt-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <div className="text-[11px] font-semibold text-gray-700">Size growth vs yesterday</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                    <div>S: {sizeGrowth.daily.small >= 0 ? '+' : ''}{sizeGrowth.daily.small}</div>
                    <div>M: {sizeGrowth.daily.medium >= 0 ? '+' : ''}{sizeGrowth.daily.medium}</div>
                    <div>L: {sizeGrowth.daily.large >= 0 ? '+' : ''}{sizeGrowth.daily.large}</div>
                    <div>J: {sizeGrowth.daily.jumbo >= 0 ? '+' : ''}{sizeGrowth.daily.jumbo}</div>
                  </div>
                  <div className="mt-1 text-[10px] text-gray-500">
                    7-day net: S {sizeGrowth.weekly.small >= 0 ? '+' : ''}{sizeGrowth.weekly.small}, M {sizeGrowth.weekly.medium >= 0 ? '+' : ''}{sizeGrowth.weekly.medium}, L {sizeGrowth.weekly.large >= 0 ? '+' : ''}{sizeGrowth.weekly.large}, J {sizeGrowth.weekly.jumbo >= 0 ? '+' : ''}{sizeGrowth.weekly.jumbo}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="bg-[#3D5F42]/5 border border-[#3D5F42]/10 rounded-xl p-2">
                    <div className="text-xs text-gray-600">{t('tasks.egg_interval.total')}</div>
                    <div className="text-lg font-bold text-gray-900">{Math.round(totals.todayTotals.total).toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500">{t('tasks.egg_interval.good_eggs')}</div>
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-2">
                    <div className="text-xs text-gray-600">{t('tasks.egg_interval.percent_vs_prev')}</div>
                    <div className="text-lg font-bold text-gray-900">
                      {totals.yesterdayTotal > 0
                        ? `${Math.round(((totals.todayTotals.total - totals.yesterdayTotal) / totals.yesterdayTotal) * 100)}%`
                        : '-'}
                    </div>
                    <div className="text-[10px] text-gray-500">{t('tasks.egg_interval.same_intervals')}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-2">
                    <div className="text-xs text-gray-600">{t('tasks.egg_interval.projected')}</div>
                    <div className="text-lg font-bold text-gray-900">
                      {chartData.projectedEOD != null ? Math.round(chartData.projectedEOD).toLocaleString() : '-'}
                    </div>
                    <div className="text-[10px] text-gray-500">{t('tasks.egg_interval.eod_estimate')}</div>
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{t('tasks.egg_interval.progress_vs_expected')}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {expected ? (
                          <>
                            {t('tasks.egg_interval.status')}:{' '}
                            <span className="font-semibold">
                              {t(`tasks.egg_interval.status_${expected.status}`)}
                            </span>
                          </>
                        ) : (
                          t('tasks.egg_interval.projection_only_for_today')
                        )}
                      </div>
                    </div>
                    {expected && (
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Lay %</div>
                        <div className="text-lg font-bold text-gray-900">{Math.round(expected.ratio * 100)}%</div>
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    {expected ? (
                      <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-3 rounded-full bg-[#3D5F42]"
                          style={{ width: `${Math.min(100, Math.max(0, expected.ratio * 100))}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-3 w-full bg-gray-100 rounded-full" />
                    )}
                  </div>
                </div>

                <div className="border border-gray-200 rounded-xl p-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">{t('tasks.egg_interval.alerts_title')}</h4>
                  </div>
                  <div className="mt-2 space-y-2">
                    {alerts.length === 0 ? (
                    <div className="text-xs text-gray-600">{t('tasks.egg_interval.no_alerts_right_now')}</div>
                    ) : (
                      alerts.slice(0, 2).map((a, idx) => (
                        <div
                          key={idx}
                          className={`rounded-xl border p-2 text-xs ${
                            a.severity === 'critical'
                              ? 'bg-red-50 border-red-200 text-red-800'
                              : a.severity === 'warning'
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-blue-50 border-blue-200 text-blue-900'
                          }`}
                        >
                        <div className="font-semibold">{t(`tasks.egg_interval.alerts.${a.type}.title`)}</div>
                        <div className="mt-1 text-[11px]">
                          {t(
                            `tasks.egg_interval.alerts.${a.type}.description`,
                            (a.vars || {}) as Record<string, string | number>
                          )}
                        </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Interval Table */}
      {!readOnly && (
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setIntervalsExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 bg-white hover:bg-gray-50"
          aria-expanded={intervalsExpanded}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{t('tasks.egg_interval.interval_entries_title')}</div>
            <div className="text-[11px] text-gray-500 whitespace-nowrap">
              {intervalTimes.length} {t('tasks.egg_interval.intervals')}
            </div>
          </div>
          <div className="text-xs text-gray-600 font-medium whitespace-nowrap">
            {intervalsExpanded ? t('common.hide') : t('common.show')}
          </div>
        </button>

        {intervalsExpanded && (
          <div className="p-3 pt-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-gray-600 mt-1">
                  {t('tasks.egg_interval.interval_edit_description')}
                </p>
              </div>
              {savingFromModal && <div className="text-xs text-gray-500 mt-1">{t('tasks.egg_interval.updating')}</div>}
            </div>

            {intervalTimes.length === 0 ? (
              <div className="mt-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
                {t('tasks.egg_interval.no_times_configured')}
                {canManageTasks && (
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        document.getElementById('tasks-settings-button')?.click();
                      }}
                      className="px-4 py-2 bg-[#3D5F42] text-white rounded-xl text-sm font-semibold hover:bg-[#2F4A34] transition-colors"
                    >
                      {t('tasks.egg_interval.open_task_settings')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {intervalRows.map((row) => {
                  const isComplete = row.task?.status === 'completed';
                  const syncLabel = row.sync ? t('tasks.egg_interval.synced') : t('tasks.egg_interval.task_only');
                  return (
                    <div
                      key={row.timeHHMM}
                      className={`border rounded-xl p-2 flex items-start justify-between gap-2 ${
                        isComplete ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-100'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          <div className="font-semibold text-gray-900 text-sm">{row.timeHHMM}</div>
                          <span
                            className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                              row.sync
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : 'bg-gray-100 border-gray-200 text-gray-700'
                            }`}
                          >
                            {syncLabel}
                          </span>
                        </div>

                        <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-[11px] text-gray-700">
                          <div className="text-center">
                            <div className="font-semibold text-gray-900">S</div>
                            <div>{row.sizes.small_eggs}</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-900">M</div>
                            <div>{row.sizes.medium_eggs}</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-900">L</div>
                            <div>{row.sizes.large_eggs}</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-900">J</div>
                            <div>{row.sizes.jumbo_eggs}</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-900">Dam</div>
                            <div>{row.sizes.damaged_eggs}</div>
                          </div>
                        </div>

                        {row.notes ? (
                          <div className="text-[10px] text-gray-500 mt-1 truncate">{row.notes}</div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end">
                        <button
                          onClick={() => handleOpenModal(row.timeHHMM)}
                          className="px-2.5 py-1.5 bg-[#3D5F42] text-white text-[11px] rounded-xl hover:bg-[#2F4A34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canEditInterval || !eggTemplate}
                        >
                          {row.task ? t('tasks.egg_interval.edit') : t('tasks.egg_interval.add')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Modal */}
      {!readOnly && showModal && eggTemplate && (
        <EggIntervalEntryModal
          onClose={() => setShowModal(false)}
          onSaved={handleModalSaved}
          eggTemplate={eggTemplate}
          existingTask={intervalRows.find((r) => r.timeHHMM === modalIntervalTime)?.task || null}
          collectionDate={selectedDate}
          intervalTimeHHMM={modalIntervalTime}
          flockId={selectedFlockId}
            intervalGranularity={intervalGranularity}
          eggsPerTray={eggsPerTray}
          canComplete={canEditInterval}
          canSyncToInventory={canSyncToInventory}
          initialSyncToInventory={modalInitialSync}
          initialSizes={modalInitialSizes}
        />
      )}
    </div>
  );
}

