import { useState, useEffect, useCallback } from 'react';
import { Syringe, ChevronDown, ChevronUp, Check, Pencil, Loader2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useLanguage } from '../../contexts/LanguageContext';
import { Flock } from '../../types/database';

/**
 * VaccineScheduleApplier
 *
 * Shows a collapsible "Standard vaccine schedule" card above the
 * manual add form. Species-appropriate templates are loaded from
 * vaccine_schedule_templates, dates are computed from the flock's
 * start_date, and the farmer can edit any row (name, date, dosage,
 * notes) before applying — or just tap "Apply all" to bulk-insert
 * into the vaccinations table in one go.
 *
 * After applying, the entries appear in the main upcoming list and
 * can be marked complete the normal way. Push reminders fire via
 * the existing vaccination_due category.
 */

interface Template {
  id: string;
  vaccine_name: string;
  trigger_type: 'age_days' | 'age_weeks' | 'pre_event' | 'calendar';
  trigger_value: number;
  dosage_hint: string | null;
  notes: string | null;
  display_order: number;
}

interface DraftEntry {
  template_id: string;
  vaccine_name: string;
  scheduled_date: string;
  dosage: string;
  notes: string;
  editing: boolean;
}

interface Props {
  flock: Flock;
  farmId: string;
  species: 'poultry_broiler' | 'poultry_layer' | 'rabbits';
  onApplied: () => void;
}

