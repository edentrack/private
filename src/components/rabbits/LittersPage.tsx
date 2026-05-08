import { useState, useEffect } from 'react';
import { Plus, X, Baby, TrendingUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

interface Litter {
  id: string;
  farm_id: string;
  breeding_event_id: string | null;
  doe_tag: string;
  kindling_date: string;
  kits_born_alive: number;
  kits_born_dead: number;
  kits_weaned: number | null;
  weaning_date: string | null;
  notes: string | null;
  created_at: string;
}

interface BreedingEventOption {
  id: string;
  doe_tag: string;
  buck_tag: string;
  mating_date: string;
}

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

export function kitSurvivalRate(bornAlive: number, weaned: number | null): number | null {
  if (bornAlive <= 0 || weaned === null) return null;
  return Math.round((weaned / bornAlive) * 100);
}

export function LittersPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();

  const [litters, setLitters] = useState<Litter[]>([]);
  const [breedingOptions, setBreedingOptions] = useState<BreedingEventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formBreedingId, setFormBreedingId] = useState('');
  const [formDoeTag, setFormDoeTag] = useState('');
  const [formKindlingDate, setFormKindlingDate] = useState(localToday);
  const [formBornAlive, setFormBornAlive] = useState('');
  const [formBornDead, setFormBornDead] = useState('');
  const [formWeaned, setFormWeaned] = useState('');
  const [formWeaningDate, setFormWeaningDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadBreedingOptions();
    loadLitters();
  }, [currentFarm?.id]);

  const loadBreedingOptions = async () => {
    const { data } = await supabase
      .from('breeding_events')
      .select('id, doe_tag, buck_tag, mating_date')
      .eq('farm_id', currentFarm!.id)
      .order('mating_date', { ascending: false })
      .limit(50);
    setBreedingOptions(data || []);
  };

  const loadLitters = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('litters')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('kindling_date', { ascending: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des portées' : 'Failed to load litters');
    } else {
      setLitters(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormBreedingId('');
    setFormDoeTag('');
    setFormKindlingDate(localToday());
    setFormBornAlive('');
    setFormBornDead('');
    setFormWeaned('');
    setFormWeaningDate('');
    setFormNotes('');
  };

  const handleSubmit = async () => {
    if (!formDoeTag.trim()) { toast.error(isFr ? "Saisissez l'étiquette de la lapine" : 'Enter the doe tag'); return; }
    if (!formKindlingDate) { toast.error(isFr ? 'Sélectionnez la date de mise bas' : 'Select kindling date'); return; }
    const bornAlive = parseInt(formBornAlive, 10);
    if (!formBornAlive || isNaN(bornAlive) || bornAlive < 0) {
      toast.error(isFr ? "Saisissez le nombre de lapereaux nés vivants (peut être 0)" : 'Enter kits born alive (can be 0)');
      return;
    }

    const bornDead = formBornDead ? parseInt(formBornDead, 10) : 0;
    const weaned = formWeaned ? parseInt(formWeaned, 10) : null;

    setSubmitting(true);
    const { error } = await supabase.from('litters').insert({
      farm_id: currentFarm!.id,
      breeding_event_id: formBreedingId || null,
      doe_tag: formDoeTag.trim(),
      kindling_date: formKindlingDate,
      kits_born_alive: bornAlive,
      kits_born_dead: bornDead,
      kits_weaned: weaned,
      weaning_date: formWeaningDate || null,
      notes: formNotes.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error(isFr ? "Échec de l'enregistrement de la portée" : 'Failed to save litter');
    } else {
      toast.success(isFr ? 'Portée enregistrée' : 'Litter recorded');
      resetForm();
      setShowForm(false);
      loadLitters();
    }
  };

  const totalKits = litters.reduce((s, l) => s + l.kits_born_alive, 0);
  const totalWeaned = litters.reduce((s, l) => s + (l.kits_weaned ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
            <Baby className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Portées' : 'Litters'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Enregistrez les résultats de mise bas et de sevrage." : 'Record kindling outcomes and weaning results.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Enregistrer une portée' : 'Record Litter')}
        </button>
      </div>

      {litters.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="section-card text-center">
            <p className="text-xs text-gray-500 mb-1">{isFr ? 'Total lapereaux nés vivants' : 'Total Kits Born Alive'}</p>
            <p className="text-2xl font-bold text-gray-900">{totalKits.toLocaleString()}</p>
          </div>
          <div className="section-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1 text-gray-500">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">{isFr ? 'Total sevrés' : 'Total Weaned'}</span>
            </div>
            <p className="text-2xl font-bold text-[#3D5F42]">{totalWeaned.toLocaleString()}</p>
          </div>
        </div>
      )}

      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Nouvelle portée' : 'New Litter Record'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {breedingOptions.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Lier à un accouplement' : 'Link to Breeding Event'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
                <select
                  value={formBreedingId}
                  onChange={e => {
                    setFormBreedingId(e.target.value);
                    const opt = breedingOptions.find(o => o.id === e.target.value);
                    if (opt && !formDoeTag) setFormDoeTag(opt.doe_tag);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
                >
                  <option value="">{isFr ? '— aucun —' : '— none —'}</option>
                  {breedingOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.doe_tag} × {o.buck_tag} ({fmtDate(o.mating_date)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étiquette lapine *' : 'Doe Tag *'}</label>
              <input
                type="text"
                placeholder="e.g. DOE-01"
                value={formDoeTag}
                onChange={e => setFormDoeTag(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de mise bas *' : 'Kindling Date *'}</label>
              <input
                type="date"
                value={formKindlingDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormKindlingDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Lapereaux nés vivants *' : 'Kits Born Alive *'}</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 8"
                value={formBornAlive}
                onChange={e => setFormBornAlive(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Lapereaux mort-nés' : 'Kits Born Dead'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 1"
                value={formBornDead}
                onChange={e => setFormBornDead(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Lapereaux sevrés' : 'Kits Weaned'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 7"
                value={formWeaned}
                onChange={e => setFormWeaned(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Date de sevrage' : 'Weaning Date'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="date"
                value={formWeaningDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormWeaningDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Notes' : 'Notes'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? "ex. Belle portée, tous les rosés en bonne santé" : 'e.g. Strong litter, all pinkies healthy'}
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
              {submitting ? (isFr ? 'Enregistrement...' : 'Saving...') : (isFr ? 'Enregistrer la portée' : 'Save Litter')}
            </button>
          </div>
        </div>
      )}

      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : litters.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-3">
              <Baby className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? 'Aucune portée enregistrée pour le moment' : 'No litters recorded yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Enregistrez votre première mise bas pour suivre la survie et les taux de sevrage."
                : 'Record your first kindling to track kit survival and weaning rates.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Première portée' : 'Record First Litter'}
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {litters.map(litter => {
              const survival = kitSurvivalRate(litter.kits_born_alive, litter.kits_weaned);
              return (
                <div key={litter.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{litter.doe_tag}</span>
                      <span className="text-xs text-gray-400">{fmtDate(litter.kindling_date)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                        <Baby className="w-3 h-3" />{litter.kits_born_alive} {isFr ? 'vivants' : 'alive'}
                      </span>
                      {litter.kits_born_dead > 0 && (
                        <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                          {litter.kits_born_dead} {isFr ? 'mort-nés' : 'dead at birth'}
                        </span>
                      )}
                      {litter.kits_weaned !== null && (
                        <span className="inline-flex items-center gap-1 text-xs bg-[#3D5F42]/10 text-[#3D5F42] px-2 py-0.5 rounded-full">
                          <TrendingUp className="w-3 h-3" />{litter.kits_weaned} {isFr ? 'sevrés' : 'weaned'}
                        </span>
                      )}
                      {survival !== null && (
                        <span className="text-xs text-gray-500">({survival}{isFr ? '% de survie' : '% survival'})</span>
                      )}
                    </div>
                    {litter.notes && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{litter.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
