import { useEffect, useState } from 'react';
import { Bell, CheckCircle, AlertCircle, Info, AlertTriangle, Trash2, CheckCheck } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Notification } from '../../types/database';

const iconFor = (type: string) => {
  if (type === 'success') return <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />;
  if (type === 'error' || type === 'critical') return <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />;
  if (type === 'warning') return <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />;
  return <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />;
};

export function NotificationsPage() {
  const { user, currentFarm } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications(data || []);
    setLoading(false);
  };

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (!unread.length) return;
    await supabase.from('notifications').update({ read: true }).in('id', unread);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const remove = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
            <p className="text-xs text-gray-500">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:text-blue-700"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Bell className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No notifications yet</p>
          <p className="text-gray-400 text-sm mt-1">Farm alerts and updates will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${
                n.read ? 'bg-white border-gray-100' : 'bg-blue-50 border-blue-100'
              }`}
            >
              <div className="mt-0.5">{iconFor(n.type || 'info')}</div>
              <div className="flex-1 min-w-0" onClick={() => !n.read && markRead(n.id)} style={{ cursor: n.read ? 'default' : 'pointer' }}>
                <p className={`text-sm ${n.read ? 'text-gray-700' : 'text-gray-900 font-medium'}`}>{n.title || n.message}</p>
                {n.title && n.message && (
                  <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              <button onClick={() => remove(n.id)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
                <Trash2 className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
