import { useState, useEffect } from 'react';
import { Plus, X, ClipboardList, Circle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

interface RabbitRecord {
  id: string;
  farm_id: string;
  flock_id: string | null;
  tag: string;
  sex: 'doe' | 'buck';
  breed: string | null;
  birth_date: string | null;
  sire_tag: string | null;
  dam_tag: string | null;
  status: 'active' | 'culled' | 'sold' | 'dead';
  notes: string | null;
  created_at: string;
}

interface RabbitFlock {
  id: string;
  name: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  culled: 'bg-red-100 text-red-700',
  sold: 'bg-blue-100 text-blue-700',
  dead: 'bg-gray-100 text-gray-600',
};

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(s: string): string {
  const p = String(s).split(/[-T]/);
  if (p.length >= 3) {
    const d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

export function RabbitsRegistryPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();

  const [rabbits, setRabbits] = useState<RabbitRecord[]>([]);
  const [flocks, setFlocks] = useState<RabbitFlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('active');

  const [formFlockId, setFormFlockId] = useState('');
  const [formTag, setFormTag] = useState('');
  const [formSex, setFormSex] = useState<'doe' | 'buck'>('doe');
  const [formBreed, setFormBreed] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formSireTag, setFormSireTag] = useState('');
  const [formDamTag, setFormDamTag] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadRabbits();
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', ['Meat Rabbits', 'Breeder Rabbits'])
      .order('name');
    setFlocks(data || []);
  };

  const loadRabbits = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rabbits')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('tag');
    if (error) {
      toast.error(isFr ? 'Échec du chargement du registre des lapins' : 'Failed to load rabbit registry');
    } else {
      setRabbits(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormTag('');
    setFormSex('doe');
    setFormBreed('');
    setFormBirthDate('');
    setFormSireTag('');
    setFormDamTag('');
    setFormNotes('');
    setFormFlockId(flocks[0]?.id ?? '');
  };

  const handleSubmit = async () => {
    if (!formTag.trim()) { toast.error(isFr ? 'Saisissez un numéro de boucle ou ID' : 'Enter an ear tag or ID'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('rabbits').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId || null,
      tag: formTag.trim(),
      sex: formSex,
      breed: formBreed.trim() || null,
      birth_date: formBirthDate || null,
      sire_tag: formSireTag.trim() || null,
      dam_tag: formDamTag.trim() || null,
      notes: formNotes.trim() || null,
      status: 'active',
    });
    setSubmitting(false);

    if (error) {
      if (error.code === '23505') {
        toast.error(isFr ? `L'étiquette « ${formTag} » existe déjà dans cette ferme` : `Tag "${formTag}" already exists in this farm`);
      } else {
        toast.error(isFr ? "Échec de l'enregistrement du lapin" : 'Failed to save rabbit record');
      }
    } else {
      toast.success(isFr ? 'Lapin ajouté au registre' : 'Rabbit added to registry');
      resetForm();
      setShowForm(false);
      loadRabbits();
    }
  };

  const filtered = filterStatus === 'all'
    ? rabbits
    : rabbits.filter(r => r.status === filterStatus);

  const activeCount = rabbits.filter(r => r.status === 'active').length;
  const doesCount = rabbits.filter(r => r.status === 'active' && r.sex === 'doe').length;
  const bucksCount = rabbits.filter(r => r.status === 'active' && r.sex === 'buck').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Registre des lapins' : 'Rabbit Registry'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Fiches individuelles des reproducteurs avec suivi de la lignée." : 'Individual breeder records with lineage tracking.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Ajouter un lapin' : 'Add Rabbit')}
        </button>
      </div>

      {rabbits.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="section-card text-center py-3">
            <p className="text-xs text-gray-500 mb-0.5">{isFr ? 'Actifs' : 'Active'}</p>
            <p className="text-xl font-bold text-gray-900">{activeCount}</p>
          </div>
          <div className="section-card text-center py-3">
            <p className="text-xs text-gray-500 mb-0.5">{isFr ? 'Lapines' : 'Does'}</p>
            <p className="text-xl font-bold text-pink-600">{doesCount}</p>
          </div>
          <div className="section-card text-center py-3">
            <p className="text-xs text-gray-500 mb-0.5">{isFr ? 'Mâles' : 'Bucks'}</p>
            <p className="text-xl font-bold text-blue-600">{bucksCount}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Ajouter un lapin au registre' : 'Add Rabbit to Registry'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Boucle / ID *' : 'Ear Tag / ID *'}</label>
              <input
                type="text"
                placeholder="e.g. DOE-01 or R-2024-015"
                value={formTag}
                onChange={e => setFormTag(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Sexe *' : 'Sex *'}</label>
              <div className="flex gap-3">
                {(['doe', 'buck'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFormSex(s)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      formSex === s
                        ? s === 'doe'
                          ? 'bg-pink-50 border-pink-300 text-pink-700'
                          : 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {isFr ? (s === 'doe' ? 'Lapine (♀)' : 'Mâle (♂)') : (s === 'doe' ? 'Doe (♀)' : 'Buck (♂)')}
                  </button>
                ))}
              </div>
            </div>
            {flocks.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Élevage' : 'Rabbitry'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
                <select
                  value={formFlockId}
                  onChange={e => setFormFlockId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                >
                  <option value="">{isFr ? '— aucun —' : '— none —'}</option>
                  {flocks.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Race' : 'Breed'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Néo-Zélandais blanc, Californien' : 'e.g. New Zealand White, Californian'}
                value={formBreed}
                onChange={e => setFormBreed(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de naissance' : 'Birth Date'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="date"
                value={formBirthDate}
                max={localToday()}
                onChange={e => setFormBirthDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étiquette du père' : 'Sire Tag'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? "Boucle d'oreille du père" : "Father's ear tag"}
                value={formSireTag}
                onChange={e => setFormSireTag(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étiquette de la mère' : 'Dam Tag'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? "Boucle d'oreille de la mère" : "Mother's ear tag"}
                value={formDamTag}
                onChange={e => setFormDamTag(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Notes' : 'Notes'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Acheté à la ferme XYZ' : 'e.g. Purchased from XYZ farm'}
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (isFr ? 'Enregistrement...' : 'Saving...') : (isFr ? 'Ajouter au registre' : 'Add to Registry')}
            </button>
          </div>
        </div>
      )}

      {/* Filter pills */}
      {rabbits.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(['active', 'culled', 'sold', 'dead', 'all'] as const).map(s => {
            const labelFr: Record<string, string> = { active: 'Actifs', culled: 'Réformés', sold: 'Vendus', dead: 'Morts', all: 'Tous' };
            const labelEn: Record<string, string> = { active: 'Active', culled: 'Culled', sold: 'Sold', dead: 'Dead', all: 'All' };
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-[#3D5F42] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {isFr ? labelFr[s] : labelEn[s]}
                {s !== 'all' && (
                  <span className="ml-1 opacity-70">({rabbits.filter(r => r.status === s).length})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 && rabbits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-50 flex items-center justify-center mb-3">
              <ClipboardList className="w-7 h-7 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Le registre est vide' : 'Registry is empty'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Ajoutez des lapins individuels pour suivre la lignée, l'historique de reproduction et les performances."
                : 'Add individual rabbits to track lineage, breeding history, and performance.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Premier lapin' : 'Add First Rabbit'}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-8">{isFr ? `Aucun lapin ${filterStatus === 'active' ? 'actif' : filterStatus === 'culled' ? 'réformé' : filterStatus === 'sold' ? 'vendu' : 'mort'}.` : `No ${filterStatus} rabbits.`}</p>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {filtered.map(r => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{r.tag}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.sex === 'doe' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                      {isFr ? (r.sex === 'doe' ? 'Lapine ♀' : 'Mâle ♂') : (r.sex === 'doe' ? 'Doe ♀' : 'Buck ♂')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                      <Circle className="w-2 h-2 inline mr-1 fill-current" />{
                        isFr
                          ? (r.status === 'active' ? 'actif' : r.status === 'culled' ? 'réformé' : r.status === 'sold' ? 'vendu' : 'mort')
                          : r.status
                      }
                    </span>
                    {r.breed && <span className="text-xs text-gray-400">{r.breed}</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500">
                    {r.birth_date && <span>{isFr ? 'Né(e)' : 'Born'} {fmtDate(r.birth_date)}</span>}
                    {r.sire_tag && <span>{isFr ? 'Père' : 'Sire'}: {r.sire_tag}</span>}
                    {r.dam_tag && <span>{isFr ? 'Mère' : 'Dam'}: {r.dam_tag}</span>}
                  </div>
                  {r.notes && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{r.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
