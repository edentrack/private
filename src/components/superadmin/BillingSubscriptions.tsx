import { useEffect, useState } from 'react';
import { ArrowLeft, DollarSign, TrendingUp, Download, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';

interface SubscriptionData {
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  subscription_tier: string;
  subscription_expires_at: string | null;
  farm_name: string | null;
  created_at: string;
  status: 'active' | 'expired' | 'cancelled';
}

interface RevenueStats {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  failedPayments: number;
}

export function BillingSubscriptions() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [stats, setStats] = useState<RevenueStats>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0,
    failedPayments: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    loadSubscriptions();
  }, [filterTier]);

  const loadSubscriptions = async () => {
    try {
      // Load all profiles with subscription info
      let query = supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          subscription_tier,
          subscription_expires_at,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (filterTier !== 'all') {
        query = query.eq('subscription_tier', filterTier);
      }

      const { data: profiles, error } = await query;
      if (error) throw error;

      // Get farm info for each user
      const subscriptionsWithFarms = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: farmData } = await supabase
            .from('farms')
            .select('name')
            .eq('owner_id', profile.id)
            .limit(1)
            .single();

          const isExpired = profile.subscription_expires_at 
            ? new Date(profile.subscription_expires_at) < new Date()
            : false;

          return {
            user_id: profile.id,
            user_email: profile.email,
            user_name: profile.full_name,
            subscription_tier: profile.subscription_tier || 'free',
            subscription_expires_at: profile.subscription_expires_at,
            farm_name: farmData?.name || null,
            created_at: profile.created_at,
            status: isExpired ? 'expired' : 'active' as 'active' | 'expired' | 'cancelled',
          };
        })
      );

      setSubscriptions(subscriptionsWithFarms);

      // Calculate stats
      const activeCount = subscriptionsWithFarms.filter(s => s.status === 'active').length;
      const expiredCount = subscriptionsWithFarms.filter(s => s.status === 'expired').length;

      // Load subscription tiers for revenue calculation
      const { data: tiers } = await supabase
        .from('subscription_tiers')
        .select('*');

      // Calculate revenue (simplified - would need payment records for accurate calculation)
      let totalRevenue = 0;
      let monthlyRevenue = 0;

      if (tiers) {
        subscriptionsWithFarms.forEach(sub => {
          const tier = tiers.find(t => t.name === sub.subscription_tier);
          if (tier && sub.status === 'active') {
            totalRevenue += tier.price_monthly || 0;
            monthlyRevenue += tier.price_monthly || 0;
          }
        });
      }

      setStats({
        totalRevenue,
        monthlyRevenue,
        activeSubscriptions: activeCount,
        expiredSubscriptions: expiredCount,
        failedPayments: 0, // Would need payment records table
      });
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
      showToast('Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      ['User Email', 'User Name', 'Farm Name', 'Tier', 'Status', 'Expires At', 'Created'].join(','),
      ...subscriptions.map(sub => [
        sub.user_email || 'N/A',
        sub.user_name || 'N/A',
        sub.farm_name || 'N/A',
        sub.subscription_tier,
        sub.status,
        sub.subscription_expires_at || 'N/A',
        new Date(sub.created_at).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscriptions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSubscriptions = subscriptions.filter(sub =>
    sub.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.farm_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading subscriptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => window.location.hash = '#/super-admin'}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Billing & Subscriptions</h1>
              <p className="text-gray-600">Manage subscriptions and view revenue analytics</p>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard
            icon={<DollarSign className="w-6 h-6" />}
            label="Total Revenue"
            value={`$${stats.totalRevenue.toFixed(2)}`}
            color="green"
          />
          <StatCard
            icon={<TrendingUp className="w-6 h-6" />}
            label="Monthly Revenue"
            value={`$${stats.monthlyRevenue.toFixed(2)}`}
            color="blue"
          />
          <StatCard
            icon={<DollarSign className="w-6 h-6" />}
            label="Active Subscriptions"
            value={stats.activeSubscriptions}
            color="teal"
          />
          <StatCard
            icon={<AlertCircle className="w-6 h-6" />}
            label="Expired"
            value={stats.expiredSubscriptions}
            color="orange"
          />
          <StatCard
            icon={<AlertCircle className="w-6 h-6" />}
            label="Failed Payments"
            value={stats.failedPayments}
            color="red"
          />
        </div>

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by user email, name, or farm name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            >
              <option value="all">All Tiers</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Farm</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{sub.user_name || 'No name'}</p>
                        <p className="text-sm text-gray-600">{sub.user_email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {sub.farm_name || 'No farm'}
                    </td>
                    <td className="px-6 py-4">
                      <TierBadge tier={sub.subscription_tier} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {sub.subscription_expires_at 
                        ? new Date(sub.subscription_expires_at).toLocaleDateString()
                        : 'Never'
                      }
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(sub.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSubscriptions.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No subscriptions found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    blue: 'bg-blue-100 text-blue-600',
    teal: 'bg-teal-100 text-teal-600',
    orange: 'bg-orange-100 text-orange-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-4 border-l-4 border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
      <p className="text-gray-600 text-sm mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    free: 'bg-gray-100 text-gray-700',
    pro: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-purple-100 text-purple-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[tier] || 'bg-gray-100 text-gray-700'}`}>
      {tier.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status] || 'bg-gray-100 text-gray-700'}`}>
      {status.toUpperCase()}
    </span>
  );
}












