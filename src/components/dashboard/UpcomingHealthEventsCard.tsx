import { useEffect, useState } from 'react';
import { Syringe, Calendar, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Vaccination } from '../../types/database';

interface UpcomingHealthEventsCardProps {
  flockId: string | null;
  onNavigate?: (page: string) => void;
}

interface HealthEvent extends Vaccination {
  flock_name?: string;
}

export function UpcomingHealthEventsCard({ flockId, onNavigate }: UpcomingHealthEventsCardProps) {
  const { currentFarm } = useAuth();
  const [mode, setMode] = useState<'selected_flock' | 'all_flocks'>('selected_flock');
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentFarm) {
      loadHealthEvents();
    }
  }, [currentFarm, mode, flockId]);

  const loadHealthEvents = async () => {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      let query = supabase
        .from('vaccinations')
        .select(`
          *,
          flocks!inner(name, farm_id)
        `)
        .eq('completed', false)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(5);

      if (mode === 'selected_flock' && flockId) {
        query = query.eq('flock_id', flockId);
      } else {
        query = query.eq('flocks.farm_id', currentFarm.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const eventsWithFlockName = (data || []).map((event: any) => ({
        ...event,
        flock_name: event.flocks?.name || 'Unknown Flock'
      }));

      setEvents(eventsWithFlockName);
    } catch (error) {
      console.error('Error loading health events:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (scheduledDate: string): number => {
    const scheduled = new Date(scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    scheduled.setHours(0, 0, 0, 0);
    const diffTime = scheduled.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const formatCountdown = (scheduledDate: string): string => {
    const days = getDaysUntil(scheduledDate);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `in ${days} days`;
  };

  const getUrgencyColor = (scheduledDate: string) => {
    const days = getDaysUntil(scheduledDate);
    if (days === 0) return 'red';
    if (days <= 3) return 'orange';
    if (days <= 7) return 'yellow';
    return 'blue';
  };

  const colorClasses = {
    red: 'bg-red-50 text-red-600 border-red-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200',
    blue: 'bg-blue-50 text-blue-600 border-blue-200'
  };

  const iconColorClasses = {
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    blue: 'bg-blue-50 text-blue-600'
  };

  return (
    <div className="bg-white rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 rounded-xl">
            <Syringe className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">Upcoming Health Events</h3>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => setMode('selected_flock')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'selected_flock'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Selected Flock
        </button>
        <button
          onClick={() => setMode('all_flocks')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'all_flocks'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All Flocks
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <Syringe className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No upcoming health events scheduled</p>
          <p className="text-sm text-gray-400 mb-4">
            {mode === 'selected_flock' && !flockId
              ? 'Select a flock to view upcoming vaccinations'
              : 'Schedule vaccinations to keep your farm healthy'}
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate('vaccinations')}
              className="text-sm text-[#3D5F42] font-medium hover:text-[#2F4A34]"
            >
              Go to Vaccinations →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const urgencyColor = getUrgencyColor(event.scheduled_date);
            return (
              <div
                key={event.id}
                className={`border-2 rounded-2xl p-4 ${colorClasses[urgencyColor]}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-900 text-sm">{event.name}</h4>
                    <p className="text-xs text-gray-600 mt-0.5">{event.flock_name}</p>
                  </div>
                  <div className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold ${iconColorClasses[urgencyColor]}`}>
                    <Clock className="w-3 h-3" />
                    {formatCountdown(event.scheduled_date)}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Calendar className="w-3 h-3" />
                  <span>
                    {new Date(event.scheduled_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                {event.dosage && (
                  <div className="mt-2 text-xs text-gray-700">
                    <span className="font-medium">Dosage:</span> {event.dosage}
                  </div>
                )}
              </div>
            );
          })}
          {onNavigate && (
            <button
              onClick={() => onNavigate('vaccinations')}
              className="w-full mt-2 text-sm text-[#3D5F42] font-medium hover:text-[#2F4A34] text-center"
            >
              View all health events →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
