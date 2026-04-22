import { useState, useEffect } from 'react';
import { Bell, Clock, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

const TIMEZONES = [
  { value: 'Africa/Douala', label: 'Cameroon (Douala)' },
  { value: 'Africa/Lagos', label: 'Nigeria (Lagos)' },
  { value: 'Africa/Johannesburg', label: 'South Africa (Johannesburg)' },
  { value: 'Africa/Cairo', label: 'Egypt (Cairo)' },
  { value: 'Africa/Nairobi', label: 'Kenya (Nairobi)' },
  { value: 'Africa/Accra', label: 'Ghana (Accra)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'Europe (London)' },
  { value: 'America/New_York', label: 'USA (New York)' },
  { value: 'Asia/Kolkata', label: 'India (New Delhi)' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function DailyReportSettings() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [reportScheduleEnabled, setReportScheduleEnabled] = useState(false);
  const [reportTimezone, setReportTimezone] = useState('Africa/Douala');
  const [reportDayOfWeek, setReportDayOfWeek] = useState(1); // Monday default
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  useEffect(() => {
    if (currentFarm?.id) {
      loadSettings();
    }
  }, [currentFarm?.id]);

  const loadSettings = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data, error } = await supabase
        .from('farms')
        .select('report_schedule_enabled, report_timezone, report_day_of_week')
        .eq('id', currentFarm.id)
        .single();

      if (error) throw error;

      if (data) {
        setReportScheduleEnabled(data.report_schedule_enabled || false);
        setReportTimezone(data.report_timezone || 'Africa/Douala');
        setReportDayOfWeek(data.report_day_of_week ?? 1);
      }
    } catch (error) {
      console.error('Error loading report settings:', error);
      setMessageType('error');
      setMessage('Failed to load report settings');
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('farms')
        .update({
          report_schedule_enabled: reportScheduleEnabled,
          report_timezone: reportTimezone,
          report_day_of_week: reportDayOfWeek,
        })
        .eq('id', currentFarm.id);

      if (error) throw error;

      const dayName = DAYS_OF_WEEK.find((d) => d.value === reportDayOfWeek)?.label ?? 'Monday';
      setMessageType('success');
      setMessage(
        reportScheduleEnabled
          ? `Weekly reports will be sent every ${dayName} at 6 PM ${reportTimezone} timezone`
          : 'Weekly report scheduling disabled'
      );

      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error saving report settings:', error);
      setMessageType('error');
      setMessage('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border border-gray-200">
      <div className="flex items-start gap-3">
        <Bell className="w-5 h-5 mt-1 text-blue-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">
            Auto-send Weekly Report by Email
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Automatically send your weekly farm summary via email once a week at 6 PM in your farm&apos;s local timezone.
          </p>
        </div>
      </div>

      <div className="space-y-4 mt-4 ml-8">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="report_schedule_enabled"
            checked={reportScheduleEnabled}
            onChange={(e) => setReportScheduleEnabled(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            disabled={saving}
          />
          <label htmlFor="report_schedule_enabled" className="text-sm font-medium text-gray-700">
            Enable automatic weekly reports
          </label>
        </div>

        {/* Day and timezone selection */}
        {reportScheduleEnabled && (
          <div className="space-y-3">
            {/* Day of week */}
            <div className="space-y-1">
              <label htmlFor="report_day" className="block text-sm font-medium text-gray-700">
                <Clock className="w-4 h-4 inline mr-2" />
                Send report on
              </label>
              <select
                id="report_day"
                value={reportDayOfWeek}
                onChange={(e) => setReportDayOfWeek(Number(e.target.value))}
                disabled={saving}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div className="space-y-1">
              <label htmlFor="report_timezone" className="block text-sm font-medium text-gray-700">
                Timezone
              </label>
              <select
                id="report_timezone"
                value={reportTimezone}
                onChange={(e) => setReportTimezone(e.target.value)}
                disabled={saving}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                Report will be sent at 6 PM (18:00) in the selected timezone
              </p>
            </div>
          </div>
        )}

        {/* Info Box */}
        {reportScheduleEnabled && (
          <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-1">How it works:</p>
              <ul className="space-y-1 ml-2">
                <li>• Your weekly farm report covers the past 7 days of activity</li>
                <li>• Sent to your registered email address</li>
                <li>• Scheduled for 6 PM on your chosen day in your farm&apos;s timezone</li>
                <li>• Same report content as the manual &quot;Share Weekly Report&quot; button</li>
              </ul>
            </div>
          </div>
        )}

        {/* Message Display */}
        {message && (
          <div
            className={`text-sm p-3 rounded-lg border ${
              messageType === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : messageType === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
            }`}
          >
            {message}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
