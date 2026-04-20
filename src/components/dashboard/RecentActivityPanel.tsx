import { useEffect, useState } from 'react';
import { Activity, DollarSign, Syringe, AlertTriangle, Scale, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: {
    flock_name?: string;
    count?: number;
    amount?: number;
    category?: string;
    vaccine_name?: string;
    [key: string]: any;
  };
  created_at: string;
}

export function RecentActivityPanel() {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      loadActivities();
    }
  }, [profile]);

  const loadActivities = async () => {
    try {
      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setActivities(data || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (entityType: string) => {
    switch (entityType) {
      case 'expense':
        return <DollarSign className="w-4 h-4" />;
      case 'vaccination':
        return <Syringe className="w-4 h-4" />;
      case 'mortality':
        return <AlertTriangle className="w-4 h-4" />;
      case 'weight':
        return <Scale className="w-4 h-4" />;
      case 'flock':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (entityType: string) => {
    switch (entityType) {
      case 'expense':
        return 'bg-amber-100 text-amber-600';
      case 'vaccination':
        return 'bg-blue-100 text-blue-600';
      case 'mortality':
        return 'bg-red-100 text-red-600';
      case 'weight':
        return 'bg-emerald-100 text-emerald-600';
      case 'flock':
        return 'bg-neon-100 text-neon-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="section-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-circle-gray">
            <Activity className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-gray-900">Recent Activity</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="section-card">
      <div className="flex items-center gap-3 mb-6">
        <div className="icon-circle-gray">
          <Activity className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-gray-900">Recent Activity</h3>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Activity className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium mb-1">No recent activity</p>
          <p className="text-sm text-gray-400">
            Activity will appear here as you manage your farm
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className={`p-2 rounded-lg ${getActivityColor(activity.entity_type)}`}>
                {getActivityIcon(activity.entity_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 break-words">
                  {activity.action}
                </p>
                {activity.details.flock_name && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {activity.details.flock_name}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {formatTimeAgo(activity.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
