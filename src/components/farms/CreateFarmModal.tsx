import { useState } from 'react';
import { X, Fish, Wheat, MapPin, Check, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { getMaxFarms, atFarmLimit } from '../../utils/planGating';
import type { FarmKind } from '../../types/database';

interface CreateFarmModalProps {
  onClose: () => void;
  onCreated: (farmId: string) => void;
}

const FARM_TYPES: { id: FarmKind; label: string; subtitle: string; icon: any; color: string; bgColor: string; features: string[] }[] = [
  {
    id: 'poultry',
    label: 'Poultry',
    subtitle: 'Broilers & Layers',
    icon: Wheat,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
    features: ['Egg production tracking', 'Flock management', 'Vaccination records', 'Feed consumption'],
  },
  {
    id: 'aquaculture',
    label: 'Fish Farm',
    subtitle: 'Catfish, Tilapia & more',
    icon: Fish,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    features: ['Pond management', 'Stocking events', 'Water quality logs', 'Harvest records'],
  },
];

export function CreateFarmModal({ onClose, onCreated }: CreateFarmModalProps) {
  const { user, profile, allFarms, switchFarm } = useAuth();
  const { showToast } = useToast();

  const [farmType, setFarmType] = useState<FarmKind>('poultry');
  const [farmName, setFarmName] = useState('');
  const [sameLocation, setSameLocation] = useState(allFarms.length > 0);
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const tier = profile?.subscription_tier ?? 'free';
  const maxFarms = getMaxFarms(tier);
  const isAtLimit = atFarmLimit(tier, allFarms.length);

  const handleCreate = async () => {
    if (!farmName.trim()) { showToast('Enter a farm name', 'error'); return; }
    if (!user) return;

    setSaving(true);
    try {
      const locationValue = sameLocation
        ? (allFarms[0]?.location ?? null)
        : (location.trim() || null);

      const { data: newFarm, error } = await supabase
        .from('farms')
        .insert({
          name: farmName.trim(),
          owner_id: user.id,
          farm_type: farmType,
          location: locationValue,
        })
        .select()
        .maybeSingle();

      if (error || !newFarm) {
        showToast(error?.message ?? 'Failed to create farm', 'error');
        return;
      }

      // Add owner membership
      await supabase.from('farm_members').insert({
        farm_id: newFarm.id,
        user_id: user.id,
        role: 'owner',
        is_active: true,
        joined_at: new Date().toISOString(),
      });

      showToast(`${farmName.trim()} created`, 'success');
      onCreated(newFarm.id);
    } finally {
      setSaving(false);
    }
  };

  if (isAtLimit) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Farm limit reached</h2>
          <p className="text-sm text-gray-600 mb-4">
            Your {tier === 'free' ? 'Starter' : tier === 'pro' ? 'Grower' : 'current'} plan allows up to {maxFarms} farm{maxFarms === 1 ? '' : 's'}.
            Upgrade to add more.
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
            <button
              onClick={() => { onClose(); window.location.hash = '#/subscribe'; }}
              className="flex-1 btn-primary text-sm py-2.5"
            >
              Upgrade plan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New farm</h2>
            <p className="text-xs text-gray-500 mt-0.5">{allFarms.length}/{maxFarms} farms used on your plan</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Farm type selector */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 block">Farm type</label>
            <div className="grid grid-cols-2 gap-3">
              {FARM_TYPES.map((ft) => {
                const Icon = ft.icon;
                const selected = farmType === ft.id;
                return (
                  <button
                    key={ft.id}
                    onClick={() => setFarmType(ft.id)}
                    className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                      selected
                        ? `${ft.bgColor} border-current shadow-sm`
                        : 'bg-gray-50 border-gray-100 hover:border-gray-200'
                    }`}
                  >
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <Icon className={`w-6 h-6 mb-2 ${selected ? ft.color : 'text-gray-400'}`} />
                    <p className={`text-sm font-semibold ${selected ? ft.color : 'text-gray-700'}`}>{ft.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{ft.subtitle}</p>
                    <ul className="mt-2 space-y-0.5">
                      {ft.features.map(f => (
                        <li key={f} className="text-[10px] text-gray-500 flex items-center gap-1">
                          <span className="w-1 h-1 bg-gray-300 rounded-full flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Farm name */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block">Farm name</label>
            <input
              type="text"
              value={farmName}
              onChange={e => setFarmName(e.target.value)}
              placeholder={farmType === 'aquaculture' ? 'e.g. Riverside Fish Farm' : 'e.g. North Block Farm'}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              autoFocus
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
              <MapPin className="w-3 h-3" /> Location (optional)
            </label>
            {allFarms.length > 0 && (
              <label className="flex items-center gap-2 mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sameLocation}
                  onChange={e => setSameLocation(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <span className="text-sm text-gray-600">Same location as existing farm</span>
              </label>
            )}
            {!sameLocation && (
              <input
                type="text"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City, Region or GPS coordinates"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 btn-secondary py-2.5 text-sm">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={saving || !farmName.trim()}
            className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create farm'}
          </button>
        </div>
      </div>
    </div>
  );
}
