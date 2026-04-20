import { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action?: string;
  actionLink?: string;
}

export function AlertCenter() {
  const { currentFarm } = useAuth();
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentFarm) {
      checkAlerts();
    }
  }, [currentFarm]);

  const checkAlerts = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    const detectedAlerts: Alert[] = [];

    try {
      await Promise.all([
        checkFeedInventory(detectedAlerts),
        checkEggProduction(detectedAlerts),
        checkMortality(detectedAlerts),
        checkOverdueTasks(detectedAlerts),
        checkLowInventory(detectedAlerts),
      ]);

      setAlerts(detectedAlerts);
    } catch (error) {
      console.error('Error checking alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkFeedInventory = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    const { data: feedInventory } = await supabase
      .from('feed_inventory')
      .select('*, feed_types(name)')
      .eq('farm_id', currentFarm.id);

    if (!feedInventory) return;

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentUsage } = await supabase
      .from('feed_usage_logs')
      .select('quantity_used')
      .eq('farm_id', currentFarm.id)
      .gte('created_at', last7Days);

    if (recentUsage && recentUsage.length > 0) {
      const totalUsage = recentUsage.reduce((sum, m) => sum + Number(m.quantity_used || 0), 0);
      const avgDailyUsage = totalUsage / 7;

      feedInventory.forEach((feed) => {
        const currentStock = Number(feed.quantity || 0);
        const daysRemaining = avgDailyUsage > 0 ? currentStock / avgDailyUsage : 999;
        const feedName = feed.feed_types?.name || 'Feed';

        if (daysRemaining < 3 && currentStock > 0) {
          alerts.push({
            id: `feed-low-${feed.id}`,
            severity: daysRemaining < 1 ? 'critical' : 'warning',
            title: `${feedName} running low`,
            description: `Only ${currentStock.toFixed(1)} units left. At current usage, this will last ${daysRemaining.toFixed(1)} days.`,
            action: t('alerts.add_to_inventory'),
            actionLink: 'expenses',
          });
        }
      });
    }
  };

  const checkEggProduction = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: thisWeek } = await supabase
      .from('egg_collections')
      .select('trays')
      .eq('farm_id', currentFarm.id)
      .gte('collected_on', weekAgo)
      .lte('collected_on', today);

    const { data: lastWeek } = await supabase
      .from('egg_collections')
      .select('trays')
      .eq('farm_id', currentFarm.id)
      .gte('collected_on', twoWeeksAgo)
      .lt('collected_on', weekAgo);

    if (thisWeek && lastWeek && lastWeek.length > 0) {
      const thisWeekTotal = thisWeek.reduce((sum, c) => sum + (c.trays || 0), 0);
      const lastWeekTotal = lastWeek.reduce((sum, c) => sum + (c.trays || 0), 0);

      if (lastWeekTotal > 0) {
        const percentChange = ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100;

        if (percentChange < -15) {
          alerts.push({
            id: 'egg-production-drop',
            severity: percentChange < -20 ? 'critical' : 'warning',
            title: 'Egg production decreased',
            description: `Production dropped by ${Math.abs(percentChange).toFixed(1)}% compared to last week. This week: ${thisWeekTotal} trays, last week: ${lastWeekTotal} trays.`,
            action: t('alerts.view_analytics'),
            actionLink: 'analytics',
          });
        }
      }
    }
  };

  const checkMortality = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    const last14Days = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const { data: recentMortality } = await supabase
      .from('mortality_logs')
      .select('count, event_date')
      .eq('farm_id', currentFarm.id)
      .gte('event_date', last14Days)
      .lte('event_date', today);

    if (recentMortality && recentMortality.length > 0) {
      const totalDeaths = recentMortality.reduce((sum, m) => sum + (m.count || 0), 0);
      const avgDaily = totalDeaths / 14;

      const todayDeaths = recentMortality
        .filter((m) => m.event_date === today)
        .reduce((sum, m) => sum + (m.count || 0), 0);

      if (todayDeaths > avgDaily * 2 && todayDeaths > 0) {
        alerts.push({
          id: 'mortality-spike',
          severity: 'critical',
          title: 'High mortality today',
          description: `${todayDeaths} deaths today, significantly above the 14-day average of ${avgDaily.toFixed(1)} per day.`,
          action: t('alerts.view_mortality_logs'),
          actionLink: 'mortality',
        });
      }
    }
  };

  const checkOverdueTasks = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    const today = new Date().toISOString().split('T')[0];

    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('title_override, due_date')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'pending')
      .lt('due_date', today);

    if (overdueTasks && overdueTasks.length > 0) {
      const criticalTasks = overdueTasks.filter(
        (t) => (t.title_override || '').toLowerCase().includes('vaccination') ||
               (t.title_override || '').toLowerCase().includes('medication')
      );

      if (criticalTasks.length > 0) {
        alerts.push({
          id: 'overdue-critical-tasks',
          severity: 'critical',
          title: `${criticalTasks.length} critical task${criticalTasks.length > 1 ? 's' : ''} overdue`,
          description: `Important tasks like vaccinations or medications are past their due date.`,
          action: t('alerts.view_tasks'),
          actionLink: 'tasks',
        });
      } else if (overdueTasks.length > 5) {
        alerts.push({
          id: 'overdue-tasks',
          severity: 'warning',
          title: `${overdueTasks.length} tasks overdue`,
          description: `Multiple tasks are past their due date and need attention.`,
          action: t('alerts.view_tasks'),
          actionLink: 'tasks',
        });
      }
    }
  };

  const checkLowInventory = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    const { data: otherInventory } = await supabase
      .from('other_inventory_items')
      .select('name, quantity, unit, category')
      .eq('farm_id', currentFarm.id)
      .neq('category', 'Equipment'); // Exclude Equipment from low stock alerts

    if (otherInventory) {
      const lowItems = otherInventory.filter((item) => Number(item.quantity || 0) < 5);

      if (lowItems.length > 0) {
        alerts.push({
          id: 'low-inventory',
          severity: 'info',
          title: `${lowItems.length} inventory item${lowItems.length > 1 ? 's' : ''} running low`,
          description: `Items like ${lowItems.slice(0, 2).map((i) => i.name).join(', ')} need restocking.`,
          action: t('alerts.view_inventory'),
          actionLink: 'inventory',
        });
      }
    }
  };

  const getSeverityIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      case 'info':
        return <Info className="w-5 h-5" />;
    }
  };

  const getSeverityColors = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'border-red-300 bg-red-50 text-red-900';
      case 'warning':
        return 'border-orange-300 bg-orange-50 text-orange-900';
      case 'info':
        return 'border-blue-300 bg-blue-50 text-blue-900';
    }
  };

  const getSeverityIconBg = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-600';
      case 'warning':
        return 'bg-orange-100 text-orange-600';
      case 'info':
        return 'bg-blue-100 text-blue-600';
    }
  };

  if (loading) {
    return (
      <div className="section-card animate-fade-in">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="section-card animate-fade-in">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Alerts</h2>
        <div className="text-center py-6">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Info className="w-7 h-7 text-green-600" />
          </div>
          <p className="text-gray-600 font-medium">All clear!</p>
          <p className="text-sm text-gray-400 mt-1">No alerts at this time</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Alerts</h2>
        <span className="badge-red">
          {alerts.length} active
        </span>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`border-2 rounded-2xl p-4 ${getSeverityColors(alert.severity)}`}
          >
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg ${getSeverityIconBg(alert.severity)}`}>
                {getSeverityIcon(alert.severity)}
              </div>
              <div className="flex-1">
                <h3 className="font-bold mb-1">{alert.title}</h3>
                <p className="text-sm opacity-90 mb-3">{alert.description}</p>
                {alert.action && (
                  <button
                    className="flex items-center gap-2 text-sm font-medium hover:underline"
                  >
                    {alert.action}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
