import { useEffect, useState, useRef } from 'react';
import { Bell, X, AlertTriangle, Info, AlertCircle, CheckCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Notification } from '../../types/database';
import { useTranslation } from 'react-i18next';
import { showAlertNotification, isNotificationPermitted } from '../../lib/pushNotifications';

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  action?: string;
  actionLink?: string;
}

const PUSH_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
const PUSH_GLOBAL_KEY = 'edent_push_last_shown_at';
const PUSH_ALERT_PREFIX = 'edent_push_alert_last_shown_at:'; // + alertKey

export function NotificationCenter() {
  const { user, currentFarm } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const previousAlertsRef = useRef<Set<string>>(new Set());

  const canShowPushNow = (alertKey: string) => {
    try {
      const now = Date.now();
      const globalLast = Number(localStorage.getItem(PUSH_GLOBAL_KEY) || '0');
      if (globalLast && now - globalLast < PUSH_COOLDOWN_MS) return false;

      const perAlertLast = Number(localStorage.getItem(`${PUSH_ALERT_PREFIX}${alertKey}`) || '0');
      if (perAlertLast && now - perAlertLast < PUSH_COOLDOWN_MS) return false;

      return true;
    } catch {
      // If storage is unavailable, fall back to session-only gating
      return true;
    }
  };

  const markPushShown = (alertKey: string) => {
    try {
      const now = Date.now();
      localStorage.setItem(PUSH_GLOBAL_KEY, String(now));
      localStorage.setItem(`${PUSH_ALERT_PREFIX}${alertKey}`, String(now));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (user) {
      // Defer initial fetch if we loaded less than 2 hours ago (avoids notifications on every reload)
      const lastFetch = Number(localStorage.getItem('edent_notif_last_fetch') || '0');
      const twoHours = 2 * 60 * 60 * 1000;
      if (Date.now() - lastFetch > twoHours) {
        loadNotifications();
      }
      // Load notifications every 5 minutes (localStorage updated inside loadNotifications)
      const interval = setInterval(loadNotifications, 300000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    if (currentFarm) {
      checkAlerts();
      // Check alerts less frequently - every 10 minutes instead of every minute
      const interval = setInterval(checkAlerts, 600000); // Check alerts every 10 minutes
      return () => clearInterval(interval);
    }
  }, [currentFarm]);

  const loadNotifications = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data) {
      setNotifications(data);
      const unreadNotifs = data.filter((n) => !n.read).length;
      setUnreadCount(unreadNotifs);
      try { localStorage.setItem('edent_notif_last_fetch', String(Date.now())); } catch { /* ignore */ }
    }
  };

  const checkAlerts = async () => {
    if (!currentFarm?.id) return;

    setLoadingAlerts(true);
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
      setLoadingAlerts(false);
    }
  };

  // Show push notifications when new alerts are detected (only critical ones, throttled)
  useEffect(() => {
    if (!isNotificationPermitted() || alerts.length === 0) return;

    // Only show push notifications for critical alerts to reduce noise
    // Warning and info alerts can be checked in the notification panel
    const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');
    
    criticalAlerts.forEach((alert) => {
      const alertKey = `${alert.id}-${alert.severity}`;
      
      // Only show notification for new alerts that haven't been shown recently
      if (!previousAlertsRef.current.has(alertKey) && canShowPushNow(alertKey)) {
        previousAlertsRef.current.add(alertKey);
        
        // Only show push notification for critical alerts
        showAlertNotification(
          alert.title,
          alert.description,
          alert.severity,
          alert.actionLink ? `#/${alert.actionLink}` : undefined
        )
          .then(() => markPushShown(alertKey))
          .catch(() => { /* Notification permission may be denied */ });
      }
    });

    // Clean up old alerts (keep last 50)
    const alertKeys = new Set(alerts.map(a => `${a.id}-${a.severity}`));
    previousAlertsRef.current = new Set(
      Array.from(previousAlertsRef.current).filter(key => alertKeys.has(key))
    );
  }, [alerts]);

  const checkFeedInventory = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    // Get feed inventory with feed types
    const { data: feedInventory } = await supabase
      .from('feed_inventory')
      .select('*, feed_types(id, name, unit)')
      .eq('farm_id', currentFarm.id);

    if (!feedInventory || feedInventory.length === 0) {
      // Fallback to feed_stock if feed_inventory doesn't exist
      const { data: feedStock } = await supabase
        .from('feed_stock')
        .select('id, current_stock_bags, feed_type')
        .eq('farm_id', currentFarm.id);
      
      if (feedStock && feedStock.length > 0) {
        feedStock.forEach((feed) => {
          const currentStock = Number(feed.current_stock_bags || 0);
          const feedName = feed.feed_type || 'Feed';
          
          if (currentStock <= 0) {
            alerts.push({
              id: `feed-empty-${feed.id}`,
              severity: 'critical',
              title: t('alerts.feed_empty', { feedName }) || `${feedName} is empty!`,
              description: t('alerts.feed_empty_desc') || 'Feed birds immediately - stock is depleted.',
              action: t('alerts.add_feed') || 'Add Feed',
              actionLink: 'expenses',
            });
          } else if (currentStock <= 2) {
            alerts.push({
              id: `feed-critical-${feed.id}`,
              severity: 'critical',
              title: t('alerts.feed_critical_low', { feedName }) || `${feedName} critically low`,
              description: t('alerts.feed_critical_desc', { bags: currentStock.toFixed(1) }) || `Only ${currentStock.toFixed(1)} bags left. Feed birds soon!`,
              action: t('alerts.add_feed') || 'Add Feed',
              actionLink: 'expenses',
            });
          }
        });
      }
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check each feed type for alerts
    for (const feed of feedInventory) {
      if (!feed.feed_types) continue;
      
      const feedTypeId = feed.feed_types.id;
      const feedName = feed.feed_types.name || 'Feed';
      const currentStock = Number(feed.quantity || 0);

      // Get feed givings to calculate predictions
      let daysUntilEmpty: number | null = null;
      let nextFeedingEstimate: string | null = null;
      let lastGiven: string | null = null;
      let dailyUsage = 0;

      try {
        const { data: givings } = await supabase
          .from('feed_givings')
          .select('quantity_given, given_at')
          .eq('farm_id', currentFarm.id)
          .eq('feed_type_id', feedTypeId)
          .order('given_at', { ascending: false })
          .limit(10);

        if (givings && givings.length > 0) {
          const sortedGivings = [...givings].sort((a, b) => 
            new Date(a.given_at).getTime() - new Date(b.given_at).getTime()
          );

          lastGiven = sortedGivings[sortedGivings.length - 1].given_at;

          // Calculate daily usage
          let totalDays = 0;
          let totalQuantity = 0;
          for (let i = 1; i < sortedGivings.length; i++) {
            const prev = new Date(sortedGivings[i - 1].given_at);
            const curr = new Date(sortedGivings[i].given_at);
            const daysDiff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff > 0 && daysDiff < 30) {
              totalDays += daysDiff;
              totalQuantity += Number(sortedGivings[i].quantity_given);
            }
          }

          dailyUsage = totalDays > 0 ? totalQuantity / totalDays : 0;
          daysUntilEmpty = dailyUsage > 0 && currentStock > 0
            ? Math.floor(currentStock / dailyUsage)
            : null;

          // Calculate next feeding estimate
          const avgDaysBetween = sortedGivings.length > 1 && totalDays > 0
            ? totalDays / (sortedGivings.length - 1)
            : null;

          if (avgDaysBetween && lastGiven) {
            const lastGivenDate = new Date(lastGiven);
            let estimatedDate = new Date(lastGivenDate.getTime() + avgDaysBetween * 24 * 60 * 60 * 1000);
            
            // If estimated date is in the past, add another cycle
            while (estimatedDate < today) {
              estimatedDate.setTime(estimatedDate.getTime() + avgDaysBetween * 24 * 60 * 60 * 1000);
            }
            
            nextFeedingEstimate = estimatedDate.toISOString().split('T')[0];
          }
        }
      } catch (error) {
        // feed_givings table might not exist, that's okay
      }

      // Check for critical alerts
      const nextFeedingDate = nextFeedingEstimate ? new Date(nextFeedingEstimate) : null;
      const isOverdue = nextFeedingDate && nextFeedingDate < today;

      // Alert 1: Feed is empty or days until empty is 0 or negative
      if (currentStock <= 0 || (daysUntilEmpty !== null && daysUntilEmpty <= 0)) {
        alerts.push({
          id: `feed-empty-${feed.id}`,
          severity: 'critical',
          title: `${feedName} is empty!`,
          description: 'Feed birds immediately - stock is depleted.',
          action: 'Add Feed',
          actionLink: 'expenses',
        });
        continue;
      }

      // Alert 2: Feeding is overdue (next feeding date has passed)
      if (isOverdue) {
        const daysOverdue = Math.floor((today.getTime() - nextFeedingDate!.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          id: `feed-overdue-${feed.id}`,
          severity: 'critical',
          title: t('alerts.feeding_overdue', { feedName }) || `Feeding overdue for ${feedName}`,
          description: t('alerts.feeding_overdue_desc', { days: daysOverdue }) || `Should have been fed ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago. Feed birds now!`,
          action: t('alerts.record_feed_given') || 'Record Feed Given',
          actionLink: 'dashboard',
        });
        continue;
      }

      // Alert 3: Feed is critically low (less than 1 day left)
      if (daysUntilEmpty !== null && daysUntilEmpty < 1 && currentStock > 0) {
        alerts.push({
          id: `feed-critical-${feed.id}`,
          severity: 'critical',
          title: t('alerts.feed_critical_low', { feedName }) || `${feedName} critically low`,
          description: t('alerts.feed_critical_units_desc', { units: currentStock.toFixed(1) }) || `Only ${currentStock.toFixed(1)} units left. Less than 1 day remaining. Feed birds soon!`,
          action: t('alerts.add_feed') || 'Add Feed',
          actionLink: 'expenses',
        });
        continue;
      }

      // Alert 4: Feed is low (less than 3 days left)
      if (daysUntilEmpty !== null && daysUntilEmpty < 3 && daysUntilEmpty >= 1) {
        alerts.push({
          id: `feed-low-${feed.id}`,
          severity: 'warning',
          title: t('alerts.feed_running_low', { feedName }) || `${feedName} running low`,
          description: t('alerts.feed_running_low_desc', { days: daysUntilEmpty }) || `Only ${daysUntilEmpty} day${daysUntilEmpty > 1 ? 's' : ''} left. Consider restocking soon.`,
          action: t('alerts.add_feed') || 'Add Feed',
          actionLink: 'expenses',
        });
      }
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
            title: t('alerts.egg_production_dropped') || 'Egg production decreased',
            description: t('alerts.egg_production_drop_desc', { 
              percent: Math.abs(percentChange).toFixed(1),
              thisWeek: thisWeekTotal,
              lastWeek: lastWeekTotal 
            }) || `Production dropped by ${Math.abs(percentChange).toFixed(1)}% compared to last week. This week: ${thisWeekTotal} trays, last week: ${lastWeekTotal} trays.`,
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
          title: t('alerts.high_mortality_today') || 'High mortality today',
          description: t('alerts.high_mortality_desc', { 
            today: todayDeaths, 
            avg: avgDaily.toFixed(1) 
          }) || `${todayDeaths} deaths today, significantly above the 14-day average of ${avgDaily.toFixed(1)} per day.`,
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
          title: t('alerts.critical_tasks_overdue', { count: criticalTasks.length }) || `${criticalTasks.length} critical task${criticalTasks.length > 1 ? 's' : ''} overdue`,
          description: t('alerts.critical_tasks_overdue_desc') || 'Important tasks like vaccinations or medications are past their due date.',
          action: t('alerts.view_tasks'),
          actionLink: 'tasks',
        });
      } else if (overdueTasks.length > 5) {
        alerts.push({
          id: 'overdue-tasks',
          severity: 'warning',
          title: t('alerts.tasks_overdue', { count: overdueTasks.length }) || `${overdueTasks.length} tasks overdue`,
          description: t('alerts.tasks_overdue_desc') || 'Multiple tasks are past their due date and need attention.',
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
      .neq('category', 'Equipment');

    if (otherInventory) {
      const lowItems = otherInventory.filter((item) => Number(item.quantity || 0) < 5);

      if (lowItems.length > 0) {
        alerts.push({
          id: 'low-inventory',
          severity: 'info',
          title: t('alerts.inventory_running_low', { count: lowItems.length }) || `${lowItems.length} inventory item${lowItems.length > 1 ? 's' : ''} running low`,
          description: t('alerts.inventory_running_low_desc', { 
            items: lowItems.slice(0, 2).map((i) => i.name).join(', ') 
          }) || `Items like ${lowItems.slice(0, 2).map((i) => i.name).join(', ')} need restocking.`,
          action: t('alerts.view_inventory'),
          actionLink: 'inventory',
        });
      }
    }
  };

  const getAlertIcon = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-orange-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getAlertColors = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical':
        return 'border-red-300 bg-red-50';
      case 'warning':
        return 'border-orange-300 bg-orange-50';
      case 'info':
        return 'border-blue-300 bg-blue-50';
    }
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    loadNotifications();
  };

  const markAllAsRead = async () => {
    await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', user?.id)
      .eq('read', false);
    loadNotifications();
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'critical':
      case 'alert':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return <CheckCircle className="w-5 h-5 text-green-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-50 border-red-200';
      case 'high':
        return 'bg-orange-50 border-orange-200';
      case 'medium':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-6 h-6 text-gray-700" />
        {(unreadCount > 0 || alerts.length > 0) && (
          <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {(unreadCount + alerts.length) > 9 ? '9+' : (unreadCount + alerts.length)}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPanel(false)}
          />
          <div className="absolute right-0 top-12 w-[calc(100vw-1rem)] sm:w-96 bg-white rounded-2xl shadow-2xl z-50 max-h-[min(80vh,600px)] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {t('alerts.notifications_title') || 'Alerts & Notifications'}
                {(alerts.length > 0 || unreadCount > 0) && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({alerts.length + unreadCount})
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-[#3D5F42] hover:text-[#2F4A34] font-medium"
                  >
                    {t('alerts.mark_all_read') || 'Mark all read'}
                  </button>
                )}
                <button
                  onClick={() => setShowPanel(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {alerts.length === 0 && notifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>{t('alerts.no_alerts') || 'No alerts or notifications'}</p>
                </div>
              ) : (
                <>
                  {alerts.length > 0 && (
                    <div className="p-4 border-b border-gray-200">
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                        {t('alerts.active_alerts', { count: alerts.length }) || `Active Alerts (${alerts.length})`}
                      </h4>
                      <div className="space-y-3">
                        {alerts.map((alert) => (
                          <div
                            key={alert.id}
                            className={`border-2 rounded-xl p-3 cursor-pointer transition-all hover:shadow-md ${getAlertColors(alert.severity)}`}
                            onClick={() => {
                              if (alert.actionLink) {
                                const link = alert.actionLink.startsWith('#')
                                  ? alert.actionLink
                                  : `#/${alert.actionLink}`;
                                window.location.hash = link;
                                setShowPanel(false);
                                // Trigger navigation in the app
                                window.dispatchEvent(new HashChangeEvent('hashchange'));
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-0.5">
                                {getAlertIcon(alert.severity)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 text-sm mb-1">
                                  {alert.title}
                                </p>
                                <p className="text-xs text-gray-700 mb-2">
                                  {alert.description}
                                </p>
                                {alert.action && alert.actionLink && (
                                  <div className="flex items-center gap-1 text-xs font-medium text-[#3D5F42]">
                                    {alert.action}
                                    <ChevronRight className="w-3 h-3" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {notifications.length > 0 && (
                    <div className={alerts.length > 0 ? "p-4" : ""}>
                      {alerts.length > 0 && (
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          {t('alerts.notifications', { count: notifications.length }) || `Notifications (${notifications.length})`}
                        </h4>
                      )}
                      <div className="divide-y divide-gray-100">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                              !notification.read ? 'bg-blue-50/50' : ''
                            }`}
                            onClick={() => {
                              if (!notification.read) markAsRead(notification.id);
                              if (notification.action_url) {
                                const url = notification.action_url.startsWith('#')
                                  ? notification.action_url
                                  : `#/${notification.action_url}`;
                                window.location.hash = url;
                                setShowPanel(false);
                                // Trigger navigation in the app
                                window.dispatchEvent(new HashChangeEvent('hashchange'));
                              }
                            }}
                          >
                            <div className="flex gap-3">
                              <div className="flex-shrink-0 mt-1">
                                {getIcon(notification.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-medium text-gray-900 text-sm">
                                    {notification.title}
                                  </p>
                                  {!notification.read && (
                                    <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1" />
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mt-1">
                                  {notification.message}
                                </p>
                                <p className="text-xs text-gray-400 mt-2">
                                  {new Date(notification.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
