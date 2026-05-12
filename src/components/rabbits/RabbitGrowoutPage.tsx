import { useEffect, useState } from 'react';
import { Loader2, Layers, Calendar, Users, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';

/**
 * Grow-out Groups — Rabbits.
 *
 * A grow-out group is a cohort of rabbits of known age born / bought in
 * on a known date. Each litter automatically creates a group via the
 * `rabbit_create_growout_from_litter` trigger; farmers can also create
 * "buy-in" groups manually for rabbits they didn't breed themselves.
 *
 * Phase 1 (this commit): list-only. Shows each group with its age,
 * starting count, current count, and origin (litter vs manual).
 *
 * Phase 2 (follow-up):
 *   - Manual create form ("I bought 20 rabbits today")
 *   - Edit name / current_count / status
 *   - Inline mortality and weight log
 *   - Link from Rabbit Sales page so a sale picks "from group X"
 *   - Decrement current_count via trigger on sale insert
 *
 * Visual model: cards per group, simple and readable. The "age" is
 * computed client-side from birth_date so we don't store it. Status
 * pills (active / sold_out / closed) drive sort order.
 */

interface GrowoutGroup {
  id: string;
  farm_id: string;
  name: string;
  source_litter_id: string | null;
  birth_date: string | null;
  starting_count: number;
  current_count: number;
  status: 'active' | 'sold_out' | 'closed';
  notes: string | null;
  created_at: string;
}

function weeksSince(date: string | null): number | null {
  if (!date) return null;
  const start = new Date(date);
  if (isNaN(start.getTime())) return null;
  const diff = Date.now() - start.getTime();
  return Math.max(0, Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function fmtBirth(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function RabbitGrowoutPage() {
  const { currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const toast = useToast();

  const [groups, setGroups] = useState<GrowoutGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentFarm?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rabbit_growout_groups')
        .select('*')
        .eq('farm_id', currentFarm.id)
        // Active groups float to the top; within each status, newest first.
        .order('status', { ascending: true })
        .order('birth_date', { ascending: false, nullsFirst: false });
      if (error) {
        toast.error(isFr ? 'Échec du chargement des cohortes' : 'Failed to load grow-out groups');
      } else {
        setGroups((data as GrowoutGroup[]) || []);
      }
      setLoading(false);
    })();
  }, [currentFarm?.id, isFr, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        {isFr ? 'Chargement…' : 'Loading…'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {isFr ? 'Cohortes d\'engraissement' : 'Grow-out Groups'}
            </h1>
            <p className="text-sm text-gray-500">
              {isFr
                ? 'Suivez chaque cohorte de lapins par âge et effectif.'
                : 'Track each rabbit cohort by age and current count.'}
            </p>
          </div>
        </div>
        {/* Manual create deferred to Phase 2. Until then, litters
            auto-create their growout via DB trigger. */}
        <button
          type="button"
          disabled
          title={isFr ? 'Bientôt disponible' : 'Coming soon'}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-500 text-sm rounded-xl cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          {isFr ? 'Ajouter une cohorte' : 'Add cohort'}
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="section-card text-center py-12">
          <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-700 mb-1">
            {isFr ? 'Aucune cohorte pour le moment' : 'No grow-out groups yet'}
          </h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
            {isFr
              ? "Enregistrez une portée et une cohorte sera créée automatiquement avec la date de naissance et l'effectif."
              : 'Log a litter and a grow-out group is created automatically with the birth date and starting count.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => {
            const weeks = weeksSince(g.birth_date);
            const isActive = g.status === 'active';
            const isSoldOut = g.status === 'sold_out';
            return (
              <div
                key={g.id}
                className={`rounded-2xl border p-4 ${
                  isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-snug">{g.name}</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-700'
                        : isSoldOut
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {isActive
                      ? (isFr ? 'Actif' : 'Active')
                      : isSoldOut
                      ? (isFr ? 'Vendu' : 'Sold out')
                      : (isFr ? 'Clos' : 'Closed')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{fmtBirth(g.birth_date)}</span>
                  {weeks !== null && (
                    <span className="ml-auto text-[11px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                      {weeks}w
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-700">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="font-medium">{g.current_count}</span>
                  <span className="text-gray-400">/ {g.starting_count}</span>
                  <span className="text-xs text-gray-400 ml-1">
                    {isFr ? 'restant' : 'alive'}
                  </span>
                </div>
                {g.source_litter_id && (
                  <p className="text-[11px] text-gray-400 mt-2 italic">
                    {isFr ? 'Issue d\'une portée' : 'Auto-created from a litter'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RabbitGrowoutPage;
