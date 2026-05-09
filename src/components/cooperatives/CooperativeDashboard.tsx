import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  HeartOff,
  DollarSign,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';

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
}

interface MemberRow {
  id: string;
  farm_id: string;
  status: 'pending' | 'active' | 'suspended';
  data_sharing: 'full' | 'aggregate-only';
  joined_at: string | null;
  notes: string | null;
}

interface FarmRow {
  id: string;
  name: string;
  farm_type: string | null;
  location: string | null;
  currency_code: string | null;
}

interface PerFarmStats {
  farm: FarmRow;
  member: MemberRow;
  animalsTotal: number;
  mortalityCount: number;
  revenue: number;
  expenses: number;
  net: number;
  flockCount: number;
}

const RANGE_OPTIONS = [
  { id: '30d', label: 'Last 30 days', labelFr: '30 derniers jours', days: 30 },
  { id: '90d', label: 'Last 90 days', labelFr: '90 derniers jours', days: 90 },
  { id: 'ytd', label: 'Year to date', labelFr: 'Année en cours', days: 0 },
] as const;

type RangeId = (typeof RANGE_OPTIONS)[number]['id'];

function rangeToISO(range: RangeId): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (range === 'ytd') {
    const from = `${now.getUTCFullYear()}-01-01`;
    return { from, to };
  }
  const days = RANGE_OPTIONS.find((r) => r.id === range)!.days;
  const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: fromDate.toISOString().slice(0, 10), to };
}

interface Props {
  cooperativeId: string;
  onBack: () => void;
}

