import { useEffect, useState, useCallback } from 'react';
import { Bell, X, AlertTriangle, Info, AlertCircle, CheckCircle, ChevronRight, RefreshCw } from 'lucide-react';
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

const DISMISS_KEY = 'edent_dismissed_alerts';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;
// Stores IDs of critical alerts already pushed — prevents re-firing on app reopen
const PUSHED_ALERTS_KEY = 'edent_pushed_alert_ids';

function getDismissed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}'); } catch { return {}; }
}

function dismissAlert(id: string) {
  const dismissed = getDismissed();
  dismissed[id] = Date.now() + DISMISS_TTL_MS;
  // Clean up expired entries while we're here
  const now = Date.now();
  for (const key of Object.keys(dismissed)) {
    if (dismissed[key] < now) delete dismissed[key];
  }
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed)); } catch { /* ignore */ }
}

function isAlertDismissed(id: string): boolean {
  const dismissed = getDismissed();
  return !!dismissed[id] && dismissed[id] > Date.now();
}

function getPushedAlertIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(PUSHED_ALERTS_KEY) || '[]')); } catch { return new Set(); }
}

function savePushedAlertIds(ids: string[]) {
  try { localStorage.setItem(PUSHED_ALERTS_KEY, JSON.stringify(ids)); } catch {}
}

