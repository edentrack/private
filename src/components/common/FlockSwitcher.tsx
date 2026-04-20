import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { Flock } from '../../types/database';
import { useAuth } from '../../contexts/AuthContext';

interface FlockSwitcherProps {
  selectedFlockId: string | null;
  onFlockChange: (flockId: string | null) => void;
  showAllOption?: boolean;
  label?: string;
}

export function FlockSwitcher({
  selectedFlockId,
  onFlockChange,
  showAllOption = true,
  label = 'Filter by Flock'
}: FlockSwitcherProps) {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (currentFarm?.id) {
      loadFlocks();
    }
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      setFlocks(data || []);
    } catch (error) {
      console.error('Error loading flocks:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedFlock = flocks.find(f => f.id === selectedFlockId);

  if (loading) {
    return (
      <div className="px-4 py-3 bg-white/50 rounded-full text-sm text-gray-500">
        {t('insights.loading')}
      </div>
    );
  }

  return (
    <div className="relative">
      {label && (
        <label className="block text-sm font-medium text-gray-500 mb-2">
          {label}
        </label>
      )}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2.5 bg-white border border-gray-200 rounded-full flex items-center gap-3 hover:border-gray-300 hover:shadow-sm transition-all duration-200 group relative z-10"
      >
        <img 
          src="/layer.jpg" 
          alt="Chicken" 
          className="w-4 h-4 object-contain mix-blend-multiply" 
          style={{ backgroundColor: 'transparent' }}
        />
        <span className="text-gray-900 font-medium">
          {selectedFlock ? selectedFlock.name : t('insights.all_flocks')}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-[9999] pointer-events-auto">
            {showAllOption && (
              <button
                onClick={() => {
                  onFlockChange(null);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left transition-colors ${
                  !selectedFlockId
                    ? 'text-gray-900 bg-neon-500/10 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t('insights.all_flocks')}
              </button>
            )}
            {flocks.map(flock => (
              <button
                key={flock.id}
                onClick={() => {
                  onFlockChange(flock.id);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left transition-colors border-t border-gray-50 ${
                  selectedFlockId === flock.id
                    ? 'text-gray-900 bg-neon-500/10 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{flock.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {flock.type} - {flock.current_count} {t('dashboard.birds')}
                </div>
              </button>
            ))}
            {flocks.length === 0 && (
              <div className="px-4 py-4 text-sm text-gray-500 text-center">
                {t('insights.no_active_flocks')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
