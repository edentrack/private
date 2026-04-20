import { useState, useEffect } from 'react';
import { Egg, Plus, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

interface Flock {
  id: string;
  name: string;
  type: string;
}

interface QuickEggCollectionWidgetProps {
  onSuccess?: () => void;
}

export function QuickEggCollectionWidget({ onSuccess }: QuickEggCollectionWidgetProps) {
  const { t } = useTranslation();
  const { currentFarm, profile } = useAuth();
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [damagedEggs, setDamagedEggs] = useState('');
  const [traysBySize, setTraysBySize] = useState({ small: '', medium: '', large: '', jumbo: '' });
  const [looseBySize, setLooseBySize] = useState({ small: '', medium: '', large: '', jumbo: '' });
  const [selectedFlockId, setSelectedFlockId] = useState('');
  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().split('T')[0]);
  const [intervalTrackingActive, setIntervalTrackingActive] = useState(false);
  const [intervalSourceTaskSupported, setIntervalSourceTaskSupported] = useState<'unknown' | 'supported' | 'unsupported'>('unknown');
  const [intervalAutoTotals, setIntervalAutoTotals] = useState({
    small: 0,
    medium: 0,
    large: 0,
    jumbo: 0,
    damaged: 0,
    totalGood: 0,
  });

  useEffect(() => {
    loadFlocks();
    loadFarmSettings();
  }, [currentFarm?.id]);

  useEffect(() => {
    const run = async () => {
      if (!currentFarm?.id || !collectionDate) return;
      if (intervalSourceTaskSupported === 'unsupported') return;

      // If interval-based entries exist for this date, the dashboard becomes read-only.
      const { data, error } = await supabase
        .from('egg_collections')
        .select('small_eggs, medium_eggs, large_eggs, jumbo_eggs, damaged_eggs, broken, total_eggs, source_task_id')
        .eq('farm_id', currentFarm.id)
        .eq('collection_date', collectionDate)
        .not('source_task_id', 'is', null)
        .limit(200);

      if (error) {
        const msg = (error as any)?.message || '';
        const code = (error as any)?.code || '';
        if (code === '42703' || msg.toLowerCase().includes('source_task_id') || msg.toLowerCase().includes('does not exist')) {
          setIntervalSourceTaskSupported('unsupported');
        }
        // Soft-fail: revert to manual mode.
        console.warn('Failed loading interval egg collections', error);
        setIntervalTrackingActive(false);
        return;
      }

      setIntervalSourceTaskSupported('supported');

      const rows = data || [];
      if (rows.length === 0) {
        setIntervalTrackingActive(false);
        return;
      }

      const sums = rows.reduce(
        (acc, r: any) => {
          acc.small += Number(r.small_eggs ?? 0);
          acc.medium += Number(r.medium_eggs ?? 0);
          acc.large += Number(r.large_eggs ?? 0);
          acc.jumbo += Number(r.jumbo_eggs ?? 0);
          acc.damaged += Number(r.damaged_eggs ?? r.broken ?? 0);
          return acc;
        },
        { small: 0, medium: 0, large: 0, jumbo: 0, damaged: 0 }
      );

      const totalGood = sums.small + sums.medium + sums.large + sums.jumbo;
      setIntervalAutoTotals({
        small: sums.small,
        medium: sums.medium,
        large: sums.large,
        jumbo: sums.jumbo,
        damaged: sums.damaged,
        totalGood,
      });
      setIntervalTrackingActive(true);
    };

    run();
  }, [currentFarm?.id, collectionDate]);

  async function loadFarmSettings() {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', currentFarm.id)
      .single();

    if (data?.eggs_per_tray) {
      setEggsPerTray(data.eggs_per_tray);
    }
  }

  async function loadFlocks() {
    if (!currentFarm?.id) return;

    const { data } = await supabase
      .from('flocks')
      .select('id, name, type')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('name');

    if (data) {
      setFlocks(data);
    }
  }

  const layerFlocks = flocks.filter(f =>
    f.type?.toLowerCase() === 'layer' || f.type?.toLowerCase() === 'layers'
  );

  // Auto-select first flock if only one exists
  useEffect(() => {
    if (layerFlocks.length === 1 && !selectedFlockId) {
      setSelectedFlockId(layerFlocks[0].id);
    }
  }, [layerFlocks.length, selectedFlockId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const traysNums = {
        small: Number(traysBySize.small) || 0,
        medium: Number(traysBySize.medium) || 0,
        large: Number(traysBySize.large) || 0,
        jumbo: Number(traysBySize.jumbo) || 0,
      };
      const looseNums = {
        small: Number(looseBySize.small) || 0,
        medium: Number(looseBySize.medium) || 0,
        large: Number(looseBySize.large) || 0,
        jumbo: Number(looseBySize.jumbo) || 0,
      };
      const damagedEggsNum = Number(damagedEggs) || 0;
      const totalLoose =
        looseNums.small + looseNums.medium + looseNums.large + looseNums.jumbo;
      const totalTraysCount =
        traysNums.small + traysNums.medium + traysNums.large + traysNums.jumbo;

      const nextTotals = {
        small: Math.round(traysNums.small * eggsPerTray + looseNums.small),
        medium: Math.round(traysNums.medium * eggsPerTray + looseNums.medium),
        large: Math.round(traysNums.large * eggsPerTray + looseNums.large),
        jumbo: Math.round(traysNums.jumbo * eggsPerTray + looseNums.jumbo),
      };

      const totalEggs = nextTotals.small + nextTotals.medium + nextTotals.large + nextTotals.jumbo;

      if (totalEggs === 0 && damagedEggsNum === 0) {
        setErrorMessage('Please enter at least some eggs collected');
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }

      const badLoose = (Object.values(looseNums) as number[]).some((v) => v >= eggsPerTray);
      if (badLoose) {
        setErrorMessage(`Loose eggs for each size must be less than ${eggsPerTray}.`);
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }

      const totalTrays = Math.round(totalTraysCount) + (totalLoose > 0 ? 1 : 0); // keep legacy meaning: "full trays plus 1 if any loose"

      const confirmed = window.confirm(
        `Confirm egg collection:\n\n` +
          `Small: ${nextTotals.small}\n` +
          `Medium: ${nextTotals.medium}\n` +
          `Large: ${nextTotals.large}\n` +
          `Jumbo: ${nextTotals.jumbo}\n\n` +
          `Total good eggs: ${totalEggs}\n` +
          `Damaged eggs: ${damagedEggsNum}\n\n` +
          `Save this record?`
      );
      if (!confirmed) {
        setLoading(false);
        return;
      }

      const { error: collectionError } = await supabase
        .from('egg_collections')
        .insert({
          farm_id: currentFarm?.id,
          flock_id: selectedFlockId || null,
          collection_date: collectionDate,
          collected_on: collectionDate,
          trays: totalTrays,
          broken: damagedEggsNum,
          small_eggs: nextTotals.small,
          medium_eggs: nextTotals.medium,
          large_eggs: nextTotals.large,
          jumbo_eggs: nextTotals.jumbo,
          damaged_eggs: damagedEggsNum,
          total_eggs: totalEggs,
          collected_by: profile?.id,
          notes: null,
        });

      if (collectionError) throw collectionError;

      const { data: inventory } = await supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', currentFarm?.id)
        .maybeSingle();

      if (inventory) {
        await supabase
          .from('egg_inventory')
          .update({
            small_eggs: (inventory.small_eggs ?? 0) + nextTotals.small,
            medium_eggs: (inventory.medium_eggs ?? 0) + nextTotals.medium,
            large_eggs: (inventory.large_eggs ?? 0) + nextTotals.large,
            jumbo_eggs: (inventory.jumbo_eggs ?? 0) + nextTotals.jumbo,
            last_updated: new Date().toISOString(),
          })
          .eq('farm_id', currentFarm?.id);
      } else {
        await supabase
          .from('egg_inventory')
          .insert({
            farm_id: currentFarm?.id,
            small_eggs: nextTotals.small,
            medium_eggs: nextTotals.medium,
            large_eggs: nextTotals.large,
            jumbo_eggs: nextTotals.jumbo,
          });
      }

      setSuccessMessage(`Recorded ${totalEggs} eggs collected!`);
      onSuccess?.();
      setTimeout(() => {
        setSuccessMessage(null);
        setShowForm(false);
        setTraysBySize({ small: '', medium: '', large: '', jumbo: '' });
        setLooseBySize({ small: '', medium: '', large: '', jumbo: '' });
        setDamagedEggs('');
      }, 2000);

    } catch (error) {
      console.error('Error recording egg collection:', error);
      setErrorMessage('Failed to record collection. Please try again.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  const liveTotals = {
    small: (Number(traysBySize.small) || 0) * eggsPerTray + (Number(looseBySize.small) || 0),
    medium: (Number(traysBySize.medium) || 0) * eggsPerTray + (Number(looseBySize.medium) || 0),
    large: (Number(traysBySize.large) || 0) * eggsPerTray + (Number(looseBySize.large) || 0),
    jumbo: (Number(traysBySize.jumbo) || 0) * eggsPerTray + (Number(looseBySize.jumbo) || 0),
  };
  const totalEggs = liveTotals.small + liveTotals.medium + liveTotals.large + liveTotals.jumbo;

  if (layerFlocks.length === 0) {
    return null;
  }

  if (intervalTrackingActive && !showForm) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl shadow-soft p-3 border border-amber-200">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
              <Egg className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Egg production</h3>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-gray-900">{Math.round(intervalAutoTotals.totalGood).toLocaleString()}</div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg text-[11px] font-semibold hover:from-amber-700 hover:to-orange-700 transition-all"
            >
              Enter data
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl shadow-soft p-6 border-2 border-amber-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center">
              <Egg className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('dashboard.egg_collection')}</h3>
              <p className="text-sm text-amber-700">{t('dashboard.record_daily_collection')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-semibold hover:from-amber-700 hover:to-orange-700 transition-all shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Record
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-soft p-4">
      {successMessage && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
          <p className="text-xs font-medium text-green-900">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs font-medium text-red-900">{errorMessage}</p>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900">Egg production</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Auto-select first flock if only one exists, otherwise show dropdown */}
        {layerFlocks.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1">
              Flock
            </label>
            <select
              value={selectedFlockId}
              onChange={(e) => setSelectedFlockId(e.target.value)}
              className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm"
            >
              <option value="">Select a flock</option>
              {layerFlocks.map(flock => (
                <option key={flock.id} value={flock.id}>
                  {flock.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-900 mb-1">
            Collection Date
          </label>
          <input
            type="date"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm"
          />
          {collectionDate < new Date().toISOString().split('T')[0] && (
            <p className="text-[10px] text-gray-500 mt-0.5">Backdating to record historical data</p>
          )}
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 bg-gray-50 text-[11px] font-semibold text-gray-700">
            <div className="px-3 py-2">Size</div>
            <div className="px-3 py-2 text-center">Trays</div>
            <div className="px-3 py-2 text-center">Loose</div>
          </div>
          {([
            { key: 'small', label: 'Small' },
            { key: 'medium', label: 'Medium' },
            { key: 'large', label: 'Large' },
            { key: 'jumbo', label: 'Jumbo' },
          ] as const).map((row) => (
            <div key={row.key} className="grid grid-cols-3 items-center border-t border-gray-200">
              <div className="px-3 py-2 text-sm font-semibold text-gray-900">{row.label}</div>
              <div className="px-3 py-2">
                <input
                  type="number"
                  min="0"
                  value={traysBySize[row.key]}
                  onChange={(e) => setTraysBySize({ ...traysBySize, [row.key]: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-center"
                />
              </div>
              <div className="px-3 py-2">
                <input
                  type="number"
                  min="0"
                  max={eggsPerTray - 1}
                  value={looseBySize[row.key]}
                  onChange={(e) => setLooseBySize({ ...looseBySize, [row.key]: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm text-center"
                />
              </div>
            </div>
          ))}
          <div className="px-3 py-2 bg-gray-50 text-[11px] text-gray-600">
            Loose eggs must be less than {eggsPerTray} per size.
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-900 mb-1">
            Damaged eggs
          </label>
          <input
            type="number"
            min="0"
            value={damagedEggs}
            onChange={(e) => setDamagedEggs(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2 bg-white text-gray-900 border border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-sm"
          />
        </div>

        <div className="border border-gray-200 rounded-xl px-3 py-2 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">Total good eggs</span>
            <span className="text-sm font-bold text-gray-900">{totalEggs}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              setShowForm(false);
              setTraysBySize({ small: '', medium: '', large: '', jumbo: '' });
              setLooseBySize({ small: '', medium: '', large: '', jumbo: '' });
              setDamagedEggs('');
              setCollectionDate(new Date().toISOString().split('T')[0]);
            }}
            className="flex-1 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (layerFlocks.length > 1 && !selectedFlockId)}
            className="flex-1 px-3 py-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-lg text-sm font-semibold hover:from-amber-700 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-sm hover:shadow-md"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
