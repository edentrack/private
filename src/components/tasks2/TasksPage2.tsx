import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Clock, Plus, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { DateTime } from 'luxon';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { TaskTemplate, TaskTypeCategory, TaskScope } from '../../types/database';
import { UnifiedTaskSettings } from '../tasks/UnifiedTaskSettings';
import { CompleteTaskModal } from '../tasks/CompleteTaskModal';
import type { Task } from '../../types/database';
import {
  completeTask,
  ensureTasksGeneratedForDate,
  normalizeAndDedupTasksForDate,
  type TaskWithMetadata,
} from '../../utils/unifiedTaskSystem';
import { getFarmTimeZone, getFarmTodayISO } from '../../utils/farmTime';

type TabId = 'today' | 'schedule';

function addDays(dateISO: string, deltaDays: number) {
  // date-only increment (avoids timezone shifting)
  const next = DateTime.fromISO(dateISO).plus({ days: deltaDays });
  return next.toISODate() || dateISO;
}

function fmtTimeFromScheduledTime(scheduledTime: string | null) {
  if (!scheduledTime) return '';
  const hhmm = String(scheduledTime).slice(0, 5);
  const d = new Date(`1970-01-01T${hhmm}:00`);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

async function fetchTasksForDate(params: { farmId: string; dateISO: string; farmTz: string }): Promise<TaskWithMetadata[]> {
  // NOTE: tasks.scheduled_for is DATE in your schema; use `due_date` primarily.
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `
      *,
      task_templates(title, category, icon, scope, type_category, requires_input, is_active, is_enabled),
      flocks(name, type)
    `
    )
    .eq('farm_id', params.farmId)
    .eq('is_archived', false)
    .or(`due_date.eq.${params.dateISO},scheduled_for.eq.${params.dateISO}`)
    .order('scheduled_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data)) return [];

  const todayISO = getFarmTodayISO(params.farmTz);

  return (data as any[]).map((task) => {
    const template = task.task_templates;
    const flock = task.flocks;
    const taskDate = String(task.due_date || task.scheduled_for || '').slice(0, 10);
    const isOverdue = task.status === 'pending' && taskDate && taskDate < todayISO;

    return {
      id: task.id,
      farm_id: task.farm_id,
      flock_id: task.flock_id,
      template_id: task.template_id,
      title_override: task.title_override,
      scheduled_for: String(task.scheduled_for || taskDate),
      window_start: task.window_start,
      window_end: task.window_end,
      status: task.status,
      requires_input: task.requires_input || template?.requires_input || false,
      data_payload: task.data_payload,
      completed_at: task.completed_at,
      completed_by: task.completed_by,
      due_date: task.due_date,
      scheduled_time: task.scheduled_time,
      assigned_to: task.assigned_to,
      notes: task.notes,
      is_archived: task.is_archived || false,
      archived_at: task.archived_at,
      archived_by: task.archived_by,
      created_at: task.created_at,
      updated_at: task.updated_at,
      completion_notes: task.completion_notes ?? null,
      completion_photo_url: task.completion_photo_url ?? null,
      taskType: (template?.type_category || 'daily') as TaskTypeCategory,
      scope: (template?.scope || 'general') as TaskScope,
      isOverdue,
      templateTitle: task.title_override || template?.title || 'Task',
      templateCategory: template?.category || 'General',
      templateIcon: template?.icon || null,
      templateIsActive: !!template?.is_active,
      templateIsEnabled: !!template?.is_enabled,
      isRecording: template?.type_category === 'recording',
      flockName: flock?.name,
    } as any;
  });
}

async function fetchTemplates(farmId: string): Promise<TaskTemplate[]> {
  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('farm_id', farmId)
    .order('display_order', { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data as TaskTemplate[];
}

export function TasksPage2() {
  const { currentFarm, currentRole, user } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const species = useFarmSpecies();
  const canManage = currentRole === 'owner' || currentRole === 'manager';
  const farmTz = getFarmTimeZone(currentFarm);

  const [tab, setTab] = useState<TabId>('today');
  const [dateISO, setDateISO] = useState(() => getFarmTodayISO(farmTz));
  /** Last farm-local calendar day we saw; used to advance the picker when a new farm day starts (tab left open overnight). */
  const lastFarmDaySeenRef = useRef<string | null>(null);
  const [showTaskSettingsModal, setShowTaskSettingsModal] = useState(false);
  const [completeTaskModal, setCompleteTaskModal] = useState<TaskWithMetadata | null>(null);

  const [loading, setLoading] = useState(true);
  const [dismissingOverdue, setDismissingOverdue] = useState(false);
  const [tasks, setTasks] = useState<TaskWithMetadata[]>([]);
  const [, setTemplates] = useState<TaskTemplate[]>([]);
  const DAILY_TASKS_PAGE_SIZE = 8;
  const [visibleDailyTaskCount, setVisibleDailyTaskCount] = useState(DAILY_TASKS_PAGE_SIZE);

  const visibleTasks = useMemo(() => {
    // only show tasks whose template is enabled (or custom tasks with no template)
    return tasks.filter((t: any) => (t.template_id ? t.templateIsActive && t.templateIsEnabled : true));
  }, [tasks]);

  const dailyTasks = useMemo(() => {
    return visibleTasks.filter((t) => (t.templateIcon ? t.templateIcon !== 'egg' : true));
  }, [visibleTasks]);

  const completedDailyTasks = useMemo(() => {
    return dailyTasks.filter((t) => t.status === 'completed');
  }, [dailyTasks]);

  const pendingDailyTasksCount = dailyTasks.filter((t) => t.status !== 'completed').length;
  const visibleDailyTasks = useMemo(
    () => dailyTasks.slice(0, visibleDailyTaskCount),
    [dailyTasks, visibleDailyTaskCount]
  );
  const hasMoreDailyTasks = dailyTasks.length > visibleDailyTaskCount;

  useEffect(() => {
    // Always align the date picker with farm-local "today"
    if (currentFarm?.id) {
      setDateISO(getFarmTodayISO(farmTz));
    }
  }, [currentFarm?.id, farmTz]);

  useEffect(() => {
    const bumpFarmIfNewDay = () => {
      const farmToday = getFarmTodayISO(farmTz);
      const prev = lastFarmDaySeenRef.current;
      if (prev !== null && farmToday !== prev) {
        setDateISO((d) => (d === prev ? farmToday : d));
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
  }, [farmTz]);

  useEffect(() => {
    const run = async () => {
      if (!currentFarm?.id) return;
      setLoading(true);
      // Make sure template-based daily tasks exist for the selected date before reading.
      await ensureTasksGeneratedForDate(supabase, currentFarm.id, dateISO, undefined, farmTz);
      await normalizeAndDedupTasksForDate(supabase, currentFarm.id, dateISO);
      const [t, temps] = await Promise.all([
        fetchTasksForDate({ farmId: currentFarm.id, dateISO, farmTz }),
        fetchTemplates(currentFarm.id),
      ]);
      setTasks(t);
      setTemplates(temps);
      setLoading(false);
    };
    run();
  }, [currentFarm?.id, dateISO, farmTz]);

  useEffect(() => {
    setVisibleDailyTaskCount(DAILY_TASKS_PAGE_SIZE);
  }, [dateISO, tab]);

  const overdueCount = useMemo(() => dailyTasks.filter((t) => t.isOverdue).length, [dailyTasks]);

  const dismissAllOverdue = async () => {
    if (!currentFarm?.id || currentRole !== 'owner') return;
    setDismissingOverdue(true);
    try {
      const todayISO = getFarmTodayISO(farmTz);
      await supabase
        .from('tasks')
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq('farm_id', currentFarm.id)
        .eq('status', 'pending')
        .eq('is_archived', false)
        .or(`due_date.lt.${todayISO},scheduled_for.lt.${todayISO}`);
      const t = await fetchTasksForDate({ farmId: currentFarm.id, dateISO, farmTz });
      setTasks(t);
    } finally {
      setDismissingOverdue(false);
    }
  };

  const _toggleTemplate = async (templateId: string, nextEnabled: boolean) => {
    if (!currentFarm?.id) return;
    await supabase
      .from('task_templates')
      .update({ is_active: nextEnabled, is_enabled: nextEnabled })
      .eq('id', templateId)
      .eq('farm_id', currentFarm.id);
    const temps = await fetchTemplates(currentFarm.id);
    setTemplates(temps);
    const t = await fetchTasksForDate({ farmId: currentFarm.id, dateISO, farmTz });
    setTasks(t);
  };

  const handleQuickComplete = async (task: TaskWithMetadata) => {
    if (!user?.id || !currentFarm?.id) return;
    // Optimistic update — flip the status locally first so the chip and the
    // hidden "Done" button repaint immediately. Without this the audit
    // observed a stale "Not started" chip until the user scrolled and
    // forced a re-paint.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: 'completed', completed_at: new Date().toISOString(), completed_by: user.id }
          : t
      )
    );
    try {
      await completeTask(supabase, task.id, user.id, currentFarm.id);
    } catch (err) {
      console.error('Failed to mark task complete:', err);
      // Re-fetch to get authoritative state if the network call failed.
    }
    const t = await fetchTasksForDate({ farmId: currentFarm.id, dateISO, farmTz });
    setTasks(t);
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div data-tour="task-header" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{isFr ? 'Tâches' : 'Tasks'}</h1>
          <p className="text-gray-500 mt-1">
            {species.features.eggs
              ? (isFr ? "Tâches quotidiennes + suivi des collectes d'œufs" : 'Daily tasks + egg collection tracking')
              : species.id === 'aquaculture'
                ? (isFr ? "Surveillance quotidienne de l'étang + qualité de l'eau + échantillonnage" : 'Daily pond monitoring + water quality + sampling')
                : (isFr ? 'Tâches quotidiennes' : 'Daily tasks')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 bg-white w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="date"
              value={dateISO}
              onChange={(e) => setDateISO(e.target.value)}
              className="text-sm font-medium text-gray-900 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setDateISO(addDays(dateISO, -1))}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
            title={isFr ? 'Jour précédent' : 'Previous day'}
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
          <button
            type="button"
            onClick={() => setDateISO(addDays(dateISO, 1))}
            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
            title={isFr ? 'Jour suivant' : 'Next day'}
          >
            <ChevronRight className="w-4 h-4 text-gray-700" />
          </button>
        </div>
      </div>

      <div className="glass-light rounded-full p-1.5 flex w-full overflow-x-auto whitespace-nowrap gap-1">
        <button
          onClick={() => setTab('today')}
          className={`nav-pill flex items-center gap-2 ${tab === 'today' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
        >
          <Clock className="w-4 h-4" />
          {isFr ? "Aujourd'hui" : 'Today'}
        </button>
        <button
          id="tasks-settings-button"
          onClick={() => {
            setTab('schedule');
            if (canManage) setShowTaskSettingsModal(true);
          }}
          className={`nav-pill flex items-center gap-2 ${tab === 'schedule' ? 'nav-pill-active' : 'nav-pill-inactive'}`}
        >
          <Settings className="w-4 h-4" />
          {isFr ? 'Paramètres des tâches' : 'Task Settings'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin" />
        </div>
      ) : tab === 'today' ? (
        <div className="space-y-5">
          <div className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-gray-900">{isFr ? 'Tâches quotidiennes' : 'Daily Tasks'}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {isFr ? 'Marquez les tâches comme terminées (dates passées incluses).' : 'Mark tasks complete (past dates included).'}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {currentRole === 'owner' && overdueCount > 0 && (
                  <button
                    type="button"
                    disabled={dismissingOverdue}
                    onClick={dismissAllOverdue}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-60 whitespace-nowrap"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {dismissingOverdue
                      ? (isFr ? 'Archivage…' : 'Archiving…')
                      : (isFr ? `Ignorer ${overdueCount} en retard` : `Dismiss ${overdueCount} overdue`)}
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="btn-primary inline-flex items-center gap-2 whitespace-nowrap"
                    onClick={() => {
                      setTab('schedule');
                      setShowTaskSettingsModal(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    {isFr ? 'Ajouter une tâche' : 'Add Task'}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4">
              {dailyTasks.length === 0 ? (
                <div className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-xl px-3 py-4">
                  {isFr ? 'Aucune tâche quotidienne pour cette date.' : 'No daily tasks for this date.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleDailyTasks.map((t) => {
                    const timeLabel = fmtTimeFromScheduledTime(t.scheduled_time);
                    const statusLabel =
                      t.status === 'completed'
                        ? (isFr ? 'Terminée' : 'Completed')
                        : t.status === 'in_progress'
                          ? (isFr ? 'En cours' : 'In progress')
                          : (isFr ? 'Non commencée' : 'Not started');
                    // Audit fix: the page used to show two different button verbs
                    // ("Complete" vs "Done") for the same conceptual action with no
                    // visible cue — one opened a modal, the other was instant. Use
                    // a single canonical label ("Mark done") with a subtle suffix
                    // when more input is required, so the user knows what to expect.
                    const isEntryTask = Boolean((t as any).requires_input || (t as any).isRecording);
                    const buttonLabel = isEntryTask
                      ? (isFr ? 'Marquer terminée…' : 'Mark done…')
                      : (isFr ? 'Marquer terminée' : 'Mark done');
                    return (
                      <div
                        // Include status in the key so React always remounts the row
                        // when status changes — guarantees the chip repaints without
                        // requiring a scroll-induced reflow.
                        key={`${t.id}:${t.status}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-100 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {t.title_override || t.templateTitle || (isFr ? 'Tâche' : 'Task')}
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {timeLabel
                              ? (isFr ? `Échéance : ${timeLabel}` : `Due: ${timeLabel}`)
                              : (isFr ? 'Toute la journée' : 'All day')}
                            {t.assigned_to ? (isFr ? ' • Attribuée' : ' • Assigned') : ''}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {t.isOverdue && (
                            <span className="text-xs px-2 py-1 rounded-full border bg-amber-50 border-amber-200 text-amber-700 whitespace-nowrap">
                              {isFr ? 'En retard' : 'Overdue'}
                            </span>
                          )}
                          <div
                            className={[
                              'text-xs px-2 py-1 rounded-full border',
                              t.status === 'completed'
                                ? 'bg-green-50 border-green-100 text-green-700'
                                : 'bg-gray-50 border-gray-200 text-gray-700',
                            ].join(' ')}
                          >
                            {statusLabel}
                          </div>

                          {t.status !== 'completed' && (
                            <button
                              type="button"
                              className="btn-secondary text-sm whitespace-nowrap"
                              title={isEntryTask
                                ? (isFr ? 'Ouvre un formulaire pour saisir les détails (notes, photo, mesures)' : 'Opens a form to record details (notes, photo, measurements)')
                                : (isFr ? 'Marquer terminée immédiatement' : 'Mark complete instantly')}
                              onClick={() => {
                                if (isEntryTask) setCompleteTaskModal(t);
                                else handleQuickComplete(t);
                              }}
                            >
                              {buttonLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {hasMoreDailyTasks && (
                <button
                  type="button"
                  onClick={() => setVisibleDailyTaskCount((prev) => prev + DAILY_TASKS_PAGE_SIZE)}
                  className="mt-3 w-full py-2 text-xs font-medium text-[#3D5F42] hover:bg-[#3D5F42]/5 rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-dashed border-[#3D5F42]"
                >
                  {isFr ? `Charger plus de tâches (${dailyTasks.length - visibleDailyTaskCount})` : `Load more tasks (${dailyTasks.length - visibleDailyTaskCount})`}
                </button>
              )}
              {!hasMoreDailyTasks && dailyTasks.length > DAILY_TASKS_PAGE_SIZE && (
                <button
                  type="button"
                  onClick={() => setVisibleDailyTaskCount(DAILY_TASKS_PAGE_SIZE)}
                  className="mt-3 w-full py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {isFr ? 'Afficher moins' : 'Show less'}
                </button>
              )}
              {dailyTasks.length > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  {isFr ? `En attente : ${pendingDailyTasksCount} • Terminées : ${completedDailyTasks.length}` : `Pending: ${pendingDailyTasksCount} • Completed: ${completedDailyTasks.length}`}
                </div>
              )}
            </div>
          </div>

        </div>
      ) : tab === 'schedule' ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900">{isFr ? 'Paramètres des tâches' : 'Task Settings'}</div>
              <div className="text-sm text-gray-600 mt-1">
                {isFr
                  ? "Configurez les tâches quotidiennes, l'intervalle de collecte d'œufs, la récurrence et la synchronisation par défaut de l'inventaire."
                  : 'Configure daily tasks, egg interval schedule, recurrence, and default inventory sync.'}
              </div>
            </div>
            {canManage ? (
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-2"
                onClick={() => setShowTaskSettingsModal(true)}
              >
                <Settings className="w-4 h-4" />
                {isFr ? 'Ouvrir les paramètres des tâches' : 'Open Task Settings'}
              </button>
            ) : (
              <div className="text-xs text-gray-500">{isFr ? 'Demandez au propriétaire de la ferme de configurer les tâches.' : 'Ask your farm owner to configure tasks.'}</div>
            )}
          </div>
        </div>
      ) : null}

      {showTaskSettingsModal && canManage && (
        <UnifiedTaskSettings onClose={() => setShowTaskSettingsModal(false)} />
      )}

      {completeTaskModal && (
        <CompleteTaskModal
          task={completeTaskModal as unknown as Task}
          onClose={() => setCompleteTaskModal(null)}
          onSuccess={() => {
            setCompleteTaskModal(null);
            (async () => {
              if (!currentFarm?.id) return;
              const t = await fetchTasksForDate({ farmId: currentFarm.id, dateISO, farmTz });
              setTasks(t);
            })();
          }}
        />
      )}
    </div>
  );
}