export function CooperativeDashboard({ cooperativeId, onBack }: Props) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [coop, setCoop] = useState<Cooperative | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [farms, setFarms] = useState<Map<string, FarmRow>>(new Map());
  const [stats, setStats] = useState<PerFarmStats[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [range, setRange] = useState<RangeId>('30d');
  const [tab, setTab] = useState<'rollup' | 'members' | 'about'>('rollup');
  const [showPending, setShowPending] = useState(false);

  const loadCoop = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [coopRes, adminRes, membersRes] = await Promise.all([
      supabase.from('cooperatives').select('*').eq('id', cooperativeId).single(),
      supabase
        .from('cooperative_admins')
        .select('role')
        .eq('cooperative_id', cooperativeId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('cooperative_members').select('*').eq('cooperative_id', cooperativeId),
    ]);

    if (coopRes.error) {
      showToast(isFr ? `Échec du chargement : ${coopRes.error.message}` : `Failed to load: ${coopRes.error.message}`, 'error');
      setLoading(false);
      return;
    }
    setCoop(coopRes.data);
    setIsAdmin(!!adminRes.data);
    const mems = (membersRes.data || []) as MemberRow[];
    setMembers(mems);

    const farmIds = mems.map((m) => m.farm_id);
    if (farmIds.length > 0) {
      const { data: farmData } = await supabase
        .from('farms')
        .select('id, name, farm_type, location, currency_code')
        .in('id', farmIds);
      const fm = new Map<string, FarmRow>();
      (farmData || []).forEach((f) => fm.set(f.id, f as FarmRow));
      setFarms(fm);
    } else {
      setFarms(new Map());
    }

    setLoading(false);
  }, [cooperativeId, user, showToast]);

  useEffect(() => {
    loadCoop();
  }, [loadCoop]);

  const loadRollup = useCallback(async () => {
    const activeMembers = members.filter((m) => m.status === 'active' && m.data_sharing === 'full');
    if (activeMembers.length === 0) {
      setStats([]);
      return;
    }
    setStatsLoading(true);
    const { from, to } = rangeToISO(range);
    const farmIds = activeMembers.map((m) => m.farm_id);

    const [flocksRes, mortRes, salesRes, expRes] = await Promise.all([
      supabase
        .from('flocks')
        .select('id, farm_id, current_count, status')
        .in('farm_id', farmIds),
      supabase
        .from('mortality_logs')
        .select('farm_id, count, event_date')
        .in('farm_id', farmIds)
        .gte('event_date', from)
        .lte('event_date', to),
      supabase
        .from('sales_invoices')
        .select('farm_id, total, status, invoice_date')
        .in('farm_id', farmIds)
        .gte('invoice_date', from)
        .lte('invoice_date', to)
        .neq('status', 'cancelled'),
      supabase
        .from('expenses')
        .select('farm_id, amount, expense_date')
        .in('farm_id', farmIds)
        .gte('expense_date', from)
        .lte('expense_date', to),
    ]);

    const sumBy = <T extends { farm_id: string }>(rows: T[] | null, getter: (r: T) => number) => {
      const m = new Map<string, number>();
      (rows || []).forEach((r) => m.set(r.farm_id, (m.get(r.farm_id) ?? 0) + getter(r)));
      return m;
    };

    const animalsByFarm = new Map<string, number>();
    const flockCountByFarm = new Map<string, number>();
    (flocksRes.data || []).forEach((f: { farm_id: string; current_count: number; status: string }) => {
      if (f.status !== 'archived') {
        animalsByFarm.set(f.farm_id, (animalsByFarm.get(f.farm_id) ?? 0) + (f.current_count ?? 0));
        flockCountByFarm.set(f.farm_id, (flockCountByFarm.get(f.farm_id) ?? 0) + 1);
      }
    });

    const mortByFarm = sumBy(mortRes.data as { farm_id: string; count: number }[] | null, (r) => r.count ?? 0);
    const salesByFarm = sumBy(salesRes.data as { farm_id: string; total: number }[] | null, (r) => r.total ?? 0);
    const expByFarm = sumBy(expRes.data as { farm_id: string; amount: number }[] | null, (r) => r.amount ?? 0);

    const result: PerFarmStats[] = activeMembers.map((mem) => {
      const farm = farms.get(mem.farm_id) || {
        id: mem.farm_id,
        name: '(unknown farm)',
        farm_type: null,
        location: null,
        currency_code: null,
      };
      const revenue = salesByFarm.get(mem.farm_id) ?? 0;
      const expenses = expByFarm.get(mem.farm_id) ?? 0;
      return {
        farm,
        member: mem,
        animalsTotal: animalsByFarm.get(mem.farm_id) ?? 0,
        mortalityCount: mortByFarm.get(mem.farm_id) ?? 0,
        revenue,
        expenses,
        net: revenue - expenses,
        flockCount: flockCountByFarm.get(mem.farm_id) ?? 0,
      };
    });
    result.sort((a, b) => b.net - a.net);
    setStats(result);
    setStatsLoading(false);
  }, [members, farms, range]);

  useEffect(() => {
    if (tab === 'rollup' && members.length > 0 && farms.size > 0) {
      loadRollup();
    }
  }, [tab, members, farms, loadRollup]);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, s) => ({
        animals: acc.animals + s.animalsTotal,
        mortality: acc.mortality + s.mortalityCount,
        revenue: acc.revenue + s.revenue,
        expenses: acc.expenses + s.expenses,
        net: acc.net + s.net,
      }),
      { animals: 0, mortality: 0, revenue: 0, expenses: 0, net: 0 }
    );
  }, [stats]);

  const pendingMembers = members.filter((m) => m.status === 'pending');
  const activeMembers = members.filter((m) => m.status === 'active');
  const aggregateOnlyCount = activeMembers.filter((m) => m.data_sharing === 'aggregate-only').length;

  const updateMemberStatus = async (memberId: string, newStatus: 'active' | 'suspended') => {
    const patch: Partial<MemberRow> & { joined_at?: string } = { status: newStatus };
    if (newStatus === 'active') patch.joined_at = new Date().toISOString();
    const { error } = await supabase.from('cooperative_members').update(patch).eq('id', memberId);
    if (error) {
      showToast(isFr ? `Échec : ${error.message}` : `Failed: ${error.message}`, 'error');
      return;
    }
    showToast(newStatus === 'active' ? (isFr ? 'Approuvé' : 'Approved') : (isFr ? 'Suspendu' : 'Suspended'), 'success');
    loadCoop();
  };

  const removeMember = async (memberId: string) => {
    if (!confirm(isFr ? 'Retirer cette ferme de la coopérative ?' : 'Remove this farm from the cooperative?')) return;
    const { error } = await supabase.from('cooperative_members').delete().eq('id', memberId);
    if (error) {
      showToast(isFr ? `Échec : ${error.message}` : `Failed: ${error.message}`, 'error');
      return;
    }
    showToast(isFr ? 'Retiré' : 'Removed', 'success');
    loadCoop();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!coop) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600">{isFr ? 'Coopérative introuvable.' : 'Cooperative not found.'}</p>
        <button onClick={onBack} className="mt-4 text-sm text-emerald-600">
          ← {isFr ? 'Retour' : 'Back'}
        </button>
      </div>
    );
  }

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(v));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-3"
      >
        <ArrowLeft className="w-4 h-4" />
        {isFr ? 'Toutes les coopératives' : 'All cooperatives'}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-emerald-600" />
            {coop.name}
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3" />
                {isFr ? 'Administrateur' : 'Admin'}
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {[coop.region, coop.country].filter(Boolean).join(', ') || coop.slug}
          </p>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-5">
        <div className="flex gap-1">
          {(['rollup', 'members', 'about'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === id
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {id === 'rollup' ? (isFr ? 'Synthèse' : 'Rollup') : id === 'members' ? `${isFr ? 'Membres' : 'Members'} (${activeMembers.length})` : (isFr ? 'À propos' : 'About')}
              {id === 'members' && pendingMembers.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold">
                  {pendingMembers.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rollup' && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                  range === r.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {isFr ? r.labelFr : r.label}
              </button>
            ))}
            {aggregateOnlyCount > 0 && (
              <span className="text-xs text-gray-500 ml-2">
                {isFr
                  ? `(${aggregateOnlyCount} membre${aggregateOnlyCount !== 1 ? 's' : ''} ne partageant que des agrégats - exclu${aggregateOnlyCount !== 1 ? 's' : ''} de la synthèse)`
                  : `(${aggregateOnlyCount} member${aggregateOnlyCount !== 1 ? 's' : ''} sharing aggregates only - excluded from rollup)`}
              </span>
            )}
          </div>

          {statsLoading ? (
            <div className="py-12 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 inline" />
            </div>
          ) : stats.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-600">
              {isFr ? "Aucune ferme membre active avec partage complet des données pour le moment." : 'No active member farms with full data sharing yet.'}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
                <KpiCard label={isFr ? 'Fermes membres' : 'Member farms'} value={`${stats.length}`} icon={<Users className="w-4 h-4" />} />
                <KpiCard
                  label={isFr ? 'Total animaux' : 'Total animals'}
                  value={fmtMoney(totals.animals)}
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <KpiCard
                  label={isFr ? 'Mortalité (période)' : 'Mortality (period)'}
                  value={fmtMoney(totals.mortality)}
                  icon={<HeartOff className="w-4 h-4" />}
                  tone="warn"
                />
                <KpiCard
                  label={isFr ? 'Revenus (période)' : 'Revenue (period)'}
                  value={fmtMoney(totals.revenue)}
                  icon={<DollarSign className="w-4 h-4" />}
                  tone="good"
                />
                <KpiCard
                  label={isFr ? 'Net (période)' : 'Net (period)'}
                  value={fmtMoney(totals.net)}
                  icon={totals.net >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  tone={totals.net >= 0 ? 'good' : 'bad'}
                />
              </div>

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-medium text-gray-900">{isFr ? 'Détail par ferme' : 'Per-farm breakdown'}</h2>
                  <span className="text-xs text-gray-500">{isFr ? 'Trié par résultat net' : 'Sorted by net result'}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">{isFr ? 'Ferme' : 'Farm'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Animaux' : 'Animals'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Troupeaux/Étangs' : 'Flocks/Ponds'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Mortalité' : 'Mortality'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Revenus' : 'Revenue'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Dépenses' : 'Expenses'}</th>
                        <th className="px-4 py-2 text-right">{isFr ? 'Net' : 'Net'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {stats.map((s) => (
                        <tr key={s.farm.id}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{s.farm.name}</div>
                            <div className="text-xs text-gray-500">
                              {[s.farm.farm_type, s.farm.location].filter(Boolean).join(' · ')}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(s.animalsTotal)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{s.flockCount}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-red-600">
                            {fmtMoney(s.mortalityCount)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700">
                            {fmtMoney(s.revenue)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(s.expenses)}</td>
                          <td
                            className={`px-4 py-2 text-right tabular-nums font-medium ${
                              s.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {fmtMoney(s.net)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'members' && (
        <div className="space-y-5">
          {pendingMembers.length > 0 && isAdmin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl">
              <button
                onClick={() => setShowPending((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="font-medium text-amber-900 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {isFr ? `${pendingMembers.length} demande${pendingMembers.length !== 1 ? 's' : ''} en attente` : `${pendingMembers.length} pending request${pendingMembers.length !== 1 ? 's' : ''}`}
                </span>
                {showPending ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showPending && (
                <ul className="divide-y divide-amber-200">
                  {pendingMembers.map((m) => {
                    const f = farms.get(m.farm_id);
                    return (
                      <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-gray-900">{f?.name ?? m.farm_id}</div>
                          <div className="text-xs text-gray-600">
                            {[f?.farm_type, f?.location].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateMemberStatus(m.id, 'active')}
                            className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isFr ? 'Approuver' : 'Approve'}
                          </button>
                          <button
                            onClick={() => removeMember(m.id)}
                            className="text-xs font-medium px-3 py-1.5 rounded-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {isFr ? 'Refuser' : 'Decline'}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="font-medium text-gray-900">{isFr ? 'Membres actifs' : 'Active members'}</h2>
            </div>
            {activeMembers.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500">{isFr ? 'Aucun membre actif pour le moment.' : 'No active members yet.'}</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activeMembers.map((m) => {
                  const f = farms.get(m.farm_id);
                  return (
                    <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900 flex items-center gap-2">
                          {f?.name ?? m.farm_id}
                          {m.data_sharing === 'aggregate-only' && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                              {isFr ? 'Agrégats uniquement' : 'Aggregate-only'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {[f?.farm_type, f?.location].filter(Boolean).join(' · ')}
                          {m.joined_at && (
                            <span className="ml-2">
                              {isFr ? `· rejoint le ${new Date(m.joined_at).toLocaleDateString()}` : `· joined ${new Date(m.joined_at).toLocaleDateString()}`}
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateMemberStatus(m.id, 'suspended')}
                            className="text-xs px-3 py-1.5 rounded-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                          >
                            {isFr ? 'Suspendre' : 'Suspend'}
                          </button>
                          <button
                            onClick={() => removeMember(m.id)}
                            className="text-xs px-3 py-1.5 rounded-md bg-white text-red-600 border border-red-200 hover:bg-red-50"
                          >
                            {isFr ? 'Retirer' : 'Remove'}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'about' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3 text-sm text-gray-700">
          {coop.description ? (
            <p className="whitespace-pre-wrap">{coop.description}</p>
          ) : (
            <p className="text-gray-500 italic">{isFr ? 'Aucune description.' : 'No description.'}</p>
          )}
          <dl className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-gray-100">
            {coop.contact_email && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">{isFr ? 'Email de contact' : 'Contact email'}</dt>
                <dd>
                  <a href={`mailto:${coop.contact_email}`} className="text-emerald-600 hover:underline">
                    {coop.contact_email}
                  </a>
                </dd>
              </div>
            )}
            {coop.contact_phone && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">{isFr ? 'Téléphone de contact' : 'Contact phone'}</dt>
                <dd>{coop.contact_phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">{isFr ? 'Slug URL' : 'URL slug'}</dt>
              <dd className="font-mono text-gray-900">{coop.slug}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-gray-500">{isFr ? 'Région' : 'Region'}</dt>
              <dd>{[coop.region, coop.country].filter(Boolean).join(', ') || ' - '}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
      ? 'text-amber-700'
      : tone === 'bad'
      ? 'text-red-700'
      : 'text-gray-900';
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <div className="text-xs text-gray-500 flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

export default CooperativeDashboard;
