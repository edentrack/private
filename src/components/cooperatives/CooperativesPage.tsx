import { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Users, MapPin, Search, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { CreateCooperativeModal } from './CreateCooperativeModal';

interface Cooperative {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  region: string | null;
  description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  owner_user_id: string;
  created_at: string;
}

interface CooperativeWithRole extends Cooperative {
  isAdmin: boolean;
  adminRole: 'admin' | 'viewer' | null;
  memberFarmCount: number;
  myMembership?: { farm_id: string; status: string } | null;
}

export function CooperativesPage() {
  const { user, currentFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CooperativeWithRole[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState('');
  const [browsing, setBrowsing] = useState(false);
  const [browseResults, setBrowseResults] = useState<Cooperative[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [adminRows, memberRows] = await Promise.all([
      supabase
        .from('cooperative_admins')
        .select('cooperative_id, role')
        .eq('user_id', user.id),
      currentFarm
        ? supabase
            .from('cooperative_members')
            .select('cooperative_id, farm_id, status')
            .eq('farm_id', currentFarm.id)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const adminMap = new Map<string, 'admin' | 'viewer'>();
    (adminRows.data || []).forEach((r: { cooperative_id: string; role: 'admin' | 'viewer' }) => adminMap.set(r.cooperative_id, r.role));

    const memberMap = new Map<string, { farm_id: string; status: string }>();
    (memberRows.data || []).forEach((r: { cooperative_id: string; farm_id: string; status: string }) =>
      memberMap.set(r.cooperative_id, { farm_id: r.farm_id, status: r.status })
    );

    const allIds = new Set<string>([...adminMap.keys(), ...memberMap.keys()]);
    if (allIds.size === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: coops, error } = await supabase
      .from('cooperatives')
      .select('*')
      .in('id', Array.from(allIds));

    if (error) {
      showToast(isFr ? `Échec du chargement des coopératives : ${error.message}` : `Failed to load cooperatives: ${error.message}`, 'error');
      setLoading(false);
      return;
    }

    const counts = await Promise.all(
      (coops || []).map(async (c) => {
        const { count } = await supabase
          .from('cooperative_members')
          .select('id', { count: 'exact', head: true })
          .eq('cooperative_id', c.id)
          .eq('status', 'active');
        return { id: c.id, count: count ?? 0 };
      })
    );
    const countMap = new Map(counts.map((x) => [x.id, x.count]));

    const enriched: CooperativeWithRole[] = (coops || []).map((c) => ({
      ...c,
      isAdmin: adminMap.has(c.id),
      adminRole: adminMap.get(c.id) ?? null,
      memberFarmCount: countMap.get(c.id) ?? 0,
      myMembership: memberMap.get(c.id) ?? null,
    }));
    enriched.sort((a, b) => (a.isAdmin === b.isAdmin ? a.name.localeCompare(b.name) : a.isAdmin ? -1 : 1));

    setItems(enriched);
    setLoading(false);
  }, [user, currentFarm, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const browseSearch = useCallback(async () => {
    const q = browseQuery.trim();
    if (q.length < 2) {
      setBrowseResults([]);
      return;
    }
    setBrowsing(true);
    const { data, error } = await supabase
      .from('cooperatives')
      .select('id, name, slug, country, region, description, contact_email, contact_phone, owner_user_id, created_at')
      .or(`name.ilike.%${q}%,slug.ilike.%${q}%,region.ilike.%${q}%`)
      .limit(15);
    setBrowsing(false);
    if (error) {
      showToast(isFr ? `Échec de la recherche : ${error.message}` : `Search failed: ${error.message}`, 'error');
      return;
    }
    const knownIds = new Set(items.map((i) => i.id));
    setBrowseResults((data || []).filter((d) => !knownIds.has(d.id)));
  }, [browseQuery, items, showToast]);

  const requestJoin = async (cooperativeId: string) => {
    if (!currentFarm) {
      showToast(isFr ? "Sélectionnez d'abord une ferme" : 'Select a farm first', 'error');
      return;
    }
    const { error } = await supabase.from('cooperative_members').insert({
      cooperative_id: cooperativeId,
      farm_id: currentFarm.id,
      status: 'pending',
    });
    if (error) {
      showToast(isFr ? `Échec de la demande : ${error.message}` : `Request failed: ${error.message}`, 'error');
      return;
    }
    showToast(isFr ? "Demande d'adhésion envoyée - l'administrateur l'approuvera." : 'Join request sent - admin will approve.', 'success');
    setBrowseResults((r) => r.filter((c) => c.id !== cooperativeId));
    load();
  };

  const openCoop = (id: string) => {
    window.location.hash = `#/cooperatives/${id}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            {isFr ? 'Coopératives' : 'Cooperatives'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {isFr ? 'Tableaux de bord agrégateurs synthétisant les données de nombreuses fermes membres.' : 'Aggregator dashboards rolling up data across many member farms.'}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {isFr ? 'Nouvelle coopérative' : 'New cooperative'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900">{isFr ? 'Aucune coopérative pour le moment' : 'No cooperatives yet'}</h2>
          <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
            {isFr
              ? "Créez une coopérative si vous gérez une ONG, une union laitière ou un réseau agrégateur. Ou parcourez ci-dessous pour demander à rejoindre une coopérative existante."
              : 'Create a cooperative if you run an NGO, dairy union, or aggregator network. Or browse below to request to join an existing one.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3 mb-8">
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => openCoop(c.id)}
              className="text-left bg-white border border-gray-200 hover:border-emerald-400 hover:shadow-sm transition rounded-xl p-4 flex items-start justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 truncate">{c.name}</span>
                  {c.isAdmin && (
                    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {c.adminRole === 'admin' ? (isFr ? 'Administrateur' : 'Admin') : (isFr ? 'Lecteur' : 'Viewer')}
                    </span>
                  )}
                  {!c.isAdmin && c.myMembership?.status === 'pending' && (
                    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                      {isFr ? 'En attente' : 'Pending'}
                    </span>
                  )}
                </div>
                {(c.region || c.country) && (
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {[c.region, c.country].filter(Boolean).join(', ')}
                  </div>
                )}
                <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {isFr ? `${c.memberFarmCount} ferme${c.memberFarmCount === 1 ? '' : 's'} membre${c.memberFarmCount === 1 ? '' : 's'} active${c.memberFarmCount === 1 ? '' : 's'}` : `${c.memberFarmCount} active member ${c.memberFarmCount === 1 ? 'farm' : 'farms'}`}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-medium text-gray-900 mb-2">{isFr ? 'Parcourir les coopératives' : 'Browse cooperatives'}</h2>
        <p className="text-sm text-gray-600 mb-3">
          {isFr ? 'Trouvez une coopérative existante et demandez à votre ferme de la rejoindre.' : 'Find an existing cooperative and request your farm join it.'}
        </p>
        {!currentFarm && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            {isFr ? 'Sélectionnez une ferme dans le sélecteur en haut à gauche avant de demander à rejoindre.' : 'Select a farm in the top-left switcher before requesting to join.'}
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && browseSearch()}
              placeholder={isFr ? 'Rechercher par nom, slug ou région…' : 'Search by name, slug, or region…'}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <button
            onClick={browseSearch}
            disabled={browseQuery.trim().length < 2}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg text-sm font-medium"
          >
            {isFr ? 'Rechercher' : 'Search'}
          </button>
        </div>
        {browsing ? (
          <div className="py-4 text-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin inline" />
          </div>
        ) : browseResults.length > 0 ? (
          <ul className="mt-3 divide-y divide-gray-100">
            {browseResults.map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{c.name}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {[c.region, c.country].filter(Boolean).join(', ') || c.slug}
                  </div>
                </div>
                <button
                  onClick={() => requestJoin(c.id)}
                  disabled={!currentFarm}
                  className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {isFr ? 'Demander à rejoindre' : 'Request to join'}
                </button>
              </li>
            ))}
          </ul>
        ) : browseQuery.trim().length >= 2 ? (
          <div className="text-sm text-gray-500 mt-3">{isFr ? 'Aucun résultat.' : 'No matches.'}</div>
        ) : null}
      </div>

      {createOpen && (
        <CreateCooperativeModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            window.location.hash = `#/cooperatives/${id}`;
          }}
        />
      )}
    </div>
  );
}

export default CooperativesPage;
