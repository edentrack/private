import { useState } from 'react';
import { Plus, Fish, Wheat, Rabbit, MapPin, Check, Pencil, X, Save, Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import { CreateFarmModal } from '../farms/CreateFarmModal';
import { getMaxFarms } from '../../utils/planGating';
import type { FarmKind } from '../../types/database';
import type { OwnedFarm } from '../../contexts/authContextRef';

export function MyFarmsSection() {
  const { currentFarm, allFarms, switchFarm, profile, refreshSession } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { showToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const tier = profile?.subscription_tier ?? 'free';
  const maxFarms = getMaxFarms(tier);

  const startEdit = (farm: OwnedFarm) => {
    setEditingId(farm.id);
    setEditName(farm.name);
    setEditLocation(farm.location ?? '');
  };

  const saveEdit = async (farmId: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('farms')
      .update({ name: editName.trim(), location: editLocation.trim() || null })
      .eq('id', farmId);
    setSaving(false);
    if (error) { showToast(isFr ? "Échec de la mise à jour de la ferme" : 'Failed to update farm', 'error'); return; }
    showToast(isFr ? 'Ferme mise à jour' : 'Farm updated', 'success');
    setEditingId(null);
    await refreshSession();
  };

  const deleteFarm = async (farmId: string) => {
    setDeletingId(farmId);
    const { error } = await supabase.from('farms').delete().eq('id', farmId);
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error) { showToast(isFr ? "Échec de la suppression de la ferme" : 'Failed to delete farm', 'error'); return; }
    showToast(isFr ? 'Ferme supprimée' : 'Farm removed', 'success');
    await refreshSession();
  };

  const farmTypeBadge = (type: FarmKind) => {
    if (type === 'aquaculture') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100">
          <Fish className="w-3 h-3" /> {isFr ? 'Pisciculture' : 'Fish Farm'}
        </span>
      );
    }
    if (type === 'rabbits') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
          <Rabbit className="w-3 h-3" /> {isFr ? 'Élevage' : 'Rabbitry'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
        <Wheat className="w-3 h-3" /> {isFr ? 'Volaille' : 'Poultry'}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{isFr ? 'Mes fermes' : 'My Farms'}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{isFr
            ? `${allFarms.length} sur ${maxFarms} fermes incluses dans votre forfait`
            : `${allFarms.length} of ${maxFarms} farms on your plan`}</p>
        </div>
        {allFarms.length < maxFarms ? (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-medium rounded-lg hover:bg-emerald-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {isFr ? 'Ajouter une ferme' : 'Add farm'}
          </button>
        ) : (
          <button
            onClick={() => { window.location.hash = '#/subscribe'; }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            {isFr ? 'Mettre à niveau pour plus' : 'Upgrade for more'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {allFarms.map((farm) => {
          const isActive = farm.id === currentFarm?.id;
          const isEditing = editingId === farm.id;
          const isConfirmingDelete = confirmDeleteId === farm.id;
          const isDeleting = deletingId === farm.id;

          return (
            <div
              key={farm.id}
              className={`rounded-2xl border p-4 transition-all ${
                isActive ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-white'
              }`}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder={isFr ? 'Nom de la ferme' : 'Farm name'}
                  />
                  <input
                    value={editLocation}
                    onChange={e => setEditLocation(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder={isFr ? 'Localisation (optionnel)' : 'Location (optional)'}
                  />
                  {/*
                    BUG-029 transparency: species is locked at the farm level
                    because the data model branches on it (flocks vs ponds vs
                    rabbitries, different inventory categories, different
                    health surfaces). If the farm was created with the wrong
                    species, the right move is delete + recreate. The
                    individual flock/pond's *type* is editable separately
                    (see EditFlockModal) — that handles the much more common
                    "tilapia farm got created with type Catfish" case.
                  */}
                  <p className="text-[11px] text-gray-500 italic px-1">
                    {isFr
                      ? `L'espèce (${farm.farm_type}) est verrouillée. Pour changer d'espèce, supprimez cette ferme et créez-en une nouvelle - ou modifiez chaque troupeau/étang via son icône crayon pour corriger un type d'animal erroné.`
                      : `Species (${farm.farm_type}) is locked. To change species, delete this farm and create a new one - or edit individual flocks/ponds via their pencil icon to fix wrong fish/bird type.`}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingId(null)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">
                      <X className="w-3 h-3" /> {isFr ? 'Annuler' : 'Cancel'}
                    </button>
                    <button onClick={() => saveEdit(farm.id)} disabled={saving} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 disabled:opacity-60">
                      <Save className="w-3 h-3" /> {isFr ? 'Enregistrer' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : isConfirmingDelete ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{isFr ? `Supprimer « ${farm.name} » ?` : `Delete "${farm.name}"?`}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{isFr
                        ? "Cela supprime définitivement tous les troupeaux, enregistrements et données de cette ferme. Action irréversible."
                        : 'This permanently deletes all flocks, records and data in this farm. Cannot be undone.'}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDeleteId(null)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50">
                      {isFr ? 'Annuler' : 'Cancel'}
                    </button>
                    <button onClick={() => deleteFarm(farm.id)} disabled={isDeleting} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 disabled:opacity-60">
                      {isDeleting
                        ? (isFr ? 'Suppression...' : 'Deleting...')
                        : (isFr ? 'Oui, supprimer' : 'Yes, delete')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    farm.farm_type === 'aquaculture' ? 'bg-blue-100' : farm.farm_type === 'rabbits' ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {farm.farm_type === 'aquaculture'
                      ? <Fish className="w-5 h-5 text-blue-600" />
                      : farm.farm_type === 'rabbits'
                      ? <Rabbit className="w-5 h-5 text-emerald-700" />
                      : <Wheat className="w-5 h-5 text-amber-700" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 truncate">{farm.name}</p>
                      {isActive && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                          <Check className="w-2.5 h-2.5" /> {isFr ? 'Active' : 'Active'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {farmTypeBadge(farm.farm_type)}
                      {farm.location && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
                          <MapPin className="w-3 h-3" /> {farm.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => startEdit(farm)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isActive && (
                      <>
                        <button onClick={() => setConfirmDeleteId(farm.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => switchFarm(farm.id)} className="px-2.5 py-1 text-xs font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors">
                          {isFr ? 'Basculer' : 'Switch'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {createOpen && (
        <CreateFarmModal
          onClose={() => setCreateOpen(false)}
          onCreated={async (farmId) => {
            setCreateOpen(false);
            await switchFarm(farmId);
          }}
        />
      )}
    </div>
  );
}
