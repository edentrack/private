import { useEffect, useState } from 'react';
import {
  Users, DollarSign, TrendingUp, Clock,
  CheckCircle, Settings, Building2, Layers,
  ShoppingBag, Megaphone, MessageSquare, FileText, CreditCard
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingApprovals: number;
  totalRevenue: number;
  totalFarms: number;
  totalFlocks: number;
}

interface RecentActivity {
  id: string;
  action_type: string;
  created_at: string;
  target_user_id: string;
  admin_id: string;
  details: any;
}

export function SuperAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingApprovals: 0,
    totalRevenue: 0,
    totalFarms: 0,
    totalFlocks: 0,
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Note: last_sign_in_at is in auth.users, not profiles table
      // For now, we'll use all users as "active" or you could add a last_activity column to profiles
      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('account_status', 'active');

      const { count: pendingApprovals } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('account_status', 'pending');

      // Count farms with valid owners only (exclude orphaned farms from deleted users)
      // Use RPC function if available, otherwise use a query that filters by valid owners
      let actualFarmsCount = 0;
      try {
        // Try to get count using a join-like approach
        // Count farms where owner exists in profiles
        const { data: farmsData } = await supabase
          .from('farms')
          .select('owner_id');
        
        if (farmsData) {
          // Get all valid profile IDs
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id');
          
          const validOwnerIds = new Set((profilesData || []).map(p => p.id));
          
          // Count only farms with valid owners
          actualFarmsCount = (farmsData || []).filter(
            f => f.owner_id && validOwnerIds.has(f.owner_id)
          ).length;
        }
      } catch (error) {
        console.warn('Error counting farms with valid owners, using simple count:', error);
        // Fallback to simple count
        const { count } = await supabase
          .from('farms')
          .select('*', { count: 'exact', head: true });
        actualFarmsCount = count || 0;
      }

      const { count: totalFlocks } = await supabase
        .from('flocks')
        .select('*', { count: 'exact', head: true });

      const { data: activities } = await supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      setStats({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        pendingApprovals: pendingApprovals || 0,
        totalRevenue: 0,
        totalFarms: actualFarmsCount,
        totalFlocks: totalFlocks || 0,
      });

      setRecentActivities(activities || []);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Settings className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
                <p className="text-sm text-gray-600">EDENTRACK Platform Management</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-semibold">
                SUPER ADMIN
              </span>
              <button
                onClick={() => window.location.hash = '#/dashboard'}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                Back to App
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<Users className="w-6 h-6" />}
            label="Total Users"
            value={stats.totalUsers}
            color="blue"
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Active Users (7d)"
            value={stats.activeUsers}
            color="green"
          />
          <StatCard
            icon={<Clock className="w-6 h-6" />}
            label="Pending Approvals"
            value={stats.pendingApprovals}
            alert={stats.pendingApprovals > 0}
            color="orange"
          />
          <StatCard
            icon={<DollarSign className="w-6 h-6" />}
            label="Monthly Revenue"
            value={`$${stats.totalRevenue}`}
            color="green"
          />
          <StatCard
            icon={<Building2 className="w-6 h-6" />}
            label="Total Farms"
            value={stats.totalFarms}
            color="teal"
          />
          <StatCard
            icon={<Layers className="w-6 h-6" />}
            label="Total Flocks"
            value={stats.totalFlocks}
            color="sky"
          />
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <QuickActionButton
            to="/super-admin/approvals"
            icon={<CheckCircle className="w-5 h-5" />}
            label="Approve Users"
            badge={stats.pendingApprovals}
          />
          <QuickActionButton
            to="/super-admin/users"
            icon={<Users className="w-5 h-5" />}
            label="Manage Users"
          />
          <QuickActionButton
            to="/super-admin/farms"
            icon={<Building2 className="w-5 h-5" />}
            label="Farms Management"
          />
          <QuickActionButton
            to="/super-admin/pricing"
            icon={<DollarSign className="w-5 h-5" />}
            label="Pricing Tiers"
          />
          <QuickActionButton
            to="/super-admin/marketplace"
            icon={<ShoppingBag className="w-5 h-5" />}
            label="Marketplace Admin"
          />
          <QuickActionButton
            to="/super-admin/announcements"
            icon={<Megaphone className="w-5 h-5" />}
            label="Announcements"
          />
          <QuickActionButton
            to="/super-admin/support"
            icon={<MessageSquare className="w-5 h-5" />}
            label="Support Tickets"
          />
          <QuickActionButton
            to="/super-admin/activity"
            icon={<FileText className="w-5 h-5" />}
            label="Activity Logs"
          />
          <QuickActionButton
            to="/super-admin/billing"
            icon={<CreditCard className="w-5 h-5" />}
            label="Billing & Subscriptions"
          />
          <QuickActionButton
            to="/super-admin/settings"
            icon={<Settings className="w-5 h-5" />}
            label="Platform Settings"
          />
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
          {recentActivities.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No recent activity</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, alert, color }: any) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    teal: 'bg-teal-100 text-teal-600',
    sky: 'bg-sky-100 text-sky-600',
  };

  return (
    <div className={`bg-white rounded-xl shadow-md p-6 border-l-4 ${alert ? 'border-orange-500' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-gray-600 text-sm mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function QuickActionButton({ to, icon, label, badge }: any) {
  return (
    <button
      onClick={() => window.location.hash = `#${to}`}
      className="relative bg-white rounded-xl shadow-md p-4 hover:shadow-lg transition-shadow border border-gray-100 flex items-center gap-3 w-full text-left"
    >
      <div className="p-2 bg-green-100 rounded-lg text-green-600">
        {icon}
      </div>
      <span className="font-semibold text-gray-900">{label}</span>
      {badge > 0 && (
        <span className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}

function ActivityItem({ activity }: { activity: RecentActivity }) {
  const getActionLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      user_approved: 'User Approved',
      user_rejected: 'User Rejected',
      user_suspended: 'User Suspended',
      user_activated: 'User Activated',
      tier_updated: 'Pricing Updated',
    };
    return labels[actionType] || actionType;
  };

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-green-100 text-green-600">
          <CheckCircle className="w-4 h-4" />
        </div>
        <div>
          <p className="font-medium text-gray-900">{getActionLabel(activity.action_type)}</p>
          <p className="text-sm text-gray-600">Target User: {activity.target_user_id?.substring(0, 8)}...</p>
        </div>
      </div>
      <span className="text-sm text-gray-500">{getTimeAgo(activity.created_at)}</span>
    </div>
  );
}