export function NotificationCenter() {
  const { user, currentFarm } = useAuth();
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter(n => !n.read).length);
    }
  }, [user]);

  const checkAlerts = useCallback(async () => {
    if (!currentFarm?.id) return;
    const detectedAlerts: Alert[] = [];
    try {
      await Promise.all([
        checkFeedInventory(detectedAlerts),
        checkEggProduction(detectedAlerts),
        checkMortality(detectedAlerts),
        checkOverdueTasks(detectedAlerts),
        checkOutOfStockInventory(detectedAlerts),
      ]);
      setAlerts(detectedAlerts.filter(a => !isAlertDismissed(a.id)));
    } catch (e) {
      console.error('[NotificationCenter] checkAlerts error:', e);
    }
  }, [currentFarm?.id]);

  // Initial load
  useEffect(() => {
    if (user) loadNotifications();
  }, [user]);

  useEffect(() => {
    if (currentFarm) {
      checkAlerts();
      const interval = setInterval(checkAlerts, 10 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [currentFarm]);

  // Refresh immediately every time the panel opens
  useEffect(() => {
    if (showPanel) {
      loadNotifications();
      checkAlerts();
    }
  }, [showPanel]);

  // Push notifications: only fire for alerts that weren't present on last check.
  // IDs are persisted in localStorage so reopening the app never re-spams old alerts.
  useEffect(() => {
    if (!isNotificationPermitted() || alerts.length === 0) return;
    const alreadyPushed = getPushedAlertIds();
    const newCritical = alerts.filter(a => a.severity === 'critical' && !alreadyPushed.has(a.id));
    newCritical.forEach(alert => {
      showAlertNotification(alert.title, alert.description, alert.severity, alert.actionLink ? `#/${alert.actionLink}` : undefined)
        .catch(() => {});
    });
    // Persist the current set of critical IDs — these won't fire again until they disappear and come back
    savePushedAlertIds(alerts.filter(a => a.severity === 'critical').map(a => a.id));
  }, [alerts]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadNotifications(), checkAlerts()]);
    setRefreshing(false);
  };

  const handleDismiss = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    dismissAlert(alertId);
    setAlerts(prev => prev.filter(a => a.id !== alertId));
  };

  // ── Alert checks ─────────────────────────────────────────────────────────

  const checkFeedInventory = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;

    // Try feed_inventory first (newer schema)
    const { data: feedInventory } = await supabase
      .from('feed_inventory')
      .select('id, quantity, feed_types(id, name)')
      .eq('farm_id', currentFarm.id);

    if (feedInventory && feedInventory.length > 0) {
      const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: usageLogs } = await supabase
        .from('feed_usage_logs')
        .select('quantity_used')
        .eq('farm_id', currentFarm.id)
        .gte('created_at', last7Days);

      const avgDailyUsage = usageLogs && usageLogs.length > 0
        ? usageLogs.reduce((s, r) => s + Number(r.quantity_used || 0), 0) / 7
        : 0;

      for (const feed of feedInventory) {
        const stock = Number(feed.quantity || 0);
        const name = (feed.feed_types as any)?.name || 'Feed';
        const daysLeft = avgDailyUsage > 0 ? stock / avgDailyUsage : null;

        if (stock <= 0) {
          alerts.push({ id: `feed-empty-${feed.id}`, severity: 'critical', title: `${name} is empty`, description: 'Feed is depleted — restock immediately.', action: 'Go to Inventory', actionLink: 'inventory' });
        } else if (daysLeft !== null && daysLeft < 1) {
          alerts.push({ id: `feed-critical-${feed.id}`, severity: 'critical', title: `${name} critically low`, description: `Less than 1 day of feed remaining at current usage (${stock.toFixed(1)} units left).`, action: 'Go to Inventory', actionLink: 'inventory' });
        } else if (daysLeft !== null && daysLeft < 3) {
          alerts.push({ id: `feed-low-${feed.id}`, severity: 'warning', title: `${name} running low`, description: `About ${Math.floor(daysLeft)} day${daysLeft >= 2 ? 's' : ''} of feed remaining (${stock.toFixed(1)} units).`, action: 'Go to Inventory', actionLink: 'inventory' });
        }
      }
      return;
    }

    // Fallback: feed_stock table (older schema)
    const { data: feedStock } = await supabase
      .from('feed_stock')
      .select('id, current_stock_bags, feed_type')
      .eq('farm_id', currentFarm.id);

    if (feedStock) {
      for (const feed of feedStock) {
        const stock = Number(feed.current_stock_bags || 0);
        const name = feed.feed_type || 'Feed';
        if (stock <= 0) {
          alerts.push({ id: `feed-empty-${feed.id}`, severity: 'critical', title: `${name} is empty`, description: 'Feed is depleted — restock immediately.', action: 'Go to Inventory', actionLink: 'inventory' });
        } else if (stock <= 2) {
          alerts.push({ id: `feed-critical-${feed.id}`, severity: 'critical', title: `${name} critically low`, description: `Only ${stock} bag${stock !== 1 ? 's' : ''} remaining.`, action: 'Go to Inventory', actionLink: 'inventory' });
        }
      }
    }
  };

  const checkEggProduction = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [{ data: thisWeek }, { data: lastWeek }] = await Promise.all([
      supabase.from('egg_collections').select('trays').eq('farm_id', currentFarm.id).gte('collected_on', weekAgo).lte('collected_on', today),
      supabase.from('egg_collections').select('trays').eq('farm_id', currentFarm.id).gte('collected_on', twoWeeksAgo).lt('collected_on', weekAgo),
    ]);
    if (!thisWeek || !lastWeek || lastWeek.length === 0) return;
    const thisTotal = thisWeek.reduce((s, c) => s + (c.trays || 0), 0);
    const lastTotal = lastWeek.reduce((s, c) => s + (c.trays || 0), 0);
    if (lastTotal > 0) {
      const pct = ((thisTotal - lastTotal) / lastTotal) * 100;
      if (pct < -20) {
        alerts.push({ id: 'egg-production-drop', severity: 'critical', title: 'Egg production dropped sharply', description: `Down ${Math.abs(pct).toFixed(0)}% vs last week (${thisTotal} trays this week vs ${lastTotal} last week).`, action: 'View Analytics', actionLink: 'analytics' });
      } else if (pct < -15) {
        alerts.push({ id: 'egg-production-drop', severity: 'warning', title: 'Egg production declining', description: `Down ${Math.abs(pct).toFixed(0)}% vs last week (${thisTotal} trays this week vs ${lastTotal} last week).`, action: 'View Analytics', actionLink: 'analytics' });
      }
    }
  };

  const checkMortality = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const last14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data } = await supabase.from('mortality_logs').select('count, event_date').eq('farm_id', currentFarm.id).gte('event_date', last14).lte('event_date', today);
    if (!data || data.length === 0) return;
    const total = data.reduce((s, m) => s + (m.count || 0), 0);
    const avgDaily = total / 14;
    const todayDeaths = data.filter(m => m.event_date === today).reduce((s, m) => s + (m.count || 0), 0);
    if (todayDeaths > avgDaily * 2 && todayDeaths > 0) {
      alerts.push({ id: 'mortality-spike', severity: 'critical', title: 'Mortality spike today', description: `${todayDeaths} deaths today vs 14-day average of ${avgDaily.toFixed(1)}/day. Investigate immediately.`, action: 'View Mortality Log', actionLink: 'mortality' });
    }
  };

  const checkOverdueTasks = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('tasks').select('title_override, due_date').eq('farm_id', currentFarm.id).eq('status', 'pending').lt('due_date', today);
    if (!data || data.length === 0) return;
    const critical = data.filter(t => {
      const title = (t.title_override || '').toLowerCase();
      return title.includes('vaccination') || title.includes('medication');
    });
    if (critical.length > 0) {
      alerts.push({ id: 'overdue-critical-tasks', severity: 'critical', title: `${critical.length} critical task${critical.length > 1 ? 's' : ''} overdue`, description: 'Vaccinations or medications are past due.', action: 'View Tasks', actionLink: 'tasks' });
    } else if (data.length > 5) {
      alerts.push({ id: 'overdue-tasks', severity: 'warning', title: `${data.length} tasks overdue`, description: 'Multiple tasks are past their due date.', action: 'View Tasks', actionLink: 'tasks' });
    }
  };

  // Only alert on items that are completely out of stock — no arbitrary threshold
  const checkOutOfStockInventory = async (alerts: Alert[]) => {
    if (!currentFarm?.id) return;
    const { data } = await supabase
      .from('other_inventory_items')
      .select('name, quantity, category')
      .eq('farm_id', currentFarm.id)
      .neq('category', 'Equipment');
    if (!data) return;
    const outOfStock = data.filter(item => Number(item.quantity || 0) <= 0);
    if (outOfStock.length > 0) {
      const names = outOfStock.slice(0, 3).map(i => i.name).join(', ');
      const extra = outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : '';
      alerts.push({ id: 'out-of-stock-inventory', severity: 'warning', title: `${outOfStock.length} item${outOfStock.length > 1 ? 's' : ''} out of stock`, description: `${names}${extra} — restock when possible.`, action: 'View Inventory', actionLink: 'inventory' });
    }
  };

  // ── DB notification actions ───────────────────────────────────────────────

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ read: true, read_at: new Date().toISOString() }).eq('user_id', user?.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const alertColors: Record<AlertSeverity, string> = {
    critical: 'border-red-200 bg-red-50',
    warning: 'border-orange-200 bg-orange-50',
    info: 'border-blue-200 bg-blue-50',
  };

  const alertIcon = (s: AlertSeverity) => ({
    critical: <AlertTriangle className="w-4 h-4 text-red-600" />,
    warning: <AlertCircle className="w-4 h-4 text-orange-600" />,
    info: <Info className="w-4 h-4 text-blue-600" />,
  }[s]);

  const notifIcon = (type: string) => {
    if (type === 'critical' || type === 'alert') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (type === 'warning') return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    if (type === 'info') return <Info className="w-4 h-4 text-blue-500" />;
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  // Badge reflects only unread DB notifications so it matches what the Notifications page shows.
  // Live alerts are visible in the panel dropdown but do not inflate the badge count.
  const totalBadge = unreadCount;

  return (
    <div className="relative">
      <button onClick={() => setShowPanel(p => !p)} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
        <Bell className="w-6 h-6 text-gray-700" />
        {totalBadge > 0 && (
          <span className="absolute top-0 right-0 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {totalBadge > 9 ? '9+' : totalBadge}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute right-0 top-12 w-[calc(100vw-1rem)] sm:w-96 bg-white rounded-2xl shadow-2xl z-50 max-h-[min(80vh,600px)] overflow-hidden flex flex-col">

            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-900 text-sm">Alerts & Notifications</h3>
                {totalBadge > 0 && <span className="text-xs text-gray-400">({totalBadge})</span>}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-[#3D5F42] hover:text-[#2F4A34] font-medium px-2 py-1">
                    Mark all read
                  </button>
                )}
                <button onClick={handleRefresh} disabled={refreshing} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50" title="Refresh">
                  <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setShowPanel(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {alerts.length === 0 && notifications.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700">All clear</p>
                  <p className="text-xs text-gray-400 mt-1">No alerts or notifications right now</p>
                </div>
              ) : (
                <>
                  {/* Live alerts */}
                  {alerts.length > 0 && (
                    <div className="p-3 space-y-2 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">Active Alerts ({alerts.length})</p>
                      {alerts.map(alert => (
                        <div
                          key={alert.id}
                          className={`border rounded-xl p-3 cursor-pointer transition-all hover:shadow-sm ${alertColors[alert.severity]}`}
                          onClick={() => {
                            if (alert.actionLink) {
                              window.location.hash = alert.actionLink.startsWith('#') ? alert.actionLink : `#/${alert.actionLink}`;
                              window.dispatchEvent(new HashChangeEvent('hashchange'));
                              setShowPanel(false);
                            }
                          }}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5 shrink-0">{alertIcon(alert.severity)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 text-xs leading-tight">{alert.title}</p>
                              <p className="text-xs text-gray-600 mt-0.5 leading-snug">{alert.description}</p>
                              {alert.action && (
                                <div className="flex items-center gap-1 mt-1.5 text-xs font-medium text-[#3D5F42]">
                                  {alert.action} <ChevronRight className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={e => handleDismiss(e, alert.id)}
                              className="shrink-0 p-1 hover:bg-black/5 rounded-lg transition-colors"
                              title="Dismiss for 24 hours"
                            >
                              <X className="w-3 h-3 text-gray-400" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* DB notifications */}
                  {notifications.length > 0 && (
                    <div className={alerts.length > 0 ? 'p-3' : ''}>
                      {alerts.length > 0 && (
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mb-2">Notifications ({notifications.length})</p>
                      )}
                      <div className="divide-y divide-gray-50">
                        {notifications.map(n => (
                          <div
                            key={n.id}
                            className={`px-3 py-3 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
                            onClick={() => {
                              if (!n.read) markAsRead(n.id);
                              if (n.action_url) {
                                window.location.hash = n.action_url.startsWith('#') ? n.action_url : `#/${n.action_url}`;
                                window.dispatchEvent(new HashChangeEvent('hashchange'));
                                setShowPanel(false);
                              }
                            }}
                          >
                            <div className="shrink-0 mt-0.5">{notifIcon(n.type)}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-gray-900 leading-tight">{n.title}</p>
                                {!n.read && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1" />}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                              <p className="text-xs text-gray-300 mt-1">{new Date(n.created_at).toLocaleString()}</p>
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
