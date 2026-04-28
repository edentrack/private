import { SupabaseClient } from '@supabase/supabase-js';
import { dayOfMonthForFarmDate, getFarmTodayISO, jsWeekdayForFarmDate } from './farmTime';
import { TaskTemplate, Task, TaskScope, TaskTypeCategory } from '../types/database';

export interface TaskWithMetadata extends Omit<Task, 'title' | 'description' | 'completed'> {
  taskType: TaskTypeCategory;
  scope: TaskScope;
  isOverdue: boolean;
  templateTitle: string;
  templateCategory: string;
  templateIcon: string | null;
  templateIsActive: boolean;
  templateIsEnabled: boolean;
  isRecording: boolean;
  flockName?: string;
}

export async function getTasksForDate(
  supabaseClient: SupabaseClient,
  farmId: string,
  date: string,
  includeOverdue: boolean = true,
  flockTypes?: string[],
  farmTz?: string
): Promise<TaskWithMetadata[]> {
  let query = supabaseClient
    .from('tasks')
    .select(`
      *,
      task_templates(title, category, icon, scope, type_category, requires_input, is_active, is_enabled),
      flocks(name, type)
    `)
    .eq('farm_id', farmId)
    .eq('is_archived', false);

  if (includeOverdue) {
    const threeDaysAgo = new Date(date);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const overdueStart = threeDaysAgo.toISOString().split('T')[0];
    // scheduled_for is DATE in schema; due_date is preferred.
    query = query.or(
      `and(due_date.gte.${overdueStart},due_date.lte.${date}),and(scheduled_for.gte.${overdueStart},scheduled_for.lte.${date})`
    );
  } else {
    query = query.or(`due_date.eq.${date},scheduled_for.eq.${date}`);
  }

  const { data: tasksData, error } = await query
    .order('scheduled_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  if (!tasksData) return [];

  const todayStr =
    typeof farmTz === 'string' && farmTz.trim()
      ? getFarmTodayISO(farmTz.trim())
      : new Date().toISOString().split('T')[0];

  const tasks: TaskWithMetadata[] = tasksData
    .filter((task: any) => {
      if (!flockTypes || flockTypes.length === 0) return true;

      const template = task.task_templates;
      if (!template) return true;

      const taskScope = template.scope || 'general';
      if (taskScope === 'general') return true;

      if (taskScope === 'broiler' && !flockTypes.includes('Broiler')) return false;
      if (taskScope === 'layer' && !flockTypes.includes('Layer')) return false;

      return true;
    })
    .map((task: any) => {
      const template = task.task_templates;
      const flock = task.flocks;
      const taskDate = String(task.due_date || task.scheduled_for || '').slice(0, 10);
      const isOverdue = task.status === 'pending' && taskDate < todayStr;

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
        taskType: template?.type_category || 'daily',
        scope: template?.scope || 'general',
        isOverdue,
        templateTitle: task.title_override || template?.title || 'Task',
        templateCategory: template?.category || 'General',
        templateIcon: template?.icon || null,
        templateIsActive: !!template?.is_active,
        templateIsEnabled: !!template?.is_enabled,
        isRecording: template?.type_category === 'recording',
        flockName: flock?.name,
      };
    });

  return tasks;
}

export async function normalizeAndDedupTasksForDate(
  supabaseClient: SupabaseClient,
  farmId: string,
  date: string
): Promise<void> {
  // Today-only cleanup:
  // - DELETE duplicates (keep oldest) for (template_id + due_date + scheduled_time)
  // - DO NOT update timestamps here (scheduled_for is a DATE in your schema, so writing ISO timestamps can fail).

  const { data, error } = await supabaseClient
    .from('tasks')
    .select('id, template_id, scheduled_time, scheduled_for, status, is_archived, created_at, due_date')
    .eq('farm_id', farmId)
    .eq('is_archived', false)
    .eq('status', 'pending')
    .or(`due_date.eq.${date},scheduled_for.eq.${date}`)
    .limit(2000);

  if (error || !Array.isArray(data) || data.length === 0) return;

  const groups = new Map<string, any[]>();
  for (const r of data as any[]) {
    const dueKey = String(r.due_date || r.scheduled_for || date).slice(0, 10);
    const hhmm = String(r.scheduled_time || '').slice(0, 5);
    const key = `${r.template_id || 'no_template'}|${dueKey}|${hhmm}`;
    const arr = groups.get(key) || [];
    arr.push(r);
    groups.set(key, arr);
  }

  const toDelete: string[] = [];
  for (const arr of groups.values()) {
    if (arr.length <= 1) continue;
    arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    for (let i = 1; i < arr.length; i++) toDelete.push(arr[i].id);
  }

  for (let i = 0; i < toDelete.length; i += 100) {
    const chunk = toDelete.slice(i, i + 100);
    await supabaseClient.from('tasks').delete().in('id', chunk);
  }
}

