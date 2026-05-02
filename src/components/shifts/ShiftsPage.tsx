import { useEffect, useState } from 'react';
import { Calendar, Clock, Users, Filter, Loader2, AlertCircle, CheckCircle, Save, Repeat, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { FarmMemberWithProfile } from '../../types/database';
import { CreateRecurringShiftModal } from './CreateRecurringShiftModal';
import { RecurringShiftsList } from './RecurringShiftsList';

interface Shift {
  id: string;
  farm_id: string;
  worker_id: string;
  worker_name: string;
  worker_email: string;
  worker_role: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'missed';
  created_by: string;
  created_at: string;
}

export function ShiftsPage() {
  const { t } = useTranslation();
  const { profile, currentFarm, currentRole } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [members, setMembers] = useState<FarmMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOwnerOrManager = currentRole === 'owner' || currentRole === 'manager';

  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [workerFilter, setWorkerFilter] = useState<string>('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');

  const [updatingShiftId, setUpdatingShiftId] = useState<string | null>(null);
  const [editingStatuses, setEditingStatuses] = useState<Record<string, string>>({});

  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [recurringRefreshTrigger, setRecurringRefreshTrigger] = useState(0);

  const [viewMode, setViewMode] = useState<'two-day' | 'calendar'>('two-day');
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  useEffect(() => {
    if (currentFarm?.id) {
      loadData();
    }
  }, [currentFarm?.id]);

  useEffect(() => {
    if (currentFarm?.id) {
      loadShifts();
    }
  }, [currentFarm?.id, statusFilter, workerFilter, startDateFilter, endDateFilter, viewMode, currentWeekStart]);

  const loadData = async () => {
    await Promise.all([loadMembers(), loadShifts()]);
  };

  const loadMembers = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_farm_members_with_emails', {
        p_farm_id: currentFarm.id
      });

      if (error) throw error;

      const memberData = (data || []) as FarmMemberWithProfile[];
      const workersAndManagers = memberData.filter(m =>
        m.is_active && (m.role === 'worker' || m.role === 'manager')
      );

      setMembers(workersAndManagers);
    } catch (err: any) {
      console.error('Error loading members:', err);
    }
  };

  const loadShifts = async () => {
    if (!currentFarm?.id) return;

    try {
      setLoading(true);
      setError(null);

      let startDate: string | null = null;
      let endDate: string | null = null;

      if (viewMode === 'two-day') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 2);
        tomorrow.setHours(23, 59, 59, 999);

        startDate = today.toISOString();
        endDate = tomorrow.toISOString();
      } else if (viewMode === 'calendar') {
        const weekEnd = new Date(currentWeekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        weekEnd.setHours(23, 59, 59, 999);

        startDate = currentWeekStart.toISOString();
        endDate = weekEnd.toISOString();
      }

      if (startDateFilter) {
        startDate = new Date(startDateFilter).toISOString();
      }
      if (endDateFilter) {
        endDate = new Date(endDateFilter + 'T23:59:59').toISOString();
      }

      const { data, error } = await supabase.rpc('get_farm_shifts', {
        p_farm_id: currentFarm.id,
        p_status_filter: statusFilter || null,
        p_worker_filter: workerFilter || null,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) throw error;

      setShifts((data || []) as Shift[]);

      const initialStatuses: Record<string, string> = {};
      (data || []).forEach((shift: Shift) => {
        initialStatuses[shift.id] = shift.status;
      });
      setEditingStatuses(initialStatuses);
    } catch (err: any) {
      console.error('Error loading shifts:', err);
      setError(err.message || 'Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentFarm?.id || !isOwnerOrManager) return;

    if (!selectedWorkerId || !startDateTime || !endDateTime) {
      setCreateError(t('common.please_fill_all_fields') || 'Please fill in all fields');
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);

      const { data, error } = await supabase.rpc('assign_shift', {
        p_farm_id: currentFarm.id,
        p_worker_id: selectedWorkerId,
        p_start_time: new Date(startDateTime).toISOString(),
        p_end_time: new Date(endDateTime).toISOString()
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        throw new Error(result.error || t('shifts.failed_to_assign') || 'Failed to assign shift');
      }

      setCreateSuccess(result.message || t('shifts.shift_assigned_successfully') || 'Shift assigned successfully');
      setSelectedWorkerId('');
      setStartDateTime('');
      setEndDateTime('');

      await loadShifts();

      setTimeout(() => setCreateSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error creating shift:', err);
      setCreateError(err.message || t('shifts.failed_to_assign') || 'Failed to assign shift');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (shiftId: string) => {
    if (!isOwnerOrManager || updatingShiftId) return;

    const newStatus = editingStatuses[shiftId];
    if (!newStatus) return;

    try {
      setUpdatingShiftId(shiftId);

      const { data, error } = await supabase.rpc('update_shift_status', {
        p_shift_id: shiftId,
        p_new_status: newStatus
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to update status');
      }

      await loadShifts();
    } catch (err: any) {
      console.error('Error updating status:', err);
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingShiftId(null);
    }
  };

  const handleStatusChange = (shiftId: string, newStatus: string) => {
    setEditingStatuses(prev => ({
      ...prev,
      [shiftId]: newStatus
    }));
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled':
        return 'bg-gray-100 text-gray-800';
      case 'in_progress':
        return 'bg-neon-100 text-neon-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'missed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const clearFilters = () => {
    setStatusFilter('');
    setWorkerFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  const handleCreateRecurring = () => {
    setEditingTemplate(null);
    setShowRecurringModal(true);
  };

  const handleEditRecurring = (template: any) => {
    setEditingTemplate(template);
    setShowRecurringModal(true);
  };

  const handleRecurringSuccess = () => {
    setRecurringRefreshTrigger(prev => prev + 1);
    loadShifts();
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentWeekStart(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  const getWeekDays = () => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(currentWeekStart);
      day.setDate(currentWeekStart.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getTodayAndTomorrowDates = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return [today, tomorrow];
  };

  const groupShiftsByDate = (shifts: Shift[]) => {
    const grouped: Record<string, Shift[]> = {};
    shifts.forEach(shift => {
      const shiftDate = new Date(shift.start_time);
      const dateKey = shiftDate.toISOString().split('T')[0];
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(shift);
    });

    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      );
    });

    return grouped;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isTomorrow = (date: Date) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="icon-circle-yellow w-14 h-14">
            <Calendar className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('shifts.title')}</h1>
            <p className="text-gray-500 mt-1">{t('shifts.subtitle') || 'Schedule and track worker shifts'}</p>
          </div>
        </div>
      </div>

      {isOwnerOrManager && (
        <div className="section-card-yellow">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="icon-circle-yellow">
                <Repeat className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t('shifts.recurring_schedule') || 'Recurring Schedule'}</h2>
            </div>
            <button
              onClick={handleCreateRecurring}
              className="btn-primary flex items-center gap-2"
            >
              <Repeat className="w-4 h-4" />
              {t('shifts.create_recurring_shift')}
            </button>
          </div>

          <RecurringShiftsList
            farmId={currentFarm.id}
            onEdit={handleEditRecurring}
            refreshTrigger={recurringRefreshTrigger}
          />
        </div>
      )}

      {isOwnerOrManager && (
        <div className="section-card">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t('shifts.assign_single_shift') || 'Assign Single Shift'}</h2>

          <form onSubmit={handleCreateShift} className="space-y-5">
            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span>{createError}</span>
              </div>
            )}

            {createSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-2xl flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                <span>{createSuccess}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('shifts.assigned_worker')}
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="input-light"
                  required
                >
                  <option value="">{t('shifts.select_worker') || 'Select a worker'}</option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.full_name} ({member.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('shifts.start_date_time') || 'Start Date & Time'}
                </label>
                <input
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className="input-light"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('shifts.end_date_time') || 'End Date & Time'}
                </label>
                <input
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => setEndDateTime(e.target.value)}
                  className="input-light"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('shifts.assigning_shift') || 'Assigning Shift...'}
                </>
              ) : (
                <>
                  <Calendar className="w-5 h-5" />
                  {t('shifts.assign_shift') || 'Assign Shift'}
                </>
              )}
            </button>
          </form>
        </div>
      )}

      <div className="section-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="icon-circle-gray">
            <Filter className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">{t('common.filter') || 'Filters'}</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('shifts.status')}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-light"
            >
              <option value="">{t('shifts.all_statuses') || 'All Statuses'}</option>
              <option value="scheduled">{t('shifts.scheduled')}</option>
              <option value="in_progress">{t('shifts.in_progress')}</option>
              <option value="completed">{t('shifts.completed')}</option>
              <option value="missed">{t('shifts.missed') || 'Missed'}</option>
            </select>
          </div>

          {isOwnerOrManager && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('shifts.assigned_worker')}
              </label>
              <select
                value={workerFilter}
                onChange={(e) => setWorkerFilter(e.target.value)}
                className="input-light"
              >
                <option value="">{t('shifts.all_workers') || 'All Workers'}</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('payroll.start_date') || t('shifts.start_date') || 'Start Date'}
            </label>
            <input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="input-light"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('payroll.end_date') || t('shifts.end_date') || 'End Date'}
            </label>
            <input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="input-light"
            />
          </div>
        </div>

        {(statusFilter || workerFilter || startDateFilter || endDateFilter) && (
          <div className="mt-4">
            <button
              onClick={clearFilters}
              className="text-neon-600 hover:text-neon-700 font-medium text-sm"
            >
              {t('common.clear_all_filters') || 'Clear all filters'}
            </button>
          </div>
        )}
      </div>

      <div className="section-card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="icon-circle-gray">
              <Clock className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">{t('shifts.shifts_title') || t('shifts.title')}</h2>
            <span className="badge-gray">{shifts.length}</span>
          </div>
          <div className="glass-light rounded-full p-1 inline-flex gap-1">
            <button
              onClick={() => setViewMode('two-day')}
              className={`nav-pill flex items-center gap-2 ${
                viewMode === 'two-day' ? 'nav-pill-active' : 'nav-pill-inactive'
              }`}
            >
              <List className="w-4 h-4" />
              {t('shifts.today_tomorrow') || 'Today & Tomorrow'}
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`nav-pill flex items-center gap-2 ${
                viewMode === 'calendar' ? 'nav-pill-active' : 'nav-pill-inactive'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              {t('shifts.calendar_view') || 'Calendar View'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-red-600">
            <AlertCircle className="w-6 h-6 mr-2" />
            {error}
          </div>
        ) : shifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="icon-circle-yellow w-20 h-20 mb-6">
              <Calendar className="w-10 h-10" />
            </div>
            <p className="text-xl font-bold text-gray-900 mb-2">{t('shifts.no_shifts_found') || 'No shifts found'}</p>
            <p className="text-gray-500">
              {viewMode === 'two-day'
                ? t('shifts.no_shifts_today_tomorrow') || 'No shifts scheduled for today or tomorrow'
                : t('shifts.no_shifts_this_week') || 'No shifts scheduled for this week'}
            </p>
            {isOwnerOrManager && (
              <p className="text-sm text-gray-400 mt-1">{t('shifts.assign_using_form') || 'Assign shifts using the form above'}</p>
            )}
          </div>
        ) : viewMode === 'two-day' ? (
          <div className="space-y-8">
            {getTodayAndTomorrowDates().map((date, index) => {
              const dateKey = date.toISOString().split('T')[0];
              const dateShifts = groupShiftsByDate(shifts)[dateKey] || [];
              const dayLabel = index === 0 ? t('common.today') : t('common.tomorrow') || 'Tomorrow';

              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`px-4 py-2 rounded-full font-semibold ${
                      index === 0
                        ? 'bg-neon-400 text-gray-900'
                        : 'bg-gray-900 text-white'
                    }`}>
                      {dayLabel}
                    </div>
                    <div className="text-gray-600 font-medium">
                      {date.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div className="ml-auto">
                      <span className="badge-gray">{dateShifts.length} {dateShifts.length === 1 ? t('shifts.shift') || 'shift' : t('shifts.shifts') || 'shifts'}</span>
                    </div>
                  </div>

                  {dateShifts.length === 0 ? (
                    <div className="bg-gray-50 rounded-2xl p-8 text-center">
                      <Clock className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p className="text-gray-500">{t('shifts.no_shifts_for_day', { day: dayLabel }) || `No shifts scheduled for ${dayLabel.toLowerCase()}`}</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {dateShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className="bg-gray-50 rounded-2xl p-4 hover:bg-neon-50 hover:shadow-md transition-all"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1">
                              <div className="icon-circle-yellow w-12 h-12 flex-shrink-0">
                                <Users className="w-6 h-6" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-bold text-gray-900 text-lg">
                                    {shift.worker_name}
                                  </h3>
                                  <span className="badge-yellow capitalize">
                                    {shift.worker_role}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 mb-3">{shift.worker_email}</p>
                                <div className="flex items-center gap-4 text-sm">
                                  <div className="flex items-center gap-1.5 text-gray-700">
                                    <Clock className="w-4 h-4 text-gray-400" />
                                    <span className="font-medium">
                                      {new Date(shift.start_time).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                      })}
                                    </span>
                                    <span className="text-gray-400 mx-1">→</span>
                                    <span className="font-medium">
                                      {new Date(shift.end_time).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                      })}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isOwnerOrManager ? (
                                      <div className="flex items-center gap-2">
                                        <select
                                          value={editingStatuses[shift.id] || shift.status}
                                          onChange={(e) => handleStatusChange(shift.id, e.target.value)}
                                          className={`px-3 py-1.5 rounded-full text-xs font-medium border-0 capitalize ${getStatusColor(editingStatuses[shift.id] || shift.status)}`}
                                          disabled={updatingShiftId === shift.id}
                                        >
                                          <option value="scheduled">{t('shifts.scheduled')}</option>
                                          <option value="in_progress">{t('shifts.in_progress')}</option>
                                          <option value="completed">{t('shifts.completed')}</option>
                                          <option value="missed">{t('shifts.missed') || 'Missed'}</option>
                                        </select>
                                        {editingStatuses[shift.id] !== shift.status && (
                                          <button
                                            onClick={() => handleUpdateStatus(shift.id)}
                                            disabled={updatingShiftId === shift.id}
                                            className="btn-primary px-3 py-1.5 text-xs disabled:opacity-50 flex items-center gap-1"
                                          >
                                            {updatingShiftId === shift.id ? (
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                              <Save className="w-3 h-3" />
                                            )}
                                            {t('common.save')}
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium capitalize ${getStatusColor(shift.status)}`}>
                                        {shift.status.replace('_', ' ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => navigateWeek('prev')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold text-gray-900">
                  {currentWeekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  {t('common.date_range_separator')}
                  {new Date(currentWeekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </h3>
                <button
                  onClick={goToCurrentWeek}
                  className="px-3 py-1.5 bg-neon-100 text-neon-700 rounded-full text-sm font-medium hover:bg-neon-200 transition-colors"
                >
                  Current Week
                </button>
              </div>
              <button
                onClick={() => navigateWeek('next')}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-3">
              {getWeekDays().map((day) => {
                const dateKey = day.toISOString().split('T')[0];
                const dayShifts = groupShiftsByDate(shifts)[dateKey] || [];
                const isCurrentDay = isToday(day);
                const isTomorrowDay = isTomorrow(day);

                return (
                  <div
                    key={dateKey}
                    className={`rounded-2xl p-4 min-h-[200px] transition-all ${
                      isCurrentDay
                        ? 'bg-neon-100 ring-2 ring-neon-400 shadow-md'
                        : isTomorrowDay
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <div className="mb-3">
                      <div className={`text-xs font-medium uppercase mb-1 ${
                        isTomorrowDay ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className={`text-2xl font-bold ${
                        isCurrentDay
                          ? 'text-neon-700'
                          : isTomorrowDay
                          ? 'text-white'
                          : 'text-gray-900'
                      }`}>
                        {day.getDate()}
                      </div>
                      {isCurrentDay && (
                        <div className="text-xs font-semibold text-neon-700 mt-1">Today</div>
                      )}
                      {isTomorrowDay && (
                        <div className="text-xs font-medium text-gray-400 mt-1">Tomorrow</div>
                      )}
                    </div>

                    <div className="space-y-2">
                      {dayShifts.length === 0 ? (
                        <div className={`text-xs text-center py-4 ${
                          isTomorrowDay ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          No shifts
                        </div>
                      ) : (
                        dayShifts.map((shift) => (
                          <div
                            key={shift.id}
                            className={`p-2 rounded-xl text-xs ${
                              isCurrentDay
                                ? 'bg-white shadow-sm'
                                : isTomorrowDay
                                ? 'bg-gray-800'
                                : 'bg-white'
                            } hover:shadow-sm transition-shadow cursor-pointer group`}
                            title={`${shift.worker_name} - ${shift.worker_email}`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <Users className={`w-3 h-3 flex-shrink-0 ${
                                  isTomorrowDay ? 'text-gray-500' : 'text-gray-400'
                                }`} />
                                <span className={`font-medium truncate ${
                                  isTomorrowDay ? 'text-white' : 'text-gray-900'
                                }`}>
                                  {shift.worker_name.split(' ')[0]}
                                </span>
                              </div>
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize flex-shrink-0 ${getStatusColor(shift.status)}`}>
                                {shift.status.replace('_', ' ').substring(0, 4)}
                              </span>
                            </div>
                            <div className={`flex items-center gap-1 ${
                              isTomorrowDay ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              <Clock className={`w-3 h-3 ${
                                isTomorrowDay ? 'text-gray-500' : 'text-gray-400'
                              }`} />
                              <span>
                                {new Date(shift.start_time).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </span>
                            </div>
                            <div className={`text-[10px] mt-1 truncate opacity-0 group-hover:opacity-100 transition-opacity ${
                              isTomorrowDay ? 'text-gray-500' : 'text-gray-500'
                            }`}>
                              {shift.worker_email}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showRecurringModal && currentFarm?.id && (
        <CreateRecurringShiftModal
          farmId={currentFarm.id}
          onClose={() => {
            setShowRecurringModal(false);
            setEditingTemplate(null);
          }}
          onSuccess={handleRecurringSuccess}
          editingTemplate={editingTemplate}
        />
      )}
    </div>
  );
}
