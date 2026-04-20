import { useEffect, useState } from 'react';
import { Activity, Search, Filter, Download, User, Calendar, FileText, DollarSign, Syringe, AlertTriangle, Scale, TrendingUp, Package, ShoppingCart, Users, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any>;
  created_at: string;
  farm_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
}

export function FarmActivityAudit() {
  const { t } = useTranslation();
  const { currentFarm, profile } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    if (currentFarm?.id) {
      loadLogs();
    }
  }, [currentFarm?.id, filterType, dateFilter]);

  const loadLogs = async () => {
    if (!currentFarm?.id) return;
    
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (filterType !== 'all') {
        query = query.eq('entity_type', filterType);
      }

      // Apply date filter
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0);
        }
        
        query = query.gte('created_at', startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with user information
      const enrichedLogs = await Promise.all(
        (data || []).map(async (log) => {
          let userName = null;
          let userEmail = null;

          if (log.user_id) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('id', log.user_id)
              .single();
            
            userName = userData?.full_name || null;
            userEmail = userData?.email || null;
          }

          return {
            ...log,
            user_name: userName,
            user_email: userEmail,
          };
        })
      );

      setLogs(enrichedLogs);
    } catch (error: any) {
      console.error('Failed to load activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Date & Time', 'User', 'Action', 'Type', 'Details'].join(','),
      ...filteredLogs.map(log => [
        new Date(log.created_at).toLocaleString(),
        log.user_name || log.user_email || 'Unknown',
        `"${log.action.replace(/"/g, '""')}"`,
        log.entity_type,
        `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `farm-activity-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log =>
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const entityTypes = Array.from(new Set(logs.map(log => log.entity_type)));

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
      case 'inventory':
        return <Package className="w-4 h-4" />;
      case 'egg_sale':
      case 'egg_collection':
        return <ShoppingCart className="w-4 h-4" />;
      case 'team':
        return <Users className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getActivityColor = (entityType: string) => {
    switch (entityType) {
      case 'expense':
        return 'bg-amber-100 text-amber-700';
      case 'vaccination':
        return 'bg-blue-100 text-blue-700';
      case 'mortality':
        return 'bg-red-100 text-red-700';
      case 'weight':
        return 'bg-emerald-100 text-emerald-700';
      case 'flock':
        return 'bg-neon-100 text-neon-700';
      case 'inventory':
        return 'bg-purple-100 text-purple-700';
      case 'egg_sale':
      case 'egg_collection':
        return 'bg-green-100 text-green-700';
      case 'team':
        return 'bg-indigo-100 text-indigo-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-agri-brown-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('audit.loading') || 'Loading activity logs...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">{t('audit.title') || 'Farm Activity Audit'}</h2>
          <p className="text-gray-500 mt-1">{t('audit.subtitle') || 'Track all activities and see who did what on your farm'}</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-agri-brown-600 text-white rounded-xl hover:bg-agri-brown-700 transition-colors font-medium"
        >
          <Download className="w-4 h-4" />
          {t('audit.export') || 'Export CSV'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={t('audit.search_placeholder') || 'Search by user, action, or type...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-brown-500 focus:border-transparent text-gray-900 bg-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-brown-500 text-gray-900 bg-white"
            >
              <option value="all">{t('audit.all_types') || 'All Types'}</option>
              {entityTypes.map(type => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-brown-500 text-gray-900 bg-white"
            >
              <option value="all">{t('audit.all_dates') || 'All Dates'}</option>
              <option value="today">{t('audit.today') || 'Today'}</option>
              <option value="week">{t('audit.last_week') || 'Last 7 Days'}</option>
              <option value="month">{t('audit.last_month') || 'Last 30 Days'}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('audit.date_time') || 'Date & Time'}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('audit.user') || 'User'}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('audit.action') || 'Action'}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('audit.type') || 'Type'}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('audit.details') || 'Details'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {formatDate(log.created_at)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-agri-brown-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-agri-brown-700" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {log.user_name || log.user_email || 'Unknown User'}
                        </div>
                        {log.user_name && log.user_email && (
                          <div className="text-xs text-gray-500">{log.user_email}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {log.action}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getActivityColor(log.entity_type)} flex items-center gap-1`}>
                        {getActivityIcon(log.entity_type)}
                        {log.entity_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <details className="cursor-pointer">
                        <summary className="text-agri-brown-600 hover:text-agri-brown-800 font-medium">
                          {t('audit.view_details') || 'View Details'}
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-w-md">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-gray-400">{t('audit.no_details') || 'No details'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-lg font-medium">{t('audit.no_logs') || 'No activity logs found'}</p>
            <p className="text-sm mt-1">{t('audit.no_logs_desc') || 'Activity logs will appear here as team members perform actions'}</p>
          </div>
        )}
      </div>

      {filteredLogs.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          {t('audit.showing') || 'Showing'} {filteredLogs.length} {t('audit.of') || 'of'} {logs.length} {t('audit.activities') || 'activities'}
        </div>
      )}
    </div>
  );
}
