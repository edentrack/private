import { supabase } from '../lib/supabaseClient';

export async function generateDailyTasks(farmId: string): Promise<number> {
  try {
    const { data: templates, error: templatesError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('farm_id', farmId)
      .eq('is_enabled', true);

    if (templatesError) {
      console.error('Error fetching templates:', templatesError);
      throw templatesError;
    }

    if (!templates || templates.length === 0) {
      console.log('No enabled task templates found');
      return 0;
    }

    const today = new Date().toISOString().split('T')[0];
    const tasksToCreate = [];

    for (const template of templates) {
      if (template.type_category === 'one_time') {
        const { data: existingOneTime } = await supabase
          .from('tasks')
          .select('id')
          .eq('farm_id', farmId)
          .eq('template_id', template.id)
          .limit(1);

        if (existingOneTime && existingOneTime.length > 0) {
          console.log(`Skipping one-time template ${template.title} - already exists`);
          continue;
        }
      }

      const scheduledTimes = template.scheduled_times || ['09:00'];

      if (template.scope === 'general') {
        for (const timeStr of scheduledTimes) {
          const { data: existingTask } = await supabase
            .from('tasks')
            .select('id')
            .eq('farm_id', farmId)
            .eq('template_id', template.id)
            .eq('due_date', today)
            .eq('scheduled_time', timeStr)
            .maybeSingle();

          if (existingTask) {
            console.log(`General task already exists for template ${template.title} at ${timeStr}`);
            continue;
          }

          const scheduledTime = `${today}T${timeStr}:00`;
          let windowStart: string;
          let windowEnd: string;

          try {
            const scheduledDate = new Date(scheduledTime);
            if (!isNaN(scheduledDate.getTime())) {
              const startDate = new Date(scheduledDate);
              startDate.setMinutes(startDate.getMinutes() - (template.window_before_minutes || 30));
              windowStart = startDate.toISOString();

              const endDate = new Date(scheduledDate);
              endDate.setMinutes(endDate.getMinutes() + (template.window_after_minutes || 30));
              windowEnd = endDate.toISOString();
            } else {
              windowStart = scheduledTime;
              windowEnd = scheduledTime;
            }
          } catch (err) {
            console.error('Error calculating window times:', err);
            windowStart = scheduledTime;
            windowEnd = scheduledTime;
          }

          tasksToCreate.push({
            farm_id: farmId,
            flock_id: null,
            template_id: template.id,
            title_override: template.title,
            scheduled_for: scheduledTime,
            window_start: windowStart,
            window_end: windowEnd,
            due_date: today,
            scheduled_time: timeStr,
            status: 'pending',
            requires_input: template.requires_input || false,
            data_payload: {
              description: template.description,
              original_title: template.title
            },
            critical: false,
            auto_generated: true,
            recurring: template.type_category === 'daily',
          });
        }
      } else {
        const { data: flocks, error: flocksError } = await supabase
          .from('flocks')
          .select('*')
          .eq('farm_id', farmId)
          .eq('status', 'active');

        if (flocksError) {
          console.error('Error fetching flocks:', flocksError);
          continue;
        }

        if (!flocks || flocks.length === 0) {
          console.log('No active flocks found for farm:', farmId);
          continue;
        }

        for (const flock of flocks) {
          if (template.flock_type_filter && template.flock_type_filter !== flock.purpose) {
            continue;
          }

          for (const timeStr of scheduledTimes) {
            const { data: existingTask } = await supabase
              .from('tasks')
              .select('id')
              .eq('farm_id', farmId)
              .eq('flock_id', flock.id)
              .eq('template_id', template.id)
              .eq('due_date', today)
              .eq('scheduled_time', timeStr)
              .maybeSingle();

            if (existingTask) {
              console.log(`Task already exists for template ${template.title} at ${timeStr}`);
              continue;
            }

            const scheduledTime = `${today}T${timeStr}:00`;
            let windowStart: string;
            let windowEnd: string;

            try {
              const scheduledDate = new Date(scheduledTime);
              if (!isNaN(scheduledDate.getTime())) {
                const startDate = new Date(scheduledDate);
                startDate.setMinutes(startDate.getMinutes() - (template.window_before_minutes || 30));
                windowStart = startDate.toISOString();

                const endDate = new Date(scheduledDate);
                endDate.setMinutes(endDate.getMinutes() + (template.window_after_minutes || 30));
                windowEnd = endDate.toISOString();
              } else {
                windowStart = scheduledTime;
                windowEnd = scheduledTime;
              }
            } catch (err) {
              console.error('Error calculating window times:', err);
              windowStart = scheduledTime;
              windowEnd = scheduledTime;
            }

            tasksToCreate.push({
              farm_id: farmId,
              flock_id: flock.id,
              template_id: template.id,
              title_override: `${template.title} - ${flock.name}`,
              scheduled_for: scheduledTime,
              window_start: windowStart,
              window_end: windowEnd,
              due_date: today,
              scheduled_time: timeStr,
              status: 'pending',
              requires_input: template.requires_input || false,
              data_payload: {
                description: template.description,
                original_title: template.title
              },
              critical: false,
              auto_generated: true,
              recurring: template.type_category === 'daily',
            });
          }
        }
      }
    }

    if (tasksToCreate.length === 0) {
      console.log('No new tasks to create');
      return 0;
    }

    console.log(`Creating ${tasksToCreate.length} tasks`);
    const { data: insertedTasks, error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToCreate)
      .select();

    if (insertError) {
      console.error('Error inserting tasks:', insertError);
      throw insertError;
    }

    console.log('Successfully inserted tasks:', insertedTasks);
    return tasksToCreate.length;
  } catch (error) {
    console.error('Error generating daily tasks:', error);
    throw error;
  }
}

export function isPastDue(dueTime: string): boolean {
  if (!dueTime) return false;
  const now = new Date();
  const [hours, minutes] = dueTime.split(':');
  const dueDate = new Date();
  dueDate.setHours(parseInt(hours), parseInt(minutes), 0);
  return now > dueDate;
}
