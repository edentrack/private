import { useState, useEffect } from 'react';
import { Clock, Loader2, ChevronDown, ChevronRight, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';

interface ActivityLog {
  id: string;
  event_type: string;
  details: Record<string, any>;
  created_at: string;
  actor_id: string;
  actor_full_name: string;
  actor_email: string;
  target_id: string | null;
  target_full_name: string | null;
  target_email: string | null;
}

interface TeamActivityLogProps {
  farmId: string;
  refreshTrigger?: number;
}

const LIMIT_OPTIONS = [5, 10, 25, 50, 100];

export function TeamActivityLog({ farmId, refreshTrigger = 0 }: TeamActivityLogProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(5);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadInitialLogs();
  }, [farmId, limit, refreshTrigger]);

  const loadInitialLogs = async () => {
    setLoading(true);
    setError(null);
    setOffset(0);
    setLogs([]);
    await fetchLogs(0, limit, false);
    setLoading(false);
  };

  const fetchLogs = async (currentOffset: number, currentLimit: number, append: boolean) => {
    try {
      const { data: logsData, error: logsError } = await supabase.rpc('get_team_activity_logs', {
        p_farm_id: farmId,
        p_limit: currentLimit,
        p_offset: currentOffset
      });

      if (logsError) throw logsError;

      const { data: countData, error: countError } = await supabase.rpc('count_team_activity_logs', {
        p_farm_id: farmId
      });

      if (countError) throw countError;

      const formattedLogs = (logsData || []).map((log: any) => ({
        id: log.id,
        event_type: log.event_type,
        details: log.details || {},
        created_at: log.created_at,
        actor_id: log.actor_id,
        actor_full_name: log.actor_full_name,
        actor_email: log.actor_email,
        target_id: log.target_id,
        target_full_name: log.target_full_name,
        target_email: log.target_email
      }));

      if (append) {
        setLogs(prev => [...prev, ...formattedLogs]);
      } else {
        setLogs(formattedLogs);
      }

      const totalFetched = append ? currentOffset + formattedLogs.length : formattedLogs.length;
      setHasMore(countData !== null && totalFetched < countData);
    } catch (err: any) {
      console.error('Error loading activity logs:', err);
      setError(err.message || 'Failed to load activity logs');
    }
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const newOffset = offset + limit;
    setOffset(newOffset);
    await fetchLogs(newOffset, limit, true);
    setLoadingMore(false);
  };

  const handleLimitChange = (newLimit: number) => {
    setLimit(newLimit);
  };

  const toggleRow = (logId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const handleDownload = () => {
    const csvContent = [
      ['Timestamp', 'Actor', 'Action', 'Target', 'Details'].join(','),
      ...logs.map(log => {
        const timestamp = new Date(log.created_at).toLocaleString();
        const actor = `"${log.actor_full_name} (${log.actor_email})"`;
        const action = `"${formatSummary(log)}"`;
        const target = log.target_full_name ? `"${log.target_full_name} (${log.target_email})"` : '""';
        const details = `"${JSON.stringify(log.details).replace(/"/g, '""')}"`;
        return [timestamp, actor, action, target, details].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `team-activity-log-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatSummary = (log: ActivityLog): string => {
    const targetName = log.target_full_name || t('team.unknown') || 'Unknown';
    const details = log.details || {};

    switch (log.event_type) {
      case 'role_changed':
        return t('team.log_role_changed', { name: targetName, oldRole: t(`team.${details.old_role}`), newRole: t(`team.${details.new_role}`) }) || `changed ${targetName}'s role from ${details.old_role} to ${details.new_role}`;
      case 'status_changed':
        return details.is_active
          ? t('team.log_reactivated', { name: targetName }) || `reactivated ${targetName}`
          : t('team.log_deactivated', { name: targetName }) || `deactivated ${targetName}`;
      case 'member_added':
        return t('team.log_member_added', { email: details.email, role: t(`team.${details.role}`) }) || `added ${details.email} as ${details.role}`;
      case 'member_updated':
        return t('team.log_member_updated', { email: details.email, role: t(`team.${details.role}`) }) || `updated ${details.email}'s role to ${details.role}`;
      case 'compensation_updated':
        return details.message || t('team.log_compensation_updated', { name: targetName }) || `updated ${targetName}'s compensation`;
      default:
        return t('team.log_performed_action', { action: log.event_type }) || `performed action: ${log.event_type}`;
    }
  };

  const renderExpandedDetails = (log: ActivityLog) => {
    const details = log.details || {};

    return (
      <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">Actor</span>
            <p className="text-sm text-gray-900 mt-0.5">{log.actor_full_name}</p>
            <p className="text-xs text-gray-600">{log.actor_email}</p>
          </div>

          {log.target_id && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">{t('team.target_user') || 'Target User'}</span>
              <p className="text-sm text-gray-900 mt-0.5">{log.target_full_name}</p>
              <p className="text-xs text-gray-600">{log.target_email}</p>
            </div>
          )}

          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">{t('team.action_type') || 'Action Type'}</span>
            <p className="text-sm text-gray-900 mt-0.5 capitalize">{log.event_type.replace(/_/g, ' ')}</p>
          </div>

          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">{t('team.timestamp') || 'Timestamp'}</span>
            <p className="text-sm text-gray-900 mt-0.5">
              {new Date(log.created_at).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })}
            </p>
          </div>
        </div>

        {Object.keys(details).length > 0 && (
          <div className="pt-2 border-t border-gray-200">
            <span className="text-xs font-medium text-gray-500 uppercase">{t('common.details')}</span>
            <div className="mt-1 space-y-1">
              {Object.entries(details).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs text-gray-600 font-medium min-w-[100px]">{key}:</span>
                  <span className="text-xs text-gray-900">
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">{t('team.activity_log')}</h3>
        </div>
        <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg">
          <Loader2 className="w-6 h-6 animate-spin text-green-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">{t('team.activity_log')}</h3>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t('team.show') || 'Show:'}
            <select
              value={limit}
              onChange={(e) => handleLimitChange(Number(e.target.value))}
              className="px-2 sm:px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              {LIMIT_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <button
            onClick={handleDownload}
            disabled={logs.length === 0}
            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download CSV"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={loadInitialLogs}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
          <span className="font-medium">{t('team.note') || 'Note:'}</span> {t('team.activity_log_note') || 'Activity logs are automatically deleted every week to maintain optimal performance.'}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{t('team.error_loading_logs') || 'Error loading activity logs'}</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
          <button
            onClick={loadInitialLogs}
            className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {logs.length === 0 && !error ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">{t('team.no_activity') || 'No activity yet.'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {logs.map((log) => {
              const isExpanded = expandedRows.has(log.id);
              return (
                <div key={log.id} className="transition-colors">
                  <button
                    onClick={() => toggleRow(log.id)}
                    className="w-full p-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-gray-400">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{log.actor_full_name}</span>
                          {' '}
                          {formatSummary(log)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(log.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  </button>
                  {isExpanded && renderExpandedDetails(log)}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('common.loading') || 'Loading...'}
                  </>
                ) : (
                  <>
                    {t('team.load_more') || 'Load More'}
                  </>
                )}
              </button>
            </div>
          )}

          {!hasMore && logs.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-sm text-gray-500">{t('team.all_activity_loaded') || 'All activity loaded'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
