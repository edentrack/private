import { useState, useEffect } from 'react';
import { X, Loader2, Calendar, Clock, Repeat, Users } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Worker {
  id: string;
  full_name: string;
  email: string;
}

interface CreateRecurringShiftModalProps {
  farmId: string;
  onClose: () => void;
  onSuccess: () => void;
  editingTemplate?: RecurringTemplate | null;
}

interface RecurringTemplate {
  id: string;
  worker_id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  days_of_week: number[];
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
];

export function CreateRecurringShiftModal({
  farmId,
  onClose,
  onSuccess,
  editingTemplate = null
}: CreateRecurringShiftModalProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);

  const [workerId, setWorkerId] = useState(editingTemplate?.worker_id || '');
  const [title, setTitle] = useState(editingTemplate?.title || '');
  const [startTime, setStartTime] = useState(editingTemplate?.start_time || '08:00');
  const [endTime, setEndTime] = useState(editingTemplate?.end_time || '17:00');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    editingTemplate?.frequency || 'weekly'
  );
  const [interval, setInterval] = useState(editingTemplate?.interval || 1);
  const [selectedDays, setSelectedDays] = useState<number[]>(
    editingTemplate?.days_of_week || [1, 2, 3, 4, 5]
  );
  const [dayOfMonth, setDayOfMonth] = useState(editingTemplate?.day_of_month || 1);
  const [startDate, setStartDate] = useState(
    editingTemplate?.start_date || new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(editingTemplate?.end_date || '');
  const [isActive, setIsActive] = useState(editingTemplate?.is_active ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWorkers();
  }, [farmId]);

  const loadWorkers = async () => {
    try {
      setLoadingWorkers(true);

      const { data: membersData, error: membersError } = await supabase.rpc(
        'get_farm_members_with_emails',
        { p_farm_id: farmId }
      );

      if (membersError) throw membersError;

      const workersList = (membersData || []).map((member: any) => ({
        id: member.user_id,
        full_name: member.full_name,
        email: member.email
      }));

      setWorkers(workersList);

      if (!editingTemplate && workersList.length > 0 && !workerId) {
        setWorkerId(workersList[0].id);
      }
    } catch (err: any) {
      console.error('Error loading workers:', err);
      setError('Failed to load workers');
    } finally {
      setLoadingWorkers(false);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day].sort();
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!workerId) {
      setError('Please select a worker');
      return;
    }

    if (frequency === 'weekly' && selectedDays.length === 0) {
      setError('Please select at least one day for weekly schedule');
      return;
    }

    try {
      setSaving(true);

      const templateData = {
        farm_id: farmId,
        worker_id: workerId,
        title: title.trim() || null,
        start_time: startTime,
        end_time: endTime,
        frequency,
        interval,
        days_of_week: frequency === 'weekly' ? selectedDays : [],
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        start_date: startDate,
        end_date: endDate || null,
        is_active: isActive,
        created_by: (await supabase.auth.getUser()).data.user?.id
      };

      if (editingTemplate) {
        const { error: updateError } = await supabase
          .from('shift_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (updateError) throw updateError;
      } else {
        const { data: newTemplate, error: insertError } = await supabase
          .from('shift_templates')
          .insert(templateData)
          .select()
          .single();

        if (insertError) throw insertError;

        const today = new Date();
        const until = new Date(today);
        until.setDate(until.getDate() + 60);
        const untilStr = until.toISOString().split('T')[0];

        await supabase.rpc('generate_shifts_for_template', {
          p_template_id: newTemplate.id,
          p_until: untilStr
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving recurring shift:', err);
      setError(err.message || 'Failed to save recurring shift');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-fade-in-up">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-3">
            <div className="icon-circle-yellow">
              <Repeat className="w-5 h-5" />
            </div>
            {editingTemplate ? 'Edit Recurring Shift' : 'Create Recurring Shift'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              Worker
            </label>
            {loadingWorkers ? (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
                Loading workers...
              </div>
            ) : (
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="input-light"
                required
              >
                <option value="">Select worker</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>
                    {worker.full_name} ({worker.email})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title (Optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning shift, Afternoon shift, etc."
              className="input-light"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="input-light"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="input-light"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Repeat className="w-4 h-4 inline mr-1" />
              Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className="input-light"
              required
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Repeat Every
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value) || 1)}
                className="input-light w-24"
                required
              />
              <span className="text-gray-600">
                {frequency === 'daily' && `day${interval > 1 ? 's' : ''}`}
                {frequency === 'weekly' && `week${interval > 1 ? 's' : ''}`}
                {frequency === 'monthly' && `month${interval > 1 ? 's' : ''}`}
              </span>
            </div>
          </div>

          {frequency === 'weekly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repeat On
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-4 py-2 rounded-full font-medium transition-colors ${
                      selectedDays.includes(day.value)
                        ? 'bg-neon-400 text-gray-900'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {frequency === 'monthly' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Day of Month
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                className="input-light w-32"
                required
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-light"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="input-light"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-neon-600 border-gray-300 rounded focus:ring-neon-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active (generate shifts automatically)
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || loadingWorkers}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
