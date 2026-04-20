import { SupabaseClient } from '@supabase/supabase-js';
import { TaskTemplate, Task } from '../types/database';

export async function ensureDailyTasksForFarm(
  supabaseClient: SupabaseClient,
  farmId: string,
  date: string
): Promise<void> {
  const { data: templates, error: templatesError } = await supabaseClient
    .from('task_templates')
    .select('*')
    .eq('farm_id', farmId)
    .eq('is_enabled', true)
    .order('display_order', { ascending: true });

  if (templatesError) {
    console.error('Error fetching task templates:', templatesError);
    throw templatesError;
  }

  if (!templates || templates.length === 0) {
    return;
  }

  for (const template of templates as TaskTemplate[]) {
    const taskInstances = generateTaskInstancesFromTemplate(template, date);

    for (const taskData of taskInstances) {
      let query = supabaseClient
        .from('tasks')
        .select('id')
        .eq('farm_id', farmId)
        .eq('template_id', template.id)
        .eq('due_date', date);

      if (taskData.scheduled_time) {
        query = query.eq('scheduled_time', taskData.scheduled_time);
      } else {
        query = query.is('scheduled_time', null);
      }

      const { data: existing } = await query.maybeSingle();

      if (!existing) {
        const scheduledFor = taskData.scheduled_time
          ? `${date}T${taskData.scheduled_time}:00`
          : `${date}T09:00:00`;

        const windowStart = scheduledFor;
        const windowEnd = new Date(
          new Date(scheduledFor).getTime() +
          (template.window_after_minutes || 120) * 60 * 1000
        ).toISOString();

        const { error: insertError } = await supabaseClient.from('tasks').insert({
          farm_id: farmId,
          template_id: template.id,
          title_override: taskData.title,
          notes: template.description || null,
          due_date: date,
          scheduled_for: scheduledFor,
          window_start: windowStart,
          window_end: windowEnd,
          scheduled_time: taskData.scheduled_time,
          status: 'pending',
          requires_input: template.requires_input || false,
          flock_id: null,
        });

        if (insertError) {
          console.error('Error inserting task:', insertError);
        }
      }
    }
  }
}

function generateTaskInstancesFromTemplate(
  template: TaskTemplate,
  date: string
): Array<{ title: string; scheduled_time: string | null }> {
  const instances: Array<{ title: string; scheduled_time: string | null }> = [];

  switch (template.frequency_mode) {
    case 'once_per_day': {
      let scheduledTime: string | null = null;
      let title = template.title;

      if (template.scheduled_times && template.scheduled_times.length > 0) {
        scheduledTime = template.scheduled_times[0];
      }

      instances.push({ title, scheduled_time: scheduledTime });
      break;
    }

    case 'multiple_times_per_day': {
      if (template.scheduled_times && template.scheduled_times.length > 0) {
        template.scheduled_times.forEach((time, index) => {
          const periodLabel = getPeriodLabel(time, index, template.scheduled_times!.length);
          const title = `${template.title} — ${periodLabel}`;
          instances.push({ title, scheduled_time: time });
        });
      }
      break;
    }

    case 'ad_hoc':
      break;
  }

  return instances;
}

function getPeriodLabel(time: string, index: number, total: number): string {
  const hour = parseInt(time.split(':')[0], 10);

  if (total === 2) {
    return index === 0 ? 'Morning' : 'Evening';
  }

  if (total === 3) {
    if (index === 0) return 'Morning';
    if (index === 1) return 'Afternoon';
    return 'Evening';
  }

  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}
