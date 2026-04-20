import { supabase } from '../lib/supabaseClient';

interface CreateNotificationParams {
  farmId: string;
  userId: string;
  type: 'alert' | 'reminder' | 'info' | 'warning' | 'critical';
  category: 'feed_low' | 'task_overdue' | 'mortality_high' | 'medication_expiry' | 'equipment' | 'financial' | 'general';
  title: string;
  message: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  actionUrl?: string;
  metadata?: any;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    const { error } = await supabase.from('notifications').insert({
      farm_id: params.farmId,
      user_id: params.userId,
      type: params.type,
      category: params.category,
      title: params.title,
      message: params.message,
      priority: params.priority || 'medium',
      action_url: params.actionUrl,
      metadata: params.metadata || {},
    });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

export async function checkFeedLevels(farmId: string, userId: string) {
  const { data: feedStock } = await supabase
    .from('feed_stock')
    .select('*')
    .eq('farm_id', farmId);

  if (feedStock) {
    for (const feed of feedStock) {
      if (feed.current_stock_bags <= 5) {
        await createNotification({
          farmId,
          userId,
          type: 'warning',
          category: 'feed_low',
          title: 'Low Feed Stock',
          message: `${feed.feed_type} is running low (${feed.current_stock_bags} bags remaining)`,
          priority: feed.current_stock_bags <= 2 ? 'high' : 'medium',
          actionUrl: '#inventory',
        });
      }
    }
  }
}

export async function checkOverdueTasks(farmId: string, userId: string) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('farm_id', farmId)
    .eq('completed', false)
    .lt('due_date', new Date().toISOString());

  if (tasks && tasks.length > 0) {
    await createNotification({
      farmId,
      userId,
      type: 'alert',
      category: 'task_overdue',
      title: 'Overdue Tasks',
      message: `You have ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}`,
      priority: 'high',
      actionUrl: '#tasks',
    });
  }
}

export async function checkMortalityRate(farmId: string, userId: string, flockId: string) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: mortality } = await supabase
    .from('mortality_logs')
    .select('count')
    .eq('farm_id', farmId)
    .eq('flock_id', flockId)
    .gte('date', sevenDaysAgo.toISOString());

  if (mortality) {
    const totalDeaths = mortality.reduce((sum, log) => sum + log.count, 0);

    if (totalDeaths > 50) {
      await createNotification({
        farmId,
        userId,
        type: 'critical',
        category: 'mortality_high',
        title: 'High Mortality Alert',
        message: `${totalDeaths} birds lost in the last 7 days. Immediate action may be required.`,
        priority: 'critical',
        actionUrl: '#mortality',
      });
    }
  }
}

export async function checkMedicationExpiry(farmId: string, userId: string) {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const { data: medications } = await supabase
    .from('medication_inventory')
    .select('*')
    .eq('farm_id', farmId)
    .lte('expiry_date', thirtyDaysFromNow.toISOString())
    .gt('current_stock', 0);

  if (medications && medications.length > 0) {
    for (const med of medications) {
      const daysUntilExpiry = Math.ceil(
        (new Date(med.expiry_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      await createNotification({
        farmId,
        userId,
        type: 'warning',
        category: 'medication_expiry',
        title: 'Medication Expiring Soon',
        message: `${med.name} expires in ${daysUntilExpiry} days`,
        priority: daysUntilExpiry <= 7 ? 'high' : 'medium',
      });
    }
  }
}

export async function runAllChecks(farmId: string, userId: string, flockId?: string) {
  await Promise.all([
    checkFeedLevels(farmId, userId),
    checkOverdueTasks(farmId, userId),
    checkMedicationExpiry(farmId, userId),
    flockId ? checkMortalityRate(farmId, userId, flockId) : Promise.resolve(),
  ]);
}
