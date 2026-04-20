import { useState, useEffect } from 'react';
import { Egg, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface Flock {
  id: string;
  name: string;
  purpose: string;
}

interface RecordEggCollectionProps {
  farmId: string;
  flocks: Flock[];
  onSuccess?: () => void;
}

export function RecordEggCollection({ farmId, flocks, onSuccess }: RecordEggCollectionProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [inputMode, setInputMode] = useState<'eggs' | 'trays'>('eggs');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    flock_id: '',
    collection_date: new Date().toISOString().split('T')[0],
    small_eggs: 0,
    medium_eggs: 0,
    large_eggs: 0,
    jumbo_eggs: 0,
    damaged_eggs: 0,
    trays: 0,
    notes: '',
  });

  useEffect(() => {
    loadFarmSettings();
  }, [farmId]);

  async function loadFarmSettings() {
    const { data } = await supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', farmId)
      .single();

    if (data?.eggs_per_tray) {
      setEggsPerTray(data.eggs_per_tray);
    }
  }

  const layerFlocks = flocks.filter(f =>
    f.purpose?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layers'
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const totalEggs =
        Number(formData.small_eggs) +
        Number(formData.medium_eggs) +
        Number(formData.large_eggs) +
        Number(formData.jumbo_eggs);

      if (totalEggs === 0) {
        setErrorMessage('Please enter at least some eggs collected');
        setTimeout(() => setErrorMessage(null), 3000);
        setLoading(false);
        return;
      }

      const trays = Math.ceil(totalEggs / eggsPerTray);

      const { error: collectionError } = await supabase
        .from('egg_collections')
        .insert({
          farm_id: farmId,
          flock_id: formData.flock_id || null,
          collection_date: formData.collection_date,
          collected_on: formData.collection_date,
          trays: trays,
          broken: formData.damaged_eggs,
          small_eggs: formData.small_eggs,
          medium_eggs: formData.medium_eggs,
          large_eggs: formData.large_eggs,
          jumbo_eggs: formData.jumbo_eggs,
          damaged_eggs: formData.damaged_eggs,
          total_eggs: totalEggs,
          collected_by: profile?.id,
          notes: formData.notes || null,
        });

      if (collectionError) throw collectionError;

      const { data: inventory } = await supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', farmId)
        .maybeSingle();

      if (inventory) {
        await supabase
          .from('egg_inventory')
          .update({
            small_eggs: inventory.small_eggs + Number(formData.small_eggs),
            medium_eggs: inventory.medium_eggs + Number(formData.medium_eggs),
            large_eggs: inventory.large_eggs + Number(formData.large_eggs),
            jumbo_eggs: inventory.jumbo_eggs + Number(formData.jumbo_eggs),
            last_updated: new Date().toISOString(),
          })
          .eq('farm_id', farmId);
      } else {
        await supabase
          .from('egg_inventory')
          .insert({
            farm_id: farmId,
            small_eggs: formData.small_eggs,
            medium_eggs: formData.medium_eggs,
            large_eggs: formData.large_eggs,
            jumbo_eggs: formData.jumbo_eggs,
          });
      }

      setSuccessMessage(`Recorded ${totalEggs} eggs collected!`);
      setTimeout(() => setSuccessMessage(null), 4000);

      setFormData({
        flock_id: '',
        collection_date: new Date().toISOString().split('T')[0],
        small_eggs: 0,
        medium_eggs: 0,
        large_eggs: 0,
        jumbo_eggs: 0,
        damaged_eggs: 0,
        trays: 0,
        notes: '',
      });

      onSuccess?.();

    } catch (error) {
      console.error('Error recording egg collection:', error);
      setErrorMessage('Failed to record collection. Please try again.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setLoading(false);
    }
  }

  const totalEggs =
    Number(formData.small_eggs) +
    Number(formData.medium_eggs) +
    Number(formData.large_eggs) +
    Number(formData.jumbo_eggs);

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-soft p-6">
      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border-2 border-green-200 rounded-xl flex items-start gap-3 animate-fade-in">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-green-900">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3 animate-fade-in">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{errorMessage}</p>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
          <Egg className="w-5 h-5 text-white" />
        </div>
        <h3 className="text-xl font-bold text-gray-900">Record Egg Collection</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Layer Flock <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <select
            value={formData.flock_id}
            onChange={(e) => setFormData({ ...formData, flock_id: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
          >
            <option value="">All flocks combined</option>
            {layerFlocks.map(flock => (
              <option key={flock.id} value={flock.id}>
                {flock.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Leave empty if eggs stored together from multiple pens
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Collection Date
          </label>
          <input
            type="date"
            value={formData.collection_date}
            onChange={(e) => setFormData({ ...formData, collection_date: e.target.value })}
            className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            required
          />
        </div>

        <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setInputMode('eggs')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'eggs'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Eggs
          </button>
          <button
            type="button"
            onClick={() => setInputMode('trays')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              inputMode === 'trays'
                ? 'bg-white text-amber-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            By Trays
          </button>
        </div>

        {inputMode === 'trays' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Number of Trays ({eggsPerTray} eggs per tray)
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={formData.trays}
                onChange={(e) => {
                  const trays = Number(e.target.value);
                  const totalEggsFromTrays = Math.round(trays * eggsPerTray);
                  setFormData({
                    ...formData,
                    trays,
                    small_eggs: 0,
                    medium_eggs: 0,
                    large_eggs: totalEggsFromTrays,
                    jumbo_eggs: 0
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
              />
              <p className="text-xs text-gray-600 mt-1">
                Total eggs: {Math.round(formData.trays * eggsPerTray)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Egg Size (optional)
              </label>
              <select
                onChange={(e) => {
                  const totalEggsFromTrays = Math.round(formData.trays * eggsPerTray);
                  const size = e.target.value;
                  setFormData({
                    ...formData,
                    small_eggs: size === 'small' ? totalEggsFromTrays : 0,
                    medium_eggs: size === 'medium' ? totalEggsFromTrays : 0,
                    large_eggs: size === 'large' ? totalEggsFromTrays : 0,
                    jumbo_eggs: size === 'jumbo' ? totalEggsFromTrays : 0
                  });
                }}
                className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
              >
                <option value="large">Large (default)</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="jumbo">Jumbo</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Select the predominant egg size in these trays
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Small Eggs
            </label>
            <input
              type="number"
              min="0"
              value={formData.small_eggs}
              onChange={(e) => setFormData({ ...formData, small_eggs: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Medium Eggs
            </label>
            <input
              type="number"
              min="0"
              value={formData.medium_eggs}
              onChange={(e) => setFormData({ ...formData, medium_eggs: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Large Eggs
            </label>
            <input
              type="number"
              min="0"
              value={formData.large_eggs}
              onChange={(e) => setFormData({ ...formData, large_eggs: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Jumbo Eggs
            </label>
            <input
              type="number"
              min="0"
              value={formData.jumbo_eggs}
              onChange={(e) => setFormData({ ...formData, jumbo_eggs: Number(e.target.value) })}
              className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
            />
          </div>
        </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Damaged/Broken Eggs
          </label>
          <input
            type="number"
            min="0"
            value={formData.damaged_eggs}
            onChange={(e) => setFormData({ ...formData, damaged_eggs: Number(e.target.value) })}
            className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all text-sm"
          />
        </div>

        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
          <p className="font-semibold text-green-900">
            Total Good Eggs: {totalEggs}
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Notes <span className="text-gray-500 font-normal">(Optional)</span>
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="w-full px-2.5 py-1.5 bg-white text-gray-900 border-2 border-gray-200 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100 transition-all resize-none text-sm"
            placeholder="Any observations..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-3 bg-gradient-to-r from-amber-600 to-orange-600 text-white rounded-xl font-semibold hover:from-amber-700 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-sm hover:shadow-md"
        >
          {loading ? 'Recording...' : 'Record Collection'}
        </button>
      </div>
    </form>
  );
}
