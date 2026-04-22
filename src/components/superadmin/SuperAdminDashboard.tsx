import { useEffect, useState } from 'react';
import {
  Users, DollarSign, Clock,
  CheckCircle, Menu, X, Activity, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface CockpitData {
  mrr: number;
  mrrDelta: number;
  pendingApprovalsCount: number;
  pendingApprovals: PendingUser[];
  recentSignups: Signup[];
  subscriberCounts: SubscriberBreakdown;
  recentActivities: ActivityRecord[];
  flaggedIssues: FlaggedIssue[];
}

interface PendingUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface Signup {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  account_status: string;
}

interface SubscriberBreakdown {
  total: number;
  free: number;
  pro: number;
  enterprise: number;
  [key: string]: number;
}

interface ActivityRecord {
  id: string;
  action_type: string;
  created_at: string;
  target_user_id: string | null;
  details: any;
}

interface FlaggedIssue {
  id: string;
  type: 'support_ticket' | 'error' | 'alert';
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export function SuperAdminDashboard() {
  const [data, setData] = useState<CockpitData>({
    mrr: 0,
    mrrDelta: 0,
    pendingApprovalsCount: 0,
    pendingApprovals: [],
    recentSignups: [],
    subscriberCounts: { total: 0, free: 0, pro: 0, enterprise: 0 },
    recentActivities: [],
    flaggedIssues: [],
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCockpitData();
  }, []);

  const loadCockpitData = async () => {
    try {
      // 1. Load MRR (Monthly Recurring Revenue)
      const now = new Date();
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [profilesRes, tiersRes, paymentsThisMonthRes, paymentsLastMonthRes] = await Promise.all([
        supabase.from('profiles').select('subscription_tier, subscription_expires_at'),
        supabase.from('subscription_tiers').select('name, price_monthly'),
        supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfThisMonth),
        supabase.from('payments').select('amount').eq('status', 'completed').gte('created_at', firstOfLastMonth).lt('created_at', firstOfThisMonth),
      ]);

      const profilesData = profilesRes.data;
      const tiersData = tiersRes.data;

      // If we have real payment records, use them. Otherwise estimate from active subscribers.
      let currentMrr = 0;
      let mrrDelta = 0;

      const paymentsThisMonth = paymentsThisMonthRes.data;
      const paymentsLastMonth = paymentsLastMonthRes.data;

      if (paymentsThisMonth && paymentsThisMonth.length > 0) {
        currentMrr = paymentsThisMonth.reduce((sum, p) => sum + (p.amount || 0), 0);
        const lastMonthTotal = (paymentsLastMonth || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        mrrDelta = currentMrr - lastMonthTotal;
      } else {
        // Fall back to estimating from active subscriptions
        const tierPrices: Record<string, number> = {};
        if (tiersData) {
          tiersData.forEach(tier => { tierPrices[tier.name] = tier.price_monthly || 0; });
        }
        if (profilesData) {
          profilesData.forEach(profile => {
            const isActive = !profile.subscription_expires_at ||
              new Date(profile.subscription_expires_at) > now;
            if (isActive && profile.subscription_tier && profile.subscription_tier !== 'free') {
              currentMrr += tierPrices[profile.subscription_tier] || 0;
            }
          });
        }
      }

      // 2. Load Pending Approvals (up to 5)
      const { data: pendingData } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at')
        .eq('account_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

      const { count: pendingCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('account_status', 'pending');

      // 3. Load Last 10 Signups
      const { data: signupsData } = await supabase
        .from('profiles')
        .select('id, email, full_name, created_at, account_status')
        .order('created_at', { ascending: false })
        .limit(10);

      // 4. Active Subscribers breakdown
      let breakdown: SubscriberBreakdown = { total: 0, free: 0, pro: 0, enterprise: 0 };
      if (profilesData) {
        breakdown.total = profilesData.length;
        profilesData.forEach(profile => {
          const tier = profile.subscription_tier || 'free';
          if (breakdown[tier] !== undefined) {
            breakdown[tier]++;
          } else {
            breakdown[tier] = 1;
          }
        });
      }

      // 5. Recent Activity (last 10 meaningful events)
      const { data: activitiesData } = await supabase
        .from('admin_actions')
        .select('id, action_type, created_at, target_user_id, details')
        .order('created_at', { ascending: false })
        .limit(10);

      // 6. Flagged Issues (support tickets - open/pending)
      let flaggedIssues: FlaggedIssue[] = [];
      try {
        const { data: ticketsData } = await supabase
          .from('support_tickets')
          .select('id, subject, priority, created_at, status')
          .in('status', ['open', 'pending'])
          .order('created_at', { ascending: false });

        if (ticketsData) {
          flaggedIssues = ticketsData.map(ticket => ({
            id: ticket.id,
            type: 'support_ticket',
            title: ticket.subject,
            priority: ticket.priority || 'low',
            created_at: ticket.created_at,
          }));
        }
      } catch (err) {
        console.warn('Support tickets table may not exist:', err);
      }

      setData({
        mrr: currentMrr,
        mrrDelta,
        pendingApprovalsCount: pendingCount || 0,
        pendingApprovals: (pendingData || []).slice(0, 5),
        recentSignups: (signupsData || []).slice(0, 10),
        subscriberCounts: breakdown,
        recentActivities: (activitiesData || []).slice(0, 10),
        flaggedIssues,
      });
    } catch (error) {
      console.error('Failed to load cockpit data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading cockpit...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Activity className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Platform Cockpit</h1>
                <p className="text-sm text-gray-600">EDENTRACK vital signs</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2"
              >
                {advancedOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                Advanced
              </button>
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
        {/* Advanced Menu Drawer */}
        {advancedOpen && <AdvancedMenuDrawer onClose={() => setAdvancedOpen(false)} />}

        {/* 1. MRR Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <MrrCard mrr={data.mrr} delta={data.mrrDelta} />

          {/* 2. Pending Approvals Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-orange-100 text-orange-600">
                <Clock className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold text-orange-600">{data.pendingApprovalsCount}</span>
            </div>
            <p className="text-gray-600 text-sm mb-4">Pending Approvals</p>
            {data.pendingApprovals.length === 0 ? (
              <p className="text-xs text-gray-500">All caught up ✓</p>
            ) : (
              <div className="space-y-2">
                {data.pendingApprovals.map(user => (
                  <div key={user.id} className="text-xs bg-gray-50 p-2 rounded flex justify-between items-center">
                    <span className="text-gray-700 truncate">{user.full_name || user.email}</span>
                    <button
                      onClick={() => window.location.hash = '#/super-admin/approvals'}
                      className="text-orange-600 hover:text-orange-700 font-semibold text-xs"
                    >
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Active Subscribers Card */}
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-green-100 text-green-600">
                <Users className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold text-green-600">{data.subscriberCounts.total}</span>
            </div>
            <p className="text-gray-600 text-sm mb-3">Active Subscribers</p>
            <div className="space-y-1 text-xs text-gray-600">
              {['free', 'pro', 'enterprise'].map(tier => {
                const count = data.subscriberCounts[tier] || 0;
                const pct = data.subscriberCounts.total > 0
                  ? Math.round((count / data.subscriberCounts.total) * 100)
                  : 0;
                return (
                  <div key={tier} className="flex justify-between">
                    <span className="capitalize">{tier}:</span>
                    <span className="font-semibold">{count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Last 10 Signups Card */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Last 10 Signups</h2>
          {data.recentSignups.length === 0 ? (
            <p className="text-gray-500 text-sm">No signups yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-gray-600 font-semibold">Name</th>
                    <th className="text-left py-2 text-gray-600 font-semibold">Email</th>
                    <th className="text-left py-2 text-gray-600 font-semibold">Signup Date</th>
                    <th className="text-left py-2 text-gray-600 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSignups.map(signup => (
                    <tr key={signup.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 text-gray-900">{signup.full_name || '—'}</td>
                      <td className="py-3 text-gray-700">{signup.email}</td>
                      <td className="py-3 text-gray-600">
                        {new Date(signup.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={signup.account_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Grid: Recent Activity + Flagged Issues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 5. Recent Activity Card */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            {data.recentActivities.length === 0 ? (
              <p className="text-gray-500 text-sm">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {data.recentActivities.map(activity => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </div>

          {/* 6. Flagged Issues Card */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4">Flagged Issues</h2>
            {data.flaggedIssues.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                  <p className="text-green-600 font-semibold">All clear ✓</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {data.flaggedIssues.map(issue => (
                  <IssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MrrCard({ mrr, delta }: { mrr: number; delta: number }) {
  const deltaPercent = delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : 'No change';
  const deltaColor = delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600';
  const deltaIcon = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500">
      <div className="flex items-center justify-between mb-4">
        <div className="p-3 rounded-lg bg-blue-100 text-blue-600">
          <DollarSign className="w-6 h-6" />
        </div>
      </div>
      <p className="text-gray-600 text-sm mb-2">MRR (Monthly Recurring Revenue)</p>
      <div className="mb-3">
        <p className="text-4xl font-bold text-gray-900">${mrr.toFixed(2)}</p>
        <p className={`text-sm mt-1 ${deltaColor} font-semibold`}>
          {deltaIcon} {deltaPercent} vs last month
        </p>
      </div>
      <button
        onClick={() => window.location.hash = '#/super-admin/billing'}
        className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
      >
        View billing details →
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    pending: 'bg-orange-100 text-orange-700',
    rejected: 'bg-red-100 text-red-700',
    suspended: 'bg-red-100 text-red-700',
  };
  const style = styles[status] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${style}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ActivityRow({ activity }: { activity: ActivityRecord }) {
  const actionLabels: Record<string, string> = {
    user_approved: 'User Approved',
    user_rejected: 'User Rejected',
    user_suspended: 'User Suspended',
    user_activated: 'User Activated',
    tier_updated: 'Pricing Updated',
    farm_created: 'Farm Created',
    subscription_upgraded: 'Subscription Upgraded',
  };

  const label = actionLabels[activity.action_type] || activity.action_type;
  const timeAgo = getTimeAgo(activity.created_at);

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="p-2 rounded-full bg-blue-100 text-blue-600 flex-shrink-0 mt-0.5">
        <Activity className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{timeAgo}</p>
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: FlaggedIssue }) {
  const priorityColors: Record<string, string> = {
    low: 'bg-blue-100 text-blue-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <div className="p-2 rounded-full bg-red-100 text-red-600 flex-shrink-0 mt-0.5">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{issue.title}</p>
        <p className="text-xs text-gray-500">{getTimeAgo(issue.created_at)}</p>
      </div>
      <span className={`px-2 py-1 rounded text-xs font-semibold flex-shrink-0 ${priorityColors[issue.priority]}`}>
        {issue.priority}
      </span>
    </div>
  );
}

function AdvancedMenuDrawer({ onClose }: { onClose: () => void }) {
  const advancedPages = [
    { label: 'Approve Users', path: '/super-admin/approvals' },
    { label: 'Manage Users', path: '/super-admin/users' },
    { label: 'Farms Management', path: '/super-admin/farms' },
    { label: 'Pricing Tiers', path: '/super-admin/pricing' },
    { label: 'Marketplace Admin', path: '/super-admin/marketplace' },
    { label: 'Announcements', path: '/super-admin/announcements' },
    { label: 'Support Tickets', path: '/super-admin/support' },
    { label: 'Activity Logs', path: '/super-admin/activity' },
    { label: 'Billing & Subscriptions', path: '/super-admin/billing' },
    { label: 'Platform Settings', path: '/super-admin/settings' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-l-4 border-gray-400">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Advanced Controls</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {advancedPages.map(page => (
          <button
            key={page.path}
            onClick={() => {
              window.location.hash = `#${page.path}`;
              onClose();
            }}
            className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left text-sm font-medium text-gray-900 transition-colors"
          >
            {page.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
