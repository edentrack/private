import { useEffect, useState } from 'react';
import { ArrowLeft, Search, Filter, Download } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface ActivityLog {
  id: string;
  action_type: string;
  created_at: string;
  target_user_id: string | null;
  admin_id: string | null;
  details: any;
  farm_id?: string | null;
  user_email?: string | null;
  admin_email?: string | null;
}

const PAGE_SIZE = 50;

export function ActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setPage(0);
    setLogs([]);
    loadLogs(0);
  }, [filterType]);

  const loadLogs = async (pageNum: number) => {
    setLoading(true);
    try {
      let query = supabase
        .from('admin_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (filterType !== 'all') {
        query = query.eq('action_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;

      setHasMore((data || []).length === PAGE_SIZE);

      // Enrich with user emails
      const enrichedLogs = await Promise.all(
        (data || []).map(async (log) => {
          let userEmail = null;
          let adminEmail = null;

          if (log.target_user_id) {
            const { data: userData } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', log.target_user_id)
              .single();
            userEmail = userData?.email || null;
          }

          if (log.admin_id) {
            const { data: adminData } = await supabase
              .from('profiles')
              .select('email')
              .eq('id', log.admin_id)
              .single();
            adminEmail = adminData?.email || null;
          }

          return { ...log, user_email: userEmail, admin_email: adminEmail };
        })
      );

      setLogs(prev => pageNum === 0 ? enrichedLogs : [...prev, ...enrichedLogs]);
    } catch (error: any) {
      console.error('Failed to load logs:', error);
      // Show error in console for debugging
      if (error.message) {
        console.error('Error details:', error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csv = [
      ['Action Type', 'Admin', 'Target User', 'Date', 'Details'].join(','),
      ...logs.map(log => [
        log.action_type,
        log.admin_email || 'N/A',
        log.user_email || 'N/A',
        new Date(log.created_at).toLocaleString(),
        JSON.stringify(log.details || {})
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log =>
    log.action_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.admin_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const actionTypes = Array.from(new Set(logs.map(log => log.action_type)));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading activity logs...</p>
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
              <h1 className="text-2xl font-bold text-gray-900">Activity Logs</h1>
              <p className="text-gray-600">Comprehensive audit trail of all platform activities</p>
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

        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by action type, admin, or user email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
              >
                <option value="all">All Actions</option>
                {actionTypes.map(type => (
                  <option key={type} value={type}>{type.replace(/_/g, ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admin</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <ActionBadge action={log.action_type} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.admin_email || 'System'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.user_email || log.target_user_id?.substring(0, 8) || 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {log.details ? (
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 hover:text-blue-800">View Details</summary>
                          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-auto max-w-md">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">No details</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredLogs.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">
              No activity logs found
            </div>
          )}

          {hasMore && !searchTerm && (
            <div className="flex justify-center py-4 border-t">
              <button
                onClick={() => { const next = page + 1; setPage(next); loadLogs(next); }}
                disabled={loading}
                className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const getActionLabel = (actionType: string) => {
    return actionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getActionColor = (actionType: string) => {
    if (actionType.includes('approved') || actionType.includes('activated')) {
      return 'bg-green-100 text-green-700';
    }
    if (actionType.includes('rejected') || actionType.includes('suspended')) {
      return 'bg-red-100 text-red-700';
    }
    if (actionType.includes('updated') || actionType.includes('created')) {
      return 'bg-blue-100 text-blue-700';
    }
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getActionColor(action)}`}>
      {getActionLabel(action)}
    </span>
  );
}












