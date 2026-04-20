import { Task } from '../types/database';

export function enrichTask(task: any): Task {
  return {
    ...task,
    title: task.title_override || 'Task',
    description: task.notes || '',
    completed: task.status === 'completed',
  };
}

export function enrichTasks(tasks: any[]): Task[] {
  return tasks.map(enrichTask);
}