function computeDate(flock: Flock, template: Template): string {
  const f = flock as Flock & { start_date?: string; arrival_date?: string; created_at?: string };
  const rawStart = f.start_date || f.arrival_date || f.created_at;
  const base = rawStart ? new Date(rawStart) : new Date();
  base.setHours(12, 0, 0, 0);

  let target: Date;
  if (template.trigger_type === 'age_days') {
    target = new Date(base.getTime() + template.trigger_value * 24 * 60 * 60 * 1000);
  } else if (template.trigger_type === 'age_weeks') {
    target = new Date(base.getTime() + template.trigger_value * 7 * 24 * 60 * 60 * 1000);
  } else if (template.trigger_type === 'pre_event') {
    // Default "pre_event" to today + 14 days — farmer will adjust.
    const today = new Date();
    target = new Date(today.getTime() + template.trigger_value * 24 * 60 * 60 * 1000);
  } else {
    // calendar — use month + current year as approximate
    const d = new Date();
    d.setMonth(template.trigger_value - 1, 15);
    target = d;
  }

  return target.toISOString().slice(0, 10);
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function VaccineScheduleApplier({ flock, farmId, species, onApplied }: Props) {
  const { language } = useLanguage();
  const isFr = language === 'fr';

  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  // Load templates for this species
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vaccine_schedule_templates')
      .select('id, vaccine_name, trigger_type, trigger_value, dosage_hint, notes, display_order')
      .eq('species', species)
      .order('display_order');
    const tpls: Template[] = (data || []) as Template[];
    setDrafts(tpls.map(t => ({
      template_id: t.id,
      vaccine_name: t.vaccine_name,
      scheduled_date: computeDate(flock, t),
      dosage: t.dosage_hint || '',
      notes: t.notes || '',
      editing: false,
    })));
    setLoading(false);
  }, [species, flock]);

  // Check if schedule already applied (any vaccination exists for this flock)
  useEffect(() => {
    if (!open) return;
    supabase
      .from('vaccinations')
      .select('id', { count: 'exact', head: true })
      .eq('flock_id', flock.id)
      .then(({ count }) => setAlreadyApplied((count ?? 0) > 0));
    loadTemplates();
  }, [open, flock.id, loadTemplates]);

  const updateDraft = (idx: number, patch: Partial<DraftEntry>) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));
  };

  const handleApply = async () => {
    setSaving(true);
    const rows = drafts.map(d => ({
      farm_id: farmId,
      flock_id: flock.id,
      vaccine_name: d.vaccine_name.trim(),
      scheduled_date: d.scheduled_date || localToday(),
      dosage: d.dosage.trim() || null,
      notes: d.notes.trim() || null,
      completed: false,
    }));
    const { error } = await supabase.from('vaccinations').insert(rows);
    setSaving(false);
    if (error) {
      alert(isFr ? `Erreur : ${error.message}` : `Error: ${error.message}`);
      return;
    }
    setOpen(false);
    onApplied();
  };

  const speciesLabel = species === 'rabbits'
    ? (isFr ? 'lapins' : 'rabbits')
    : species === 'poultry_layer'
    ? (isFr ? 'poules pondeuses' : 'laying hens')
    : (isFr ? 'poulets de chair' : 'broilers');

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
      {/* Header — tap to expand */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Syringe className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-amber-900 text-sm">
              {isFr ? `Programme vaccinal standard — ${speciesLabel}` : `Standard vaccine schedule — ${speciesLabel}`}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {isFr
                ? 'Appliquer un programme pré-rempli, modifiable avant confirmation'
                : 'Apply a pre-filled schedule — edit any entry before saving'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-amber-600 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-amber-600 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-amber-200 pt-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-amber-700 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> {isFr ? 'Chargement…' : 'Loading…'}
            </div>
          ) : (
            <>
              {alreadyApplied && (
                <div className="mb-3 px-3 py-2 bg-amber-100 rounded-lg text-xs text-amber-800">
                  {isFr
                    ? 'Ce lot a déjà des vaccins planifiés. Vous pouvez quand même ajouter des entrées supplémentaires.'
                    : 'This flock already has scheduled vaccines. You can still add more entries.'}
                </div>
              )}

              <p className="text-xs text-amber-700 mb-3">
                {isFr
                  ? 'Dates calculées depuis la date de démarrage du lot. Modifiez chaque ligne avant d\'appliquer.'
                  : 'Dates calculated from flock start date. Edit any row before applying.'}
              </p>

              <div className="space-y-2">
                {drafts.map((draft, idx) => (
                  <div key={draft.template_id} className="bg-white border border-amber-100 rounded-xl p-3">
                    {draft.editing ? (
                      /* Edit mode */
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                              {isFr ? 'Nom du vaccin' : 'Vaccine name'}
                            </label>
                            <input
                              type="text"
                              value={draft.vaccine_name}
                              onChange={e => updateDraft(idx, { vaccine_name: e.target.value })}
                              className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                              {isFr ? 'Date prévue' : 'Scheduled date'}
                            </label>
                            <input
                              type="date"
                              value={draft.scheduled_date}
                              onChange={e => updateDraft(idx, { scheduled_date: e.target.value })}
                              className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                              {isFr ? 'Dosage' : 'Dosage'}
                            </label>
                            <input
                              type="text"
                              value={draft.dosage}
                              onChange={e => updateDraft(idx, { dosage: e.target.value })}
                              placeholder={isFr ? 'ex. 0.5 ml SC' : 'e.g. 0.5 ml SC'}
                              className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                              {isFr ? 'Notes' : 'Notes'}
                            </label>
                            <input
                              type="text"
                              value={draft.notes}
                              onChange={e => updateDraft(idx, { notes: e.target.value })}
                              className="w-full mt-0.5 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => updateDraft(idx, { editing: false })}
                            className="px-3 py-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                          >
                            {isFr ? 'Fermer' : 'Done'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Read mode */
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{draft.vaccine_name}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-500">
                              📅 {new Date(draft.scheduled_date + 'T12:00:00').toLocaleDateString()}
                            </span>
                            {draft.dosage && (
                              <span className="text-xs text-gray-500">💉 {draft.dosage}</span>
                            )}
                          </div>
                          {draft.notes && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{draft.notes}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateDraft(idx, { editing: true })}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg flex-shrink-0"
                          title={isFr ? 'Modifier' : 'Edit'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDrafts(prev => prev.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg flex-shrink-0"
                          title={isFr ? 'Supprimer' : 'Remove'}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {drafts.length === 0 && (
                <p className="text-sm text-amber-700 text-center py-4">
                  {isFr ? 'Toutes les entrées ont été supprimées.' : 'All entries removed.'}
                </p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {isFr ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={saving || drafts.length === 0}
                  className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> {isFr ? 'Application…' : 'Applying…'}</>
                  ) : (
                    <><Check className="w-4 h-4" />
                      {isFr ? `Appliquer (${drafts.length})` : `Apply all (${drafts.length})`}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default VaccineScheduleApplier;
