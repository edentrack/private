import { useState, useEffect } from 'react';
import { X, Egg, AlertTriangle, Trash2, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface Flock {
  id: string;
  name: string;
  type?: string;
  purpose?: string;
}

export interface EggCollectionRecord {
  id: string;
  farm_id: string;
  flock_id: string | null;
  collection_date?: string;
  collected_on?: string;
  interval_start_at?: string | null;
  source_interval_key?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  trays?: number;
  broken?: number;
  small_eggs?: number;
  medium_eggs?: number;
  large_eggs?: number;
  jumbo_eggs?: number;
  damaged_eggs?: number;
  total_eggs?: number;
  notes: string | null;
}

interface EditEggCollectionModalProps {
  record: EggCollectionRecord;
  flocks: Flock[];
  onClose: () => void;
  onSuccess: () => void;
  onBack?: () => void;
}

export function EditEggCollectionModal({ record, flocks, onClose, onSuccess, onBack }: EditEggCollectionModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [eggsPerTray, setEggsPerTray] = useState(30);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    flock_id: record.flock_id || '',
    collection_date: (record.collection_date || record.collected_on || '').toString().slice(0, 10),
    small_eggs: Number(record.small_eggs ?? 0),
    medium_eggs: Number(record.medium_eggs ?? 0),
    large_eggs: Number(record.large_eggs ?? 0),
    jumbo_eggs: Number(record.jumbo_eggs ?? 0),
    damaged_eggs: Number(record.damaged_eggs ?? record.broken ?? 0),
    notes: record.notes || '',
  });

  const [inputMode, setInputMode] = useState<'eggs' | 'trays'>('eggs');
  const [traysBySize, setTraysBySize] = useState({ small: 0, medium: 0, large: 0, jumbo: 0 });
  const [looseBySize, setLooseBySize] = useState({ small: 0, medium: 0, large: 0, jumbo: 0 });

  const layerFlocks = flocks.filter(
    (f) => (f.type?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layer' || f.purpose?.toLowerCase() === 'layers')
  );

  useEffect(() => {
    if (record.farm_id) {
      supabase
        .from('farms')
        .select('eggs_per_tray')
        .eq('id', record.farm_id)
        .single()
        .then(({ data }) => {
          if (data?.eggs_per_tray) setEggsPerTray(data.eggs_per_tray);
        });
    }
  }, [record.farm_id]);

  useEffect(() => {
    // Keep trays/loose in sync from egg totals (for tray editing mode)
    if (inputMode !== 'eggs') return;
    setTraysBySize({
      small: Math.floor(Number(formData.small_eggs) / eggsPerTray),
      medium: Math.floor(Number(formData.medium_eggs) / eggsPerTray),
      large: Math.floor(Number(formData.large_eggs) / eggsPerTray),
      jumbo: Math.floor(Number(formData.jumbo_eggs) / eggsPerTray),
    });
    setLooseBySize({
      small: Number(formData.small_eggs) % eggsPerTray,
      medium: Number(formData.medium_eggs) % eggsPerTray,
      large: Number(formData.large_eggs) % eggsPerTray,
      jumbo: Number(formData.jumbo_eggs) % eggsPerTray,
    });
  }, [eggsPerTray, inputMode, formData.small_eggs, formData.medium_eggs, formData.large_eggs, formData.jumbo_eggs]);

  const totalEggs =
    Number(formData.small_eggs) +
    Number(formData.medium_eggs) +
    Number(formData.large_eggs) +
    Number(formData.jumbo_eggs);

  const derivedFromTrays =
    inputMode === 'trays'
      ? {
          small_eggs: Math.round(Number(traysBySize.small) * eggsPerTray + Number(looseBySize.small)),
          medium_eggs: Math.round(Number(traysBySize.medium) * eggsPerTray + Number(looseBySize.medium)),
          large_eggs: Math.round(Number(traysBySize.large) * eggsPerTray + Number(looseBySize.large)),
          jumbo_eggs: Math.round(Number(traysBySize.jumbo) * eggsPerTray + Number(looseBySize.jumbo)),
        }
      : null;

  const totalEggsForMode =
    inputMode === 'trays'
      ? (derivedFromTrays?.small_eggs ?? 0) +
        (derivedFromTrays?.medium_eggs ?? 0) +
        (derivedFromTrays?.large_eggs ?? 0) +
        (derivedFromTrays?.jumbo_eggs ?? 0)
      : totalEggs;

  async function handleDelete() {
    if (!window.confirm('Delete this egg collection? This cannot be undone.')) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      // Subtract this collection from egg_inventory so inventory doesn't get "stuck"
      const oldSmall = Number(record.small_eggs ?? 0);
      const oldMedium = Number(record.medium_eggs ?? 0);
      const oldLarge = Number(record.large_eggs ?? 0);
      const oldJumbo = Number(record.jumbo_eggs ?? 0);

      if (oldSmall !== 0 || oldMedium !== 0 || oldLarge !== 0 || oldJumbo !== 0) {
        const { data: inv } = await supabase
          .from('egg_inventory')
          .select('*')
          .eq('farm_id', record.farm_id)
          .maybeSingle();
        if (inv) {
          await supabase
            .from('egg_inventory')
            .update({
              small_eggs: Math.max(0, (inv.small_eggs ?? 0) - oldSmall),
              medium_eggs: Math.max(0, (inv.medium_eggs ?? 0) - oldMedium),
              large_eggs: Math.max(0, (inv.large_eggs ?? 0) - oldLarge),
              jumbo_eggs: Math.max(0, (inv.jumbo_eggs ?? 0) - oldJumbo),
              last_updated: new Date().toISOString(),
            })
            .eq('farm_id', record.farm_id);
        }
      }

      const { error } = await supabase.from('egg_collections').delete().eq('id', record.id);
      if (error) throw error;
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete collection');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    if (inputMode === 'trays') {
      const badLoose =
        [looseBySize.small, looseBySize.medium, looseBySize.large, looseBySize.jumbo].some((v) => Number(v) >= eggsPerTray);
      if (badLoose) {
        setErrorMessage(`Loose eggs for each size must be less than ${eggsPerTray}.`);
        setLoading(false);
        return;
      }
    }

    if (totalEggsForMode === 0) {
      setErrorMessage('Please enter at least some eggs collected');
      setLoading(false);
      return;
    }

    const trays = Math.ceil(totalEggsForMode / eggsPerTray);
    const oldSmall = Number(record.small_eggs ?? 0);
    const oldMedium = Number(record.medium_eggs ?? 0);
    const oldLarge = Number(record.large_eggs ?? 0);
    const oldJumbo = Number(record.jumbo_eggs ?? 0);

    try {
      const { error: updateError } = await supabase
        .from('egg_collections')
        .update({
          flock_id: formData.flock_id || null,
          collection_date: formData.collection_date,
          collected_on: formData.collection_date,
          trays,
          broken: formData.damaged_eggs,
          small_eggs: inputMode === 'trays' ? derivedFromTrays!.small_eggs : formData.small_eggs,
          medium_eggs: inputMode === 'trays' ? derivedFromTrays!.medium_eggs : formData.medium_eggs,
          large_eggs: inputMode === 'trays' ? derivedFromTrays!.large_eggs : formData.large_eggs,
          jumbo_eggs: inputMode === 'trays' ? derivedFromTrays!.jumbo_eggs : formData.jumbo_eggs,
          damaged_eggs: formData.damaged_eggs,
          total_eggs: totalEggsForMode,
          collected_by: profile?.id,
          notes: formData.notes || null,
        })
        .eq('id', record.id);

      if (updateError) throw updateError;

      // Adjust egg_inventory by delta so stock stays correct
      const nextSmall = inputMode === 'trays' ? derivedFromTrays!.small_eggs : formData.small_eggs;
      const nextMedium = inputMode === 'trays' ? derivedFromTrays!.medium_eggs : formData.medium_eggs;
      const nextLarge = inputMode === 'trays' ? derivedFromTrays!.large_eggs : formData.large_eggs;
      const nextJumbo = inputMode === 'trays' ? derivedFromTrays!.jumbo_eggs : formData.jumbo_eggs;
      const deltaSmall = nextSmall - oldSmall;
      const deltaMedium = nextMedium - oldMedium;
      const deltaLarge = nextLarge - oldLarge;
      const deltaJumbo = nextJumbo - oldJumbo;

      if (deltaSmall !== 0 || deltaMedium !== 0 || deltaLarge !== 0 || deltaJumbo !== 0) {
        const { data: inv } = await supabase
          .from('egg_inventory')
          .select('*')
          .eq('farm_id', record.farm_id)
          .maybeSingle();

        if (inv) {
          await supabase
            .from('egg_inventory')
            .update({
              small_eggs: Math.max(0, (inv.small_eggs ?? 0) + deltaSmall),
              medium_eggs: Math.max(0, (inv.medium_eggs ?? 0) + deltaMedium),
              large_eggs: Math.max(0, (inv.large_eggs ?? 0) + deltaLarge),
              jumbo_eggs: Math.max(0, (inv.jumbo_eggs ?? 0) + deltaJumbo),
              last_updated: new Date().toISOString(),
            })
            .eq('farm_id', record.farm_id);
        } else {
          await supabase.from('egg_inventory').insert({
            farm_id: record.farm_id,
            small_eggs: Math.max(0, deltaSmall),
            medium_eggs: Math.max(0, deltaMedium),
            large_eggs: Math.max(0, deltaLarge),
            jumbo_eggs: Math.max(0, deltaJumbo),
            last_updated: new Date().toISOString(),
          });
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update collection');
    } finally {
      setLoading(false);
    }
  }

  const getIntervalTimeLabel = () => {
    if (record.interval_start_at) {
      const d = new Date(record.interval_start_at);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      }
    }
    if (record.source_interval_key) {
      const m = String(record.source_interval_key).match(/(\d{2}:\d{2})/);
      if (m?.[1]) return m[1];
    }
    return null;
  };

  const intervalTimeLabel = getIntervalTimeLabel();
  const lastEditedLabel = record.updated_at
    ? new Date(record.updated_at).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => (onBack ? onBack() : onClose())}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
              aria-label="Back to collections list"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
            <Egg className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-bold text-gray-900">Edit Egg Collection</h2>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Layer Flock (optional)</label>
            <select
              value={formData.flock_id}
              onChange={(e) => setFormData({ ...formData, flock_id: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm"
            >
              <option value="">All flocks combined</option>
              {layerFlocks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Collection Date</label>
            <input
              type="date"
              value={formData.collection_date}
              onChange={(e) => setFormData({ ...formData, collection_date: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm"
              required
            />
          </div>

          {(intervalTimeLabel || lastEditedLabel) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-[11px] text-gray-500">Interval time</div>
                <div className="text-sm font-semibold text-gray-900">{intervalTimeLabel || 'N/A'}</div>
              </div>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-[11px] text-gray-500">Last edited</div>
                <div className="text-sm font-semibold text-gray-900">{lastEditedLabel || 'N/A'}</div>
              </div>
            </div>
          )}

          <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setInputMode('eggs')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inputMode === 'eggs' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              By eggs
            </button>
            <button
              type="button"
              onClick={() => setInputMode('trays')}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                inputMode === 'trays' ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              By trays
            </button>
          </div>

          {inputMode === 'eggs' ? (
            <div className="grid grid-cols-2 gap-3">
              {(['small_eggs', 'medium_eggs', 'large_eggs', 'jumbo_eggs'] as const).map((key) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {key.replace('_eggs', '').charAt(0).toUpperCase() + key.replace('_eggs', '').slice(1)}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 bg-gray-50 text-xs font-semibold text-gray-700">
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
                      min={0}
                      value={traysBySize[row.key]}
                      onChange={(e) => setTraysBySize({ ...traysBySize, [row.key]: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm text-center"
                    />
                  </div>
                  <div className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={eggsPerTray - 1}
                      value={looseBySize[row.key]}
                      onChange={(e) => setLooseBySize({ ...looseBySize, [row.key]: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm text-center"
                    />
                  </div>
                </div>
              ))}
              <div className="px-3 py-2 bg-gray-50 text-[11px] text-gray-600">
                Loose eggs must be less than {eggsPerTray} per size.
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Damaged/Broken Eggs</label>
            <input
              type="number"
              min={0}
              value={formData.damaged_eggs}
              onChange={(e) => setFormData({ ...formData, damaged_eggs: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm"
            />
          </div>

          <div className="p-3 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-900">Total good eggs: {totalEggsForMode}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-900 text-sm resize-none"
              placeholder="Optional..."
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save changes'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl font-medium hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete collection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
