import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, Bird, ArrowUpRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';

interface FlockAgeCardProps {
  flockId: string | null;
  onLogMortality?: (flock: Flock) => void;
  onNavigate?: (page: string) => void;
}

export function FlockAgeCard({ flockId, onLogMortality, onNavigate }: FlockAgeCardProps) {
  const { currentFarm } = useAuth();
  const [flock, setFlock] = useState<Flock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentFarm && flockId) {
      loadFlock();
    } else {
      setFlock(null);
      setLoading(false);
    }
  }, [currentFarm, flockId]);

  const loadFlock = async () => {
    if (!currentFarm?.id || !flockId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('flocks')
        .select('*')
        .eq('id', flockId)
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .single();

      if (error) throw error;
      setFlock(data);
    } catch (error) {
      console.error('Error loading flock:', error);
      setFlock(null);
    } finally {
      setLoading(false);
    }
  };

  const getFlockAge = (arrivalDate: string) => {
    const arrival = new Date(arrivalDate);
    const now = new Date();
    const diffTime = now.getTime() - arrival.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7) + 1;
    const days = diffDays % 7;
    return { weeks, days };
  };

  if (loading) {
    return (
      <div className="section-card-yellow">
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-3 border-neon-300 border-t-neon-600 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!flockId || !flock) {
    return (
      <div className="section-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="icon-circle-gray">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="stat-label">Flock Age</span>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('flocks')}
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowUpRight className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="text-center py-6">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Bird className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-gray-600 font-medium mb-1">Select a flock</p>
          <p className="text-sm text-gray-400">
            Use the flock switcher above
          </p>
        </div>
      </div>
    );
  }

  const age = getFlockAge(flock.arrival_date);

  return (
    <div className="section-card-yellow relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-neon-500/20 rounded-full blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Active Flock</h3>
          <div className="flex items-center gap-2">
            {onLogMortality && (
              <button
                onClick={() => onLogMortality(flock)}
                className="text-red-600 text-sm font-medium hover:text-red-700 inline-flex items-center gap-1 px-3 py-1.5 bg-white/50 rounded-full hover:bg-white/70 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" />
                Log Mortality
              </button>
            )}
            {onNavigate && (
              <button
                onClick={() => onNavigate('flocks')}
                className="p-2 hover:bg-white/50 rounded-full transition-colors"
              >
                <ArrowUpRight className="w-5 h-5 text-gray-700" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-end gap-2 mb-1">
          <span className="text-5xl font-bold text-gray-900">{age.weeks}</span>
          <span className="text-xl text-gray-600 mb-1">weeks</span>
          {age.days > 0 && <span className="text-lg text-gray-400 mb-1">{age.days}d</span>}
        </div>

        <p className="text-gray-600 mb-4">{flock.name}</p>

        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Bird className="w-4 h-4" />
          <span>{flock.current_count.toLocaleString()} birds</span>
          <span className="text-gray-400">|</span>
          <span className="capitalize">{flock.type}</span>
        </div>
      </div>
    </div>
  );
}
