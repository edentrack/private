import { useState, useEffect } from 'react';
import { Plus, X, Heart, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

interface BreedingEvent {
  id: string;
  farm_id: string;
  flock_id: string | null;
  doe_tag: string;
  buck_tag: string;
  mating_date: string;
  expected_kindling_date: string | null;
  notes: string | null;
  created_at: string;
}

interface RabbitFlock {
  id: string;
  name: string;
  type: string;
}

const RABBIT_TYPES = ['Meat Rabbits', 'Breeder Rabbits'];
const KINDLING_GESTATION_DAYS = 31;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
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

export function BreedingEventsPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();

  const [events, setEvents] = useState<BreedingEvent[]>([]);
  const [flocks, setFlocks] = useState<RabbitFlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formFlockId, setFormFlockId] = useState('');
  const [formDoeTag, setFormDoeTag] = useState('');
  const [formBuckTag, setFormBuckTag] = useState('');
  const [formMatingDate, setFormMatingDate] = useState(localToday);
  const [formNotes, setFormNotes] = useState('');

  const expectedKindling = formMatingDate ? addDays(formMatingDate, KINDLING_GESTATION_DAYS) : '';

  useEffect(() => {
    if (!currentFarm?.id) return;
    loadFlocks();
    loadEvents();
  }, [currentFarm?.id]);

  const loadFlocks = async () => {
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type')
      .eq('farm_id', currentFarm!.id)
      .eq('status', 'active')
      .in('type', RABBIT_TYPES)
      .order('name');
    const result = data || [];
    setFlocks(result);
    if (result.length > 0) setFormFlockId(result[0].id);
  };

  const loadEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('breeding_events')
      .select('*')
      .eq('farm_id', currentFarm!.id)
      .order('mating_date', { ascending: false });
    if (error) {
      toast.error(isFr ? 'Échec du chargement des événements de reproduction' : 'Failed to load breeding events');
    } else {
      setEvents(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormDoeTag('');
    setFormBuckTag('');
    setFormMatingDate(localToday());
    setFormNotes('');
    if (flocks.length > 0) setFormFlockId(flocks[0].id);
  };

  const handleSubmit = async () => {
    if (!formDoeTag.trim()) { toast.error(isFr ? "Saisissez l'étiquette de la lapine" : 'Enter the doe tag'); return; }
    if (!formBuckTag.trim()) { toast.error(isFr ? "Saisissez l'étiquette du lapin mâle" : 'Enter the buck tag'); return; }
    if (!formMatingDate) { toast.error(isFr ? "Sélectionnez la date d'accouplement" : 'Select mating date'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('breeding_events').insert({
      farm_id: currentFarm!.id,
      flock_id: formFlockId || null,
      doe_tag: formDoeTag.trim(),
      buck_tag: formBuckTag.trim(),
      mating_date: formMatingDate,
      expected_kindling_date: expectedKindling || null,
      notes: formNotes.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      toast.error(isFr ? "Échec de l'enregistrement de l'accouplement" : 'Failed to save breeding event');
    } else {
      toast.success(isFr ? 'Accouplement enregistré' : 'Breeding event recorded');
      resetForm();
      setShowForm(false);
      loadEvents();
    }
  };

  const getFlockName = (id: string | null) => flocks.find(f => f.id === id)?.name ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-pink-50 text-pink-600">
            <Heart className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{isFr ? 'Événements de reproduction' : 'Breeding Events'}</h1>
            <p className="text-sm text-gray-500">{isFr ? "Suivez les couples reproducteurs et les dates prévues de mise bas." : 'Track mating pairs and expected kindling dates.'}</p>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? (isFr ? 'Annuler' : 'Cancel') : (isFr ? 'Enregistrer un accouplement' : 'Log Mating')}
        </button>
      </div>

      {showForm && (
        <div className="section-card animate-fade-in-up">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">{isFr ? 'Nouvel événement de reproduction' : 'New Breeding Event'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Étiquette mâle *' : 'Buck Tag *'}</label>
              <input
                type="text"
                placeholder="e.g. BUCK-01"
                value={formBuckTag}
                onChange={e => setFormBuckTag(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? "Date d'accouplement *" : 'Mating Date *'}</label>
              <input
                type="date"
                value={formMatingDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setFormMatingDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            {expectedKindling && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Mise bas prévue' : 'Expected Kindling'}</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-pink-50 border border-pink-100 rounded-lg">
                  <Calendar className="w-4 h-4 text-pink-500 shrink-0" />
                  <span className="text-sm font-medium text-pink-700">{fmtDate(expectedKindling)}</span>
                  <span className="text-xs text-pink-400">(+{KINDLING_GESTATION_DAYS}{isFr ? 'j' : 'd'})</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{isFr ? 'Notes' : 'Notes'} <span className="text-gray-400 font-normal">{isFr ? 'optionnel' : 'optional'}</span></label>
              <input
                type="text"
                placeholder={isFr ? 'ex. Première portée, introduit à 7h' : 'e.g. First litter, introduced at 7am'}
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
              {submitting ? (isFr ? 'Enregistrement...' : 'Saving...') : (isFr ? "Enregistrer l'événement" : 'Save Event')}
            </button>
          </div>
        </div>
      )}

      <div className="section-card">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-[#3D5F42] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-pink-50 flex items-center justify-center mb-3">
              <Heart className="w-7 h-7 text-pink-400" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{isFr ? "Aucun accouplement enregistré pour le moment" : 'No breeding events yet'}</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              {isFr
                ? "Enregistrez votre premier couple reproducteur pour suivre la gestation et les dates prévues de mise bas."
                : 'Log your first mating pair to track gestation and expected kindling dates.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white text-sm rounded-xl hover:bg-[#2f4a34] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isFr ? 'Premier accouplement' : 'Log First Mating'}
            </button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-gray-100">
            {events.map(ev => {
              const flockName = getFlockName(ev.flock_id);
              return (
                <div key={ev.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {ev.doe_tag} × {ev.buck_tag}
                      </span>
                      {flockName && (
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{flockName}</span>
                      )}
                      <span className="text-xs text-gray-400">{fmtDate(ev.mating_date)}</span>
                    </div>
                    {ev.expected_kindling_date && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-pink-600">
                        <Calendar className="w-3 h-3" />
                        {isFr ? 'Mise bas prévue' : 'Expected kindling'}: {fmtDate(ev.expected_kindling_date)}
                      </div>
                    )}
                    {ev.notes && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{ev.notes}</p>
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