export async function ensureTasksGeneratedForDate(
  supabaseClient: SupabaseClient,
  farmId: string,
  date: string,
  flockTypes?: string[],
  farmTz?: string
): Promise<void> {
  let normalizedDate: string;

  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    normalizedDate = date;
  } else {
    normalizedDate = new Date().toISOString().split('T')[0];
  }

  const tz = typeof farmTz === 'string' && farmTz.trim() ? farmTz.trim() : 'UTC';

  let templatesQuery = supabaseClient
    .from('task_templates')
    .select('*')
    .eq('farm_id', farmId)
    .eq('is_active', true)
    .eq('is_enabled', true)
    .order('display_order', { ascending: true });

  const { data: templates, error: templatesError } = await templatesQuery;

  if (templatesError || !templates || templates.length === 0) {
    return;
  }

  const applicableTemplates = templates.filter((template: TaskTemplate) => {
    if (template.default_frequency === 'ad_hoc') return false;

    if (!flockTypes || flockTypes.length === 0) return true;

    const scope = template.scope || 'general';
    if (scope === 'general') return true;
    if (scope === 'broiler' && flockTypes.includes('Broiler')) return true;
    if (scope === 'layer' && flockTypes.includes('Layer')) return true;

    return false;
  });

  const normalizeTimes = (times: string[] | null | undefined) => {
    if (!Array.isArray(times)) return [];
    const cleaned = times
      .map((t) => String(t).trim().slice(0, 5))
      .filter((t) => /^\d{2}:\d{2}$/.test(t));
    return Array.from(new Set(cleaned)).sort();
  };

  for (const template of applicableTemplates) {
    // One-day templates only generate on that date
    if ((template as any).one_time_date) {
      if (String((template as any).one_time_date).slice(0, 10) !== normalizedDate) continue;
    }

    if (template.default_frequency === 'weekly') {
      const dayOfWeek = jsWeekdayForFarmDate(normalizedDate, tz);
      const configuredDays = (template as any).days_of_week as number[] | null | undefined;
      if (Array.isArray(configuredDays) && configuredDays.length > 0) {
        if (!configuredDays.includes(dayOfWeek)) continue;
      } else {
        // Backward-compatible default: Monday (1)
        if (dayOfWeek !== 1) continue;
      }
    }

    if (template.default_frequency === 'monthly') {
      const dayOfMonth = dayOfMonthForFarmDate(normalizedDate, tz);
      if (dayOfMonth !== 1) continue;
    }

    const scheduledTimes = (() => {
      // Use owner-configured times when present
      const custom = normalizeTimes((template as any).scheduled_times);
      if (custom.length > 0) return custom;

      // If multiple-per-day but no list, fall back to preferred time only
      const fallback = template.preferred_time_of_day?.toString() || '09:00';
      return [String(fallback).slice(0, 5)];
    })();

    for (const scheduledTime of scheduledTimes) {
      // Existence check must use the date columns (scheduled_for is DATE in your schema)
      // and time columns (scheduled_time is TIME). This prevents duplicates and avoids 400s.
      const timeCandidates = (() => {
        const base = String(scheduledTime).slice(0, 5); // HH:MM
        const withSeconds = `${base}:00`; // HH:MM:SS
        return Array.from(new Set([base, withSeconds]));
      })();

      const existingQuery = supabaseClient
        .from('tasks')
        .select('id')
        .eq('farm_id', farmId)
        .eq('template_id', template.id)
        .eq('due_date', normalizedDate)
        .limit(1);

      const existingRes =
        timeCandidates.length === 1
          ? await existingQuery.eq('scheduled_time', timeCandidates[0])
          : await existingQuery.or(
              timeCandidates.map((t) => `scheduled_time.eq.${t}`).join(',')
            );

      if ((existingRes as any)?.error) {
        console.warn('Task existence check failed; skipping insert for safety', (existingRes as any).error);
        continue;
      }

      const existingList = (existingRes as any)?.data;
      if (Array.isArray(existingList) && existingList.length > 0) continue;

      const scheduledLocal = new Date(`${normalizedDate}T${timeCandidates[0]}:00`);
      const scheduledTsISO = isNaN(scheduledLocal.getTime()) ? new Date().toISOString() : scheduledLocal.toISOString();

      const windowMinutes = Number(template.completion_window_minutes ?? 0);
      const windowEndISO = windowMinutes > 0
        ? new Date(new Date(scheduledTsISO).getTime() + windowMinutes * 60 * 1000).toISOString()
        : scheduledTsISO;

      const { error: insertError } = await supabaseClient.from('tasks').insert({
        farm_id: farmId,
        template_id: template.id,
        title_override: template.title,
        notes: template.description || null,
        due_date: normalizedDate,
        // scheduled_for is DATE in schema
        scheduled_for: normalizedDate,
        // window_* are timestamps
        window_start: scheduledTsISO,
        window_end: windowEndISO,
        scheduled_time: scheduledTime,
        status: 'pending',
        requires_input: template.requires_input || false,
        flock_id: null,
        is_archived: false,
      });

      if (insertError) {
        console.error('Error inserting task:', insertError);
        throw insertError;
      }
    }
  }
}

