import { Task, UserRole } from '../types/database';

export interface TaskCompletionCheck {
  allowed: boolean;
  reason?: string;
  isOutsideWindow?: boolean;
}

export function canUserCompleteTask(
  role: UserRole,
  task: Task,
  now: Date = new Date()
): TaskCompletionCheck {
  if (task.status === 'completed') {
    return { allowed: false, reason: 'Task already completed' };
  }

  const scheduledDate = new Date(task.scheduled_for || task.due_date || now);
  const todayStr = now.toISOString().split('T')[0];
  const scheduledStr = scheduledDate.toISOString().split('T')[0];

  if (scheduledStr !== todayStr && role === 'worker') {
    return { allowed: false, reason: 'Task not scheduled for today' };
  }

  return { allowed: true };
}

export function getTaskTimeStatus(task: Task, now: Date = new Date()): 'upcoming' | 'due_now' | 'overdue' | 'anytime' {
  const todayStr = now.toISOString().split('T')[0];
  const scheduledDateStr = task.due_date || task.scheduled_for;

  if (!scheduledDateStr) {
    return 'anytime';
  }

  const scheduledDate = new Date(scheduledDateStr);
  const scheduledDateOnlyStr = scheduledDate.toISOString().split('T')[0];

  if (scheduledDateOnlyStr < todayStr) {
    return 'overdue';
  }

  if (scheduledDateOnlyStr === todayStr) {
    if (task.scheduled_time) {
      const [hours, minutes] = task.scheduled_time.split(':');
      const scheduledTime = new Date(now);
      scheduledTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      if (now > scheduledTime) {
        return 'due_now';
      }
    }
    return 'anytime';
  }

  return 'upcoming';
}

export function formatTaskDueTime(task: Task): string {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const scheduledDateStr = task.scheduled_for || task.due_date;

  if (!scheduledDateStr) {
    return 'No due date';
  }

  const scheduledDate = new Date(scheduledDateStr);
  const scheduledDateOnlyStr = scheduledDate.toISOString().split('T')[0];

  const dateDisplay = scheduledDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  if (!task.scheduled_time) {
    if (scheduledDateOnlyStr < todayStr) {
      return `Was due ${dateDisplay}`;
    } else if (scheduledDateOnlyStr === todayStr) {
      return 'Any time today';
    } else {
      return `Due ${dateDisplay}`;
    }
  }

  const [hours, minutes] = task.scheduled_time.split(':');
  const hour = parseInt(hours, 10);
  const minute = parseInt(minutes, 10);

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute.toString().padStart(2, '0');

  const timeDisplay = `${displayHour}:${displayMinute} ${ampm}`;

  if (scheduledDateOnlyStr < todayStr) {
    return `Was due ${dateDisplay} at ${timeDisplay}`;
  } else if (scheduledDateOnlyStr === todayStr) {
    return `Due ${timeDisplay}`;
  } else {
    return `Due ${dateDisplay} at ${timeDisplay}`;
  }
}
