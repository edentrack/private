import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Check, Plus, Clock, AlertCircle, Edit2, Trash2, X, Save, Egg } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  ensureTasksGeneratedForDate,
  getTasksForDate,
  getFlockTypesForFarm,
  normalizeAndDedupTasksForDate,
  TaskWithMetadata,
} from '../../utils/unifiedTaskSystem';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useTranslation } from 'react-i18next';
import { EggIntervalEntryModal } from '../tasks/egg/EggIntervalEntryModal';
import { EggIntervalSizes, getTotalGoodEggs } from '../../utils/eggIntervalTaskSync';
import { TaskTemplate } from '../../types/database';
import { farmLocalToUtcIso, formatFarmTimeForViewer, getFarmTimeZone, getNowMinutesInFarmTz, getUiTimeFormat, formatFarmClockWithFormat } from '../../utils/farmTime';

interface TodayTasksWidgetProps {
  onAddTask: () => void;
  selectedFlockId: string | null;
}

interface ExtendedTask extends TaskWithMetadata {
  critical?: boolean;
  auto_generated?: boolean;
}

export function TodayTasksWidget({ onAddTask, selectedFlockId }: TodayTasksWidgetProps) {
  const { currentFarm, user, currentRole } = useAuth();
  const { farmPermissions } = usePermissions();
  const canAddTasks = currentRole?.toLowerCase() !== 'worker' && currentRole?.toLowerCase() !== 'viewer';
  const { t } = useTranslation();
  const farmTz = getFarmTimeZone(currentFarm);
  const getLocalTodayISO = useCallback(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);
  const [timeDisplayFormat, setTimeDisplayFormat] = useState<'24h' | '12h'>(() => getUiTimeFormat());
  const [localTodayISO, setLocalTodayISO] = useState<string>(() => getLocalTodayISO());

  useEffect(() => {
    const onStorage = () => setTimeDisplayFormat(getUiTimeFormat());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const [tasks, setTasks] = useState<ExtendedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTime, setEditTime] = useState<string>('');
  const [showAllTasks, setShowAllTasks] = useState(false);
  const TASKS_LIMIT = 5;

  const [eggTemplate, setEggTemplate] = useState<TaskTemplate | null>(null);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [eggIntervals, setEggIntervals] = useState<string[]>([]);

  const [eggModalOpen, setEggModalOpen] = useState(false);
  const [eggModalTimeHHMM, setEggModalTimeHHMM] = useState<string>('00:00');
  const [showAllEggIntervals, setShowAllEggIntervals] = useState(false);
  const [eggSelectedDateISO, setEggSelectedDateISO] = useState<string>(() => getLocalTodayISO());
  /** Egg interval rows: same source as Tasks page (per-interval task rows + egg_collections). */
  const [eggTaskByHHMM, setEggTaskByHHMM] = useState<Record<string, ExtendedTask>>({});
  const [eggCollectionsByTime, setEggCollectionsByTime] = useState<Record<string, any>>({});
  const lastFarmDaySeenRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentFarm?.id) {
      setEggSelectedDateISO(getLocalTodayISO());
    }
  }, [currentFarm?.id, getLocalTodayISO]);

  useEffect(() => {
    const bumpLocalIfNewDay = () => {
      const localToday = getLocalTodayISO();
      const prev = lastFarmDaySeenRef.current;
      if (prev !== null && localToday !== prev) {
        setLocalTodayISO(localToday);
        setEggSelectedDateISO((d) => (d === prev ? localToday : d));
      }
      lastFarmDaySeenRef.current = localToday;
    };
    bumpLocalIfNewDay();
    const id = setInterval(bumpLocalIfNewDay, 60_000);
    const onVis = () => bumpLocalIfNewDay();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [getLocalTodayISO]);

  function normalizeTimeToHHMM(value: any) {
    if (!value) return '';
    return String(value).slice(0, 5);
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

  function resolveIntervalSizes(
    timeHHMM: string,
    task: any,
    collectionByTime: Record<string, any>
  ): EggIntervalSizes {
    const payload = task?.data_payload || null;
    const taskSizes = parsePayloadSizes(payload);
    const syncToInventory = Boolean(payload?.sync_to_inventory);
    if (!syncToInventory) return taskSizes;
    const byTaskId = task?.id
      ? Object.values(collectionByTime).find(
          (c: any) => String(c?.source_task_id || '') === String(task.id)
        )
      : null;
    const byTime = collectionByTime[timeHHMM] || null;
    const picked = (byTaskId || byTime) as any;
    if (!picked) return taskSizes;
    return parseCollectionSizes(picked);
  }

  const loadTasks = useCallback(
    async (dateISO: string) => {
      if (!currentFarm?.id) {
        return;
      }

      setLoading(true);
      try {
        const date = dateISO;
        const flockTypes = await getFlockTypesForFarm(supabase, currentFarm.id);
        // Same pipeline as Tasks page: generate missing rows, dedupe, then read.
        await ensureTasksGeneratedForDate(supabase, currentFarm.id, date, flockTypes, farmTz);
        await normalizeAndDedupTasksForDate(supabase, currentFarm.id, date);
        const tasksData = await getTasksForDate(supabase, currentFarm.id, date, true, flockTypes, farmTz);
        setTasks(
          (tasksData as ExtendedTask[]).filter((task: any) => task.templateIsActive && task.templateIsEnabled)
        );

        const [farmRow, eggTemplatesRes] = await Promise.all([
          supabase.from('farms').select('eggs_per_tray').eq('id', currentFarm.id).maybeSingle(),
          supabase
            .from('task_templates')
            .select('*')
            .eq('farm_id', currentFarm.id)
            .eq('icon', 'egg')
            .order('display_order', { ascending: true })
            .limit(5),
        ]);

        if (farmRow?.data?.eggs_per_tray) {
          setEggsPerTray(Number(farmRow.data.eggs_per_tray) || 30);
        }

        const templates = eggTemplatesRes?.data || [];
        const egg =
          (templates || []).find((t: any) => String(t.title).toLowerCase().includes('egg')) ||
          templates[0] ||
          null;
        setEggTemplate(egg);

        const rawTimes: string[] = Array.isArray(egg?.scheduled_times) ? egg!.scheduled_times : [];
        const cleaned = rawTimes
          .map((t) => String(t).trim().slice(0, 5))
          .filter((x) => /^\d{2}:\d{2}$/.test(x));
        setEggIntervals(Array.from(new Set(cleaned)).sort());

        if (egg?.id) {
          const scoreTask = (t: any) => {
            const hasPayload = !!(t?.data_payload && Object.keys(t.data_payload).length > 0);
            const isCompleted = t?.status === 'completed';
            return (isCompleted ? 2 : 0) + (hasPayload ? 1 : 0);
          };

          const { data: eggTaskRows, error: eggTaskErr } = await supabase
            .from('tasks')
            .select(
              'id, status, scheduled_time, scheduled_for, due_date, data_payload, flock_id, template_id, title_override'
            )
            .eq('farm_id', currentFarm.id)
            .eq('template_id', egg.id)
            .or(`due_date.eq.${date},scheduled_for.eq.${date}`)
            .order('scheduled_time', { ascending: true });

          if (eggTaskErr) throw eggTaskErr;

          const rows = (eggTaskRows || []) as any[];
          const scopedRows = (() => {
            if (!selectedFlockId) return rows;
            const exact = rows.filter((r) => r.flock_id === selectedFlockId);
            if (exact.length > 0) return exact;
            return rows.filter((r) => r.flock_id == null);
          })();

          const taskMap: Record<string, ExtendedTask> = {};
          scopedRows.forEach((t: any) => {
            const hhmm = normalizeTimeToHHMM(
              t.scheduled_time ||
                (t.scheduled_for ? String(t.scheduled_for).slice(11, 16) : '') ||
                t.data_payload?.interval_time ||
                t.data_payload?.intervalTimeHHMM
            );
            if (!hhmm) return;
            const existing = taskMap[hhmm];
            if (!existing || scoreTask(t) >= scoreTask(existing)) {
              taskMap[hhmm] = t as ExtendedTask;
            }
          });

          const { data: collRows, error: collErr } = await supabase
            .from('egg_collections')
            .select(
              'id, source_task_id, source_interval_key, interval_start_at, flock_id, collection_date, collected_on, small_eggs, medium_eggs, large_eggs, jumbo_eggs, total_eggs, damaged_eggs'
            )
            .eq('farm_id', currentFarm.id)
            .or(`collection_date.eq.${date},collected_on.eq.${date}`);

          if (collErr) throw collErr;

          const collList = (collRows || []) as any[];
          const scopedColl = (() => {
            if (!selectedFlockId) return collList;
            const exact = collList.filter((r) => r.flock_id === selectedFlockId);
            if (exact.length > 0) return exact;
            return collList.filter((r) => r.flock_id == null);
          })();

          const collMap: Record<string, any> = {};
          scopedColl.forEach((c: any) => {
            const hhmmFromKey = (() => {
              const m = String(c?.source_interval_key || '').match(/(\d{2}:\d{2})/);
              return m?.[1] || '';
            })();
            const hhmm = normalizeTimeToHHMM(
              hhmmFromKey ||
                (c?.interval_start_at ? new Date(c.interval_start_at).toISOString().slice(11, 16) : '')
            );
            if (!hhmm) return;
            collMap[hhmm] = c;
          });

          setEggTaskByHHMM(taskMap);
          setEggCollectionsByTime(collMap);
        } else {
          setEggTaskByHHMM({});
          setEggCollectionsByTime({});
        }
      } catch (error) {
        console.error('Error loading tasks:', error);
      } finally {
        setLoading(false);
      }
    },
    [currentFarm?.id, farmTz, selectedFlockId]
  );

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadTasks(eggSelectedDateISO);
  }, [currentFarm?.id, selectedFlockId, eggSelectedDateISO, loadTasks]);


  const toggleTask = async (taskId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      const { error } = await supabase
        .from('tasks')
        .update({
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
          completed_by: newStatus === 'completed' && user ? user.id : null
        })
        .eq('id', taskId);

      if (!error) {
        if (newStatus === 'completed') {
          setShowAllTasks(false);
        }
        loadTasks(eggSelectedDateISO);
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleEditTask = (task: ExtendedTask) => {
    const fromScheduledTime =
      task.scheduled_time ? String(task.scheduled_time).slice(0, 5) : '';
    const fromScheduledFor =
      !fromScheduledTime && task.scheduled_for
        ? new Date(task.scheduled_for).toTimeString().slice(0, 5)
        : '';
    setEditTime(fromScheduledTime || fromScheduledFor);
    setEditingTaskId(task.id);
  };

  const handleSaveTime = async (task: ExtendedTask) => {
    if (!editTime) return;

    try {
      const dueDate = task.due_date
        ? String(task.due_date).slice(0, 10)
        : String(task.scheduled_for || '').slice(0, 10);

      const scheduledTsISO = farmLocalToUtcIso({ dateISO: dueDate, timeHHMM: editTime, farmTz });
      // Simple 2h window for dashboard edits (in UTC).
      const windowEndISO = new Date(new Date(scheduledTsISO).getTime() + 2 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from('tasks')
        .update({
          scheduled_time: editTime,
          // scheduled_for is DATE in your schema
          scheduled_for: dueDate,
          window_start: scheduledTsISO,
          window_end: windowEndISO
        })
        .eq('id', task.id);

      if (!error) {
        setEditingTaskId(null);
        setEditTime('');
        loadTasks(eggSelectedDateISO);
      }
    } catch (error) {
      console.error('Error updating task time:', error);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm(t('tasks.confirm_delete'))) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (!error) {
        setShowAllTasks(false);
        loadTasks(eggSelectedDateISO);
      }
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const getTaskStatus = (task: TaskWithMetadata) => {
    if (task.status === 'completed') return { label: t('dashboard.completed'), color: 'text-gray-400' };
    if (task.isOverdue) return { label: t('dashboard.overdue'), color: 'text-red-600' };

    const now = new Date();
    let taskTime: Date;
    if (task.scheduled_time) {
      const hhmm = String(task.scheduled_time).slice(0, 5);
      const dueDate = task.due_date
        ? String(task.due_date).slice(0, 10)
        : String(task.scheduled_for || '').slice(0, 10);
      taskTime = new Date(farmLocalToUtcIso({ dateISO: dueDate, timeHHMM: hhmm, farmTz }));
    } else {
      taskTime = new Date(task.scheduled_for);
    }
    const diffMs = taskTime.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins <= 60 && diffMins > 0) return { label: t('dashboard.due_soon'), color: 'text-orange-600' };
    return { label: '', color: 'text-gray-900' };
  };

  const formatTime = (scheduledFor: string) => {
    return new Date(scheduledFor).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatTaskTime = (task: TaskWithMetadata) => {
    if (task.scheduled_time) {
      const hhmm = String(task.scheduled_time).slice(0, 5); // HH:MM
      const dueDate = task.due_date
        ? String(task.due_date).slice(0, 10)
        : String(task.scheduled_for || '').slice(0, 10);
      return formatFarmTimeForViewer({ dateISO: dueDate, timeHHMM: hhmm, farmTz });
    }
    return task.scheduled_for ? formatTime(task.scheduled_for) : '';
  };

  const loadingUI = (
    <div className="bg-white rounded-2xl border border-gray-200 p-2.5">
      <div className="flex items-center gap-2 mb-2">
        <Check className="w-4 h-4 text-[#3D5F42]" />
        <h2 className="text-sm font-bold text-gray-900">{t('dashboard.today_tasks')}</h2>
      </div>
      <div className="text-center py-3 text-xs text-gray-500">{t('loading')}</div>
    </div>
  );

  const dailyTasks = tasks.filter((task: any) => task.templateIcon !== 'egg');

  const overdueTasks = dailyTasks.filter((task: any) => task.status === 'pending' && task.isOverdue);
  const dueSoonTasks = dailyTasks.filter(
    (task: any) => task.status === 'pending' && !task.isOverdue && getTaskStatus(task).label === t('dashboard.due_soon')
  );
  const upcomingTasks = dailyTasks.filter((task: any) => task.status === 'pending' && !task.isOverdue && getTaskStatus(task).label === '');
  const completedTasks = dailyTasks.filter((task: any) => task.status === 'completed');

  const allPendingTasks = [...overdueTasks, ...dueSoonTasks, ...upcomingTasks];
  const totalPendingTasks = allPendingTasks.length;

  const visiblePendingTasks = showAllTasks ? allPendingTasks : allPendingTasks.slice(0, TASKS_LIMIT);
  const hiddenTasksCount = Math.max(0, totalPendingTasks - TASKS_LIMIT);

  const renderTask = (task: ExtendedTask) => {
    const status = getTaskStatus(task);
    const isCompleted = task.status === 'completed';
    const descriptionRaw = (task as any).data_payload?.description ?? '';
    const description = typeof descriptionRaw === 'string' ? descriptionRaw : descriptionRaw ? JSON.stringify(descriptionRaw) : '';
    const isEditing = editingTaskId === task.id;

    return (
      <div
        key={task.id}
        className={`flex items-start gap-2 p-2 rounded-lg border-l-2 transition-all ${
          isCompleted
            ? 'border-l-green-500 bg-green-50/50 opacity-75'
            : task.isOverdue
            ? 'border-l-red-500 bg-red-50'
            : 'border-l-blue-500 bg-gray-50/50'
        }`}
      >
        <button
          onClick={() => toggleTask(task.id, task.status)}
          className={`task-checkbox flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors mt-0.5 cursor-pointer ${
            isCompleted
              ? 'bg-[#3D5F42] border-[#3D5F42]'
              : 'border-gray-400 hover:border-[#3D5F42] hover:bg-[#3D5F42]/10'
          }`}
        >
          {isCompleted && <Check className="w-2.5 h-2.5 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className={`text-xs font-medium ${isCompleted ? 'line-through text-gray-400' : status.color}`}>
              {task.title_override || task.templateTitle}
            </div>
            {task.critical && !isCompleted && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-600">
                <AlertCircle className="w-2.5 h-2.5" />
                CRITICAL
              </span>
            )}
          </div>
          {description && (
            <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{description}</p>
          )}
          {isEditing ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <input
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                className="text-xs border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#3D5F42] bg-white text-gray-900"
              />
              <button
                onClick={() => handleSaveTime(task)}
                className="p-0.5 text-[#3D5F42] hover:bg-[#3D5F42]/10 rounded"
              >
                <Save className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  setEditingTaskId(null);
                  setEditTime('');
                }}
                className="p-0.5 text-gray-500 hover:bg-gray-100 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className={`w-2.5 h-2.5 ${status.color}`} />
              <span className={`text-[10px] ${status.color}`}>
                {formatTaskTime(task)}
              </span>
            </div>
          )}
        </div>

        {!isCompleted && !isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => handleEditTask(task)}
              className="p-1 text-gray-400 hover:text-[#3D5F42] hover:bg-[#3D5F42]/10 rounded transition-colors"
              title={t('tasks.edit_time')}
            >
              <Edit2 className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleDeleteTask(task.id)}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
              title={t('tasks.delete_task')}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const completionRate = dailyTasks.length > 0
    ? Math.round((completedTasks.length / dailyTasks.length) * 100)
    : 0;

  const canCompleteEgg = useMemo(() => {
    if (!currentRole) return false;
    const allowed = eggTemplate?.allowed_roles_to_complete || ['owner', 'manager', 'worker'];
    return allowed.includes(currentRole as any);
  }, [currentRole, eggTemplate]);

  const canSyncToInventoryEgg = useMemo(() => {
    if (!currentRole) return false;
    if (currentRole === 'owner') return true;
    if (currentRole === 'manager') return !!farmPermissions?.managers_can_edit_eggs;
    return false;
  }, [currentRole, farmPermissions?.managers_can_edit_eggs]);

  const intervalGranularity = useMemo(() => {
    return eggIntervals.length === 24 ? ('hourly' as const) : ('every_2_hours' as const);
  }, [eggIntervals.length]);

  const intervalTimesToShow = useMemo(() => {
    if (!eggIntervals || eggIntervals.length === 0) return [];

    const nowMins = getNowMinutesInFarmTz(farmTz);
    const isEggSelectedDateToday = eggSelectedDateISO === localTodayISO;
    const toMins = (hhmm: string) => {
      const [h, m] = hhmm.split(':');
      return Number(h) * 60 + Number(m);
    };

    // If the selected date is not today, treat the whole day as "past" so
    // unfilled intervals are marked as missed.
    const isPast = (hhmm: string) => !isEggSelectedDateToday || toMins(hhmm) < nowMins;
    const isUnfilled = (hhmm: string) => {
      const task = eggTaskByHHMM[hhmm];
      return !task || task.status !== 'completed';
    };

    const missed = eggIntervals.filter((t) => isPast(t) && isUnfilled(t));
    const upcoming = eggIntervals.filter((t) => !isPast(t));

    if (showAllEggIntervals) {
      // Show all, but keep missed entries first for visibility.
      const missedSet = new Set(missed);
      const rest = eggIntervals.filter((t) => !missedSet.has(t));
      return [...missed, ...rest];
    }

    // Default compact view: show exactly 2 items (missed first, then upcoming).
    // - For "today": show the last 2 missed (closest to now).
    // - For past dates: show the first 2 missed (chronological).
    const missedToShow = isEggSelectedDateToday ? missed.slice(-2) : missed.slice(0, 2);
    if (missedToShow.length >= 2) return missedToShow;
    const remaining = 2 - missedToShow.length;
    return [...missedToShow, ...upcoming.slice(0, remaining)];
  }, [eggIntervals, eggTaskByHHMM, farmTz, showAllEggIntervals, eggSelectedDateISO, localTodayISO]);

  const showEmpty = dailyTasks.length === 0 && intervalTimesToShow.length === 0;
  const eggModalExistingTask = eggTaskByHHMM[eggModalTimeHHMM] || null;
  const defaultEggSync = Boolean((eggTemplate as any)?.updates_inventory);
  const eggModalInitialSync = Boolean(
    eggModalExistingTask?.data_payload?.sync_to_inventory ?? defaultEggSync
  );
  const todayISO = eggSelectedDateISO;

  return loading ? loadingUI : (
    <div className="bg-white rounded-2xl border border-gray-200 transition-all p-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-[#3D5F42]" />
          <h2 className="text-sm font-bold text-gray-900">{t('dashboard.today_tasks')}</h2>
          {totalPendingTasks > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {totalPendingTasks}
            </span>
          )}
        </div>
        {dailyTasks.length > 0 && (
          <span className="text-xs text-gray-500 font-medium">
            {completedTasks.length}/{dailyTasks.length}
          </span>
        )}
      </div>

      {dailyTasks.length > 0 && (
        <div className="mb-2.5">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-[#3D5F42] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>
      )}

      {showEmpty ? (
        <div className="text-center py-2.5">
          <p className="text-xs text-gray-500 mb-2">{t('dashboard.no_tasks')}</p>
          {canAddTasks && (
            <button
              onClick={onAddTask}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] transition-colors text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('tasks.add_task')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Daily Tasks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-gray-500" />
              <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">
                Daily Tasks
              </div>
            </div>

            <div className="space-y-1">
              {visiblePendingTasks.map(renderTask)}
            </div>

            {!showAllTasks && hiddenTasksCount > 0 && (
              <button
                onClick={() => setShowAllTasks(true)}
                className="w-full py-1.5 text-xs font-medium text-[#3D5F42] hover:bg-[#3D5F42]/5 rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-dashed border-[#3D5F42]"
              >
                <Clock className="w-3.5 h-3.5" />
                {t('dashboard.see_all_tasks')} ({hiddenTasksCount})
              </button>
            )}

            {showAllTasks && totalPendingTasks > TASKS_LIMIT && (
              <button
                onClick={() => setShowAllTasks(false)}
                className="w-full py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                {t('dashboard.show_less')}
              </button>
            )}

            {completedTasks.length > 0 && (
              <details className="pt-2 border-t border-gray-200">
                <summary className="flex items-center gap-1.5 mb-1.5 cursor-pointer hover:text-[#3D5F42]">
                  <Check className="w-3.5 h-3.5 text-[#3D5F42]" />
                  <h3 className="text-[10px] font-bold text-[#3D5F42] uppercase tracking-wide">
                    {t('tasks.completed')} ({completedTasks.length})
                  </h3>
                </summary>
                <div className="space-y-1.5 mt-1.5">
                  {completedTasks.map(renderTask)}
                </div>
              </details>
            )}

            {canAddTasks && (
              <div className="pt-2 mt-2 border-t border-gray-200">
                <button
                  onClick={onAddTask}
                  className="w-full py-1.5 border border-dashed border-gray-300 hover:border-[#3D5F42] rounded-lg text-xs font-medium text-gray-600 hover:text-[#3D5F42] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('tasks.add_task')}
                </button>
              </div>
            )}
          </div>

          {/* Egg Collection */}
          <div className="pt-2.5 border-t border-gray-100">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Egg className="w-3.5 h-3.5 text-gray-500" />
                <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide truncate">
                  Egg Collection
                </div>
                {eggIntervals.length > 0 && (
                  <span className="text-[10px] text-gray-500 flex-shrink-0">
                    ({eggIntervals.length} intervals)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="date"
                  value={eggSelectedDateISO}
                  onChange={(e) => {
                    const next = e.target.value;
                    setEggSelectedDateISO(next);
                    setShowAllEggIntervals(false);
                    loadTasks(next);
                  }}
                  className="text-[11px] font-semibold text-gray-700 outline-none px-2 py-1 rounded-lg border border-gray-200 bg-white"
                />
              </div>
            </div>

            {intervalTimesToShow.length === 0 ? (
              <div className="text-xs text-gray-500">
                No egg intervals configured yet. Owner/manager: open <span className="font-semibold">Task Settings</span> and set exact times for <span className="font-semibold">'Daily Egg Collection'</span>.
              </div>
            ) : (
              <div className="space-y-2">
                {!showAllEggIntervals && eggIntervals.length > intervalTimesToShow.length && (
                  <button
                    type="button"
                    onClick={() => setShowAllEggIntervals(true)}
                    className="w-full py-1.5 text-xs font-medium text-[#3D5F42] hover:bg-[#3D5F42]/5 rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-dashed border-[#3D5F42]"
                  >
                    Load more intervals
                  </button>
                )}
                {showAllEggIntervals && eggIntervals.length > 6 && (
                  <button
                    type="button"
                    onClick={() => setShowAllEggIntervals(false)}
                    className="w-full py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    Show less
                  </button>
                )}
                {intervalTimesToShow.map((timeHHMM) => {
                  const task = eggTaskByHHMM[timeHHMM];
                  const isDone = task?.status === 'completed';
                  const sizes = resolveIntervalSizes(timeHHMM, task, eggCollectionsByTime);
                  const totalGood = getTotalGoodEggs(sizes);
                  const nowMins = getNowMinutesInFarmTz(farmTz);
                  const [h, m] = timeHHMM.split(':');
                  const tMins = Number(h) * 60 + Number(m);
                  const isEggSelectedDateToday = eggSelectedDateISO === localTodayISO;
                  const isPastUnfilled = !isDone && (!isEggSelectedDateToday || tMins < nowMins);
                  return (
                    <div
                      key={timeHHMM}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-1.5 ${
                        isPastUnfilled ? 'bg-red-50 border-red-200' : 'bg-gray-50/40 border-gray-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className={`text-[12px] font-semibold ${isPastUnfilled ? 'text-red-900' : 'text-gray-900'}`}>
                          {formatFarmClockWithFormat({
                            dateISO: eggSelectedDateISO,
                            timeHHMM,
                            farmTz,
                            timeFormat: timeDisplayFormat,
                          })}
                          {isPastUnfilled && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700">
                              Missed
                            </span>
                          )}
                        </div>
                        <div className={`text-[10px] line-clamp-1 ${isPastUnfilled ? 'text-red-700' : 'text-gray-500'}`}>
                          {isDone ? `Collected: ${Math.round(totalGood).toLocaleString()} eggs` : 'Not collected yet'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          isDone ? 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-800' : 'bg-[#3D5F42] hover:bg-[#2F4A34] text-white'
                        }`}
                        onClick={() => {
                          setEggModalTimeHHMM(timeHHMM);
                          setEggModalOpen(true);
                        }}
                        disabled={!eggTemplate || !selectedFlockId || !canCompleteEgg}
                        title={!canCompleteEgg ? 'No permission' : !selectedFlockId ? 'Select a flock' : 'Enter egg data'}
                      >
                        {isDone ? 'Edit' : 'Enter'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {eggModalOpen && eggTemplate && selectedFlockId && (
        <EggIntervalEntryModal
          onClose={() => setEggModalOpen(false)}
          onSaved={() => loadTasks(eggSelectedDateISO)}
          eggTemplate={eggTemplate}
          existingTask={
            eggModalExistingTask
              ? {
                  id: eggModalExistingTask.id,
                  flock_id: eggModalExistingTask.flock_id,
                  scheduled_for: eggModalExistingTask.scheduled_for,
                  scheduled_time: eggModalExistingTask.scheduled_time,
                  data_payload: eggModalExistingTask.data_payload,
                  status: eggModalExistingTask.status,
                }
              : null
          }
          collectionDate={todayISO}
          intervalTimeHHMM={eggModalTimeHHMM}
          flockId={selectedFlockId}
          intervalGranularity={intervalGranularity}
          eggsPerTray={eggsPerTray}
          canComplete={canCompleteEgg}
          canSyncToInventory={canSyncToInventoryEgg}
          initialSyncToInventory={eggModalInitialSync}
          initialSizes={resolveIntervalSizes(eggModalTimeHHMM, eggModalExistingTask, eggCollectionsByTime)}
        />
      )}
    </div>
  );
}