export async function completeTask(
  supabaseClient: SupabaseClient,
  taskId: string,
  userId: string,
  farmId: string,
  dataPayload?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    const { error } = await supabaseClient
      .from('tasks')
      .update({
        status: 'completed',
        completed_at: now,
        completed_by: userId,
        data_payload: dataPayload || null,
      })
      .eq('id', taskId);

    if (error) throw error;

    const { data: task } = await supabaseClient
      .from('tasks')
      .select('title_override, task_templates(title)')
      .eq('id', taskId)
      .maybeSingle();

    const taskTitle = task?.title_override || (task as any)?.task_templates?.title || 'Task';

    await supabaseClient.from('activity_logs').insert({
      user_id: userId,
      farm_id: farmId,
      action: `Completed task: ${taskTitle}`,
      entity_type: 'task',
      entity_id: taskId,
      details: { task_id: taskId, completed_at: now },
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error completing task:', error);
    return { success: false, error: error.message || 'Failed to complete task' };
  }
}

export async function archiveTask(
  supabaseClient: SupabaseClient,
  taskId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    const { error } = await supabaseClient
      .from('tasks')
      .update({
        is_archived: true,
        archived_at: now,
        archived_by: userId,
      })
      .eq('id', taskId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error archiving task:', error);
    return { success: false, error: error.message || 'Failed to archive task' };
  }
}

export async function getFlockTypesForFarm(
  supabaseClient: SupabaseClient,
  farmId: string
): Promise<string[]> {
  const { data: flocks } = await supabaseClient
    .from('flocks')
    .select('type')
    .eq('farm_id', farmId)
    .eq('status', 'active');

  if (!flocks) return [];

  const types = new Set<string>();
  flocks.forEach((flock: { type: string }) => {
    if (flock.type) types.add(flock.type);
  });

  return Array.from(types);
}

export function getScopeBadgeColor(scope: TaskScope): string {
  switch (scope) {
    case 'broiler': return 'bg-amber-100 text-amber-700';
    case 'layer': return 'bg-blue-100 text-blue-700';
    default: return 'bg-gray-100 text-gray-700';
  }
}

export function getTypeBadgeColor(type: TaskTypeCategory): string {
  switch (type) {
    case 'recording': return 'bg-blue-100 text-blue-700';
    case 'one_time': return 'bg-teal-100 text-teal-700';
    default: return 'bg-green-100 text-green-700';
  }
}

// One-time cleanup: delete tasks whose due_date contains a 'T' (ISO timestamp written
// into a DATE column by the old smartTasks generator). Fire-and-forget — safe to call
// on every dashboard load since it becomes a no-op once the data is clean.
export async function cleanHistoricalDuplicateTasks(
  supabaseClient: SupabaseClient,
  farmId: string
): Promise<void> {
  try {
    const { data } = await supabaseClient
      .from('tasks')
      .select('id, due_date')
      .eq('farm_id', farmId)
      .like('due_date', '%T%');

    if (data && data.length > 0) {
      const ids = data.map((t: any) => t.id);
      await supabaseClient.from('tasks').delete().in('id', ids);
    }
  } catch {
    // Non-blocking — ignore errors
  }
}

