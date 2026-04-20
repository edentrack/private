import { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Calendar, Scale, Download, Trash2, Edit2, X, Target, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Flock } from '../../types/database';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../contexts/ToastContext';
import { calculateCurrentWeek, getTargetWeight } from '../../utils/growthTargets';

interface WeightLog {
  id: string;
  date: string;
  average_weight: number;
  sample_size: number;
  min_weight: number;
  max_weight: number;
  std_dev: number;
  coefficient_variation: number;
  total_estimated_weight: number;
  daily_gain: number | null;
  market_ready: boolean;
  individual_weights: number[];
}

interface WeightHistoryViewProps {
  flock: Flock;
  onBack: () => void;
}

export function WeightHistoryView({ flock, onBack }: WeightHistoryViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<WeightLog | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [savingDate, setSavingDate] = useState(false);

  useEffect(() => {
    loadHistory();
  }, [flock.id]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('flock_id', flock.id)
        .order('date', { ascending: false });

      setLogs(data || []);
    } catch (error) {
      console.error('Error loading weight history:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Avg Weight (kg)', 'Sample Size', 'Min Weight', 'Max Weight', 'CV %', 'Daily Gain (g)', 'Total Flock Weight (kg)', 'Market Ready'];
    const rows = logs.map(log => [
      new Date(log.date).toLocaleDateString(),
      log.average_weight.toFixed(2),
      log.sample_size,
      log.min_weight.toFixed(2),
      log.max_weight.toFixed(2),
      log.coefficient_variation.toFixed(1),
      log.daily_gain ? log.daily_gain.toFixed(0) : 'N/A',
      log.total_estimated_weight.toFixed(0),
      log.market_ready ? 'Yes' : 'No'
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weight_history_${flock.name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (logId: string) => {
    if (deleteConfirmId !== logId) {
      setDeleteConfirmId(logId);
      return;
    }

    setDeletingId(logId);
    try {
      const { error } = await supabase
        .from('weight_logs')
        .delete()
        .eq('id', logId);

      if (error) throw error;

      toast.success(t('weight.delete_success') || 'Weight record deleted successfully');
      setLogs(logs.filter(log => log.id !== logId));
      setDeleteConfirmId(null);
      
      // Reload to update graphs
      loadHistory();
    } catch (error) {
      console.error('Error deleting weight record:', error);
      toast.error(t('weight.delete_error') || 'Failed to delete weight record');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditDate = (log: WeightLog) => {
    setEditingDateId(log.id);
    setEditDate(log.date.split('T')[0]); // Extract date part from ISO string
  };

  const handleSaveDate = async (logId: string) => {
    setSavingDate(true);
    try {
      const { error } = await supabase
        .from('weight_logs')
        .update({ date: editDate })
        .eq('id', logId);

      if (error) throw error;

      toast.success(t('weight.date_updated') || 'Date updated successfully');
      setEditingDateId(null);
      setEditDate('');
      
      // Reload to update graphs and list
      loadHistory();
      
      // Update selected log if it's the one being edited
      if (selectedLog && selectedLog.id === logId) {
        const updatedLog = logs.find(l => l.id === logId);
        if (updatedLog) {
          setSelectedLog({ ...updatedLog, date: editDate });
        }
      }
    } catch (error) {
      console.error('Error updating date:', error);
      toast.error(t('weight.date_update_error') || 'Failed to update date');
    } finally {
      setSavingDate(false);
    }
  };

  const calculateAnalysisResults = (log: WeightLog) => {
    // Normalize dates to midnight for accurate calculations
    const logDate = new Date(log.date);
    logDate.setHours(0, 0, 0, 0);
    const arrivalDate = new Date(flock.arrival_date);
    arrivalDate.setHours(0, 0, 0, 0);
    const ageInDays = Math.floor((logDate.getTime() - arrivalDate.getTime()) / (1000 * 60 * 60 * 24));
    const currentWeek = Math.floor(ageInDays / 7) + 1;
    
    const targetData = getTargetWeight(flock.type, currentWeek);
    const targetWeight = targetData?.weight || 0;
    const percentOfTarget = targetWeight > 0 ? (log.average_weight / targetWeight) * 100 : 0;
    
    let growthStatus = '';
    let statusColor = '';
    if (percentOfTarget >= 105) {
      growthStatus = 'Excellent - Above Target';
      statusColor = 'green';
    } else if (percentOfTarget >= 95) {
      growthStatus = 'Good - On Target';
      statusColor = 'green';
    } else if (percentOfTarget >= 85) {
      growthStatus = 'Fair - Slightly Below Target';
      statusColor = 'yellow';
    } else {
      growthStatus = 'Poor - Below Target';
      statusColor = 'red';
    }

    return {
      currentWeek,
      targetWeight,
      percentOfTarget,
      growthStatus,
      statusColor,
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading history...</div>
      </div>
    );
  }

  if (selectedLog) {
    const analysis = calculateAnalysisResults(selectedLog);
    
    return (
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={() => setSelectedLog(null)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to History
        </button>

        <div className="bg-white rounded-3xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Weight Check Results</h2>
              <div className="flex items-center gap-4">
                <p className="text-gray-600">{new Date(selectedLog.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                {editingDateId === selectedLog.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="px-2.5 py-1.5 bg-white border border-gray-900 rounded-lg text-gray-900 text-sm"
                    />
                    <button
                      onClick={() => handleSaveDate(selectedLog.id)}
                      disabled={savingDate}
                      className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      {savingDate ? t('common.loading') || 'Saving...' : t('common.save') || 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDateId(null);
                        setEditDate('');
                      }}
                      disabled={savingDate}
                      className="p-1.5 text-gray-600 hover:text-gray-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEditDate(selectedLog)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
                    title={t('weight.edit_date') || 'Edit date'}
                  >
                    <Edit2 className="w-4 h-4" />
                    {t('weight.edit_date') || 'Edit Date'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Analysis Summary */}
          <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-6">
            <div className="grid md:grid-cols-3 gap-4 text-center mb-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">Current Age</div>
                <div className="text-2xl font-bold text-gray-900">Week {analysis.currentWeek}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Average Weight</div>
                <div className="text-2xl font-bold text-gray-900">{selectedLog.average_weight.toFixed(2)} kg</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Target for Week {analysis.currentWeek}</div>
                <div className="text-2xl font-bold text-gray-900">{analysis.targetWeight.toFixed(2)} kg</div>
              </div>
            </div>
            
            <div className={`border-l-4 p-4 rounded ${
              analysis.statusColor === 'green' ? 'border-green-500 bg-green-50' :
              analysis.statusColor === 'yellow' ? 'border-yellow-500 bg-yellow-50' :
              'border-red-500 bg-red-50'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5" />
                <p className="font-bold text-lg">{analysis.growthStatus}</p>
              </div>
              <p className="text-sm text-gray-700">
                Your birds are at {analysis.percentOfTarget.toFixed(1)}% of target weight for Week {analysis.currentWeek}.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="text-sm text-gray-600 mb-1">Average Weight</div>
              <div className="text-3xl font-bold text-gray-900">{selectedLog.average_weight.toFixed(2)} kg</div>
            </div>
            <div className="bg-green-50 rounded-2xl p-4">
              <div className="text-sm text-gray-600 mb-1">Sample Size</div>
              <div className="text-3xl font-bold text-gray-900">{selectedLog.sample_size}</div>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4">
              <div className="text-sm text-gray-600 mb-1">Weight Range</div>
              <div className="text-lg font-bold text-gray-900">{selectedLog.min_weight.toFixed(2)} - {selectedLog.max_weight.toFixed(2)} kg</div>
            </div>
            <div className="bg-purple-50 rounded-2xl p-4">
              <div className="text-sm text-gray-600 mb-1">Variation (CV)</div>
              <div className="text-3xl font-bold text-gray-900">{selectedLog.coefficient_variation.toFixed(1)}%</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-6">
            <h3 className="font-bold text-lg text-gray-900 mb-4">Flock Estimates</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-600 mb-1">Total Birds</div>
                <div className="text-2xl font-bold text-gray-900">{flock.current_count?.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 mb-1">Estimated Total Weight</div>
                <div className="text-2xl font-bold text-gray-900">{selectedLog.total_estimated_weight.toLocaleString()} kg</div>
              </div>
            </div>
          </div>

          {selectedLog.daily_gain !== null && (
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-4">Growth Performance</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm text-gray-600 mb-1">Daily Gain</div>
                  <div className="text-3xl font-bold text-gray-900">{selectedLog.daily_gain.toFixed(0)} g/day</div>
                </div>
                {flock.type === 'Broiler' && selectedLog.market_ready && (
                  <div className="bg-green-100 border-2 border-green-300 rounded-xl px-6 py-3">
                    <div className="text-green-800 font-bold">Market Ready</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedLog.individual_weights && selectedLog.individual_weights.length > 0 && (
            <div className="bg-gray-50 rounded-2xl p-6">
              <h3 className="font-bold text-lg text-gray-900 mb-4">Individual Weights</h3>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                {selectedLog.individual_weights.map((weight, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-2 text-center">
                    <div className="text-xs text-gray-500">#{idx + 1}</div>
                    <div className="font-bold text-sm text-gray-900">{weight.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Weight Check
      </button>

      <div className="bg-white rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Weight Check History</h2>
            <p className="text-gray-600">{flock.name} - {logs.length} checks recorded</p>
          </div>
          {logs.length > 0 && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-xl font-medium hover:bg-[#f5f0e8] transition-all"
            >
              <Download className="w-5 h-5" />
              Export CSV
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Scale className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p>No weight checks recorded yet</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl p-6 mb-6">
              <h3 className="font-bold text-lg text-gray-900 mb-4">Progress Overview</h3>
              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Latest Weight</div>
                  <div className="text-2xl font-bold text-gray-900">{logs[0].average_weight.toFixed(2)} kg</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">First Weight</div>
                  <div className="text-2xl font-bold text-gray-900">{logs[logs.length - 1].average_weight.toFixed(2)} kg</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Total Gain</div>
                  <div className="text-2xl font-bold text-green-600">
                    +{(logs[0].average_weight - logs[logs.length - 1].average_weight).toFixed(2)} kg
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Avg Daily Gain</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {logs[0].daily_gain ? `${logs[0].daily_gain.toFixed(0)} g/day` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {logs.map((log, index) => {
                const previousLog = logs[index + 1];
                const weightChange = previousLog ? log.average_weight - previousLog.average_weight : null;

                return (
                  <div
                    key={log.id}
                    className="bg-gray-50 hover:bg-gray-100 rounded-2xl p-6 transition-all border-2 border-transparent hover:border-[#3D5F42]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <div className="flex items-center gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-gray-500" />
                            <span className="font-bold text-gray-900">
                              {new Date(log.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          {log.market_ready && flock.type === 'Broiler' && (
                            <span className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full">
                              Market Ready
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Avg Weight</div>
                            <div className="text-xl font-bold text-gray-900">{log.average_weight.toFixed(2)} kg</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Sample Size</div>
                            <div className="text-xl font-bold text-gray-900">{log.sample_size}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">CV</div>
                            <div className="text-xl font-bold text-gray-900">{log.coefficient_variation.toFixed(1)}%</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Daily Gain</div>
                            <div className="text-xl font-bold text-gray-900">
                              {log.daily_gain ? `${log.daily_gain.toFixed(0)} g` : 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 mb-1">Total Weight</div>
                            <div className="text-xl font-bold text-gray-900">{log.total_estimated_weight.toLocaleString()} kg</div>
                          </div>
                        </div>

                        {weightChange !== null && (
                          <div className="mt-3 flex items-center gap-2">
                            {weightChange > 0 ? (
                              <>
                                <TrendingUp className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-green-600">
                                  +{weightChange.toFixed(2)} kg since last check
                                </span>
                              </>
                            ) : weightChange < 0 ? (
                              <>
                                <TrendingDown className="w-4 h-4 text-red-600" />
                                <span className="text-sm font-medium text-red-600">
                                  {weightChange.toFixed(2)} kg since last check
                                </span>
                              </>
                            ) : (
                              <span className="text-sm text-gray-500">No change since last check</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {deleteConfirmId === log.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(log.id);
                              }}
                              disabled={deletingId === log.id}
                              className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingId === log.id ? t('common.loading') || 'Deleting...' : t('common.confirm') || 'Confirm'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(null);
                              }}
                              disabled={deletingId === log.id}
                              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                            >
                              {t('common.cancel') || 'Cancel'}
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditDate(log);
                              }}
                              className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                              title={t('weight.edit_date') || 'Edit date'}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmId(log.id);
                              }}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('weight.delete_record') || 'Delete record'}
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
