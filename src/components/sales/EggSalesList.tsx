import { useEffect, useState } from 'react';
import { Calendar, Egg, User, Edit3, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { shouldHideFinancialData } from '../../utils/navigationPermissions';
import { formatEggs } from '../../utils/eggFormatting';
import { EditEggSaleModal, type EggSaleRecord } from '../eggs/EditEggSaleModal';

interface EggSalesListProps {
  refreshTrigger?: number;
}

export function EggSalesList({ refreshTrigger }: EggSalesListProps) {
  const { currentFarm, currentRole, profile } = useAuth();
  const [sales, setSales] = useState<EggSaleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSale, setEditingSale] = useState<EggSaleRecord | null>(null);
  const [eggsPerTray, setEggsPerTray] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<'month' | 'week' | 'day'>('month');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [customerSearch, setCustomerSearch] = useState('');
  const hideFinancials = shouldHideFinancialData(currentRole);
  const currency = profile?.currency_preference || currentFarm?.currency_code || 'XAF';

  useEffect(() => {
    if (currentFarm?.id) {
      loadSales();
      loadFarmTraySize();
    }
  }, [currentFarm?.id, refreshTrigger]);

  useEffect(() => {
    if (!sales.length) return;
    const firstDate = (sales[0]?.sale_date || sales[0]?.sold_on || '').toString().slice(0, 10);
    if (!firstDate) return;
    setExpandedGroups(new Set([buildGroupKey(firstDate, groupBy)]));
  }, [groupBy]);

  const loadFarmTraySize = async () => {
    if (!currentFarm?.id) return;
    try {
      const { data, error } = await supabase
        .from('farms')
        .select('eggs_per_tray')
        .eq('id', currentFarm.id)
        .single();
      if (error) throw error;
      setEggsPerTray(Number(data?.eggs_per_tray || 0) || null);
    } catch (error) {
      console.error('Error loading eggs_per_tray:', error);
      setEggsPerTray(null);
    }
  };

  const loadSales = async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    console.log('[EggSalesList] loadSales for farm_id:', currentFarm.id);
    try {
      let data: any[] | null = null;
      let error: any = null;

      // Newer schema
      ({ data, error } = await supabase
        .from('egg_sales')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .order('sale_date', { ascending: false })
        .limit(200));
      console.log('[EggSalesList] query1 rows:', data?.length, 'error:', error?.message);

      if (error) {
        // Legacy schema fallback (older installs use `date`)
        ({ data, error } = await supabase
          .from('egg_sales')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('date', { ascending: false })
          .limit(200));
      }

      if (error) {
        // Last-resort fallback to created_at
        ({ data, error } = await supabase
          .from('egg_sales')
          .select('*')
          .eq('farm_id', currentFarm.id)
          .order('created_at', { ascending: false })
          .limit(200));
      }

      if (error) throw error;
      console.log('[EggSalesList] final rows count:', data?.length, 'first row id:', data?.[0]?.id);

      const rows = ((data || []) as any[]).map((row) => {
        const saleDate = row.sale_date || row.sold_on || row.date || null;
        const traysValue = Number(row.trays ?? row.trays_sold ?? 0);
        const totalEggsValue = Number(row.total_eggs ?? 0);
        const inferredTotalEggs = totalEggsValue > 0 ? totalEggsValue : traysValue * (eggsPerTray || 30);
        const totalAmountValue =
          Number(row.total_amount ?? 0) > 0
            ? Number(row.total_amount)
            : traysValue * Number(row.unit_price ?? 0);

        return {
          ...row,
          sale_date: saleDate,
          sold_on: row.sold_on || row.date || saleDate,
          trays: Number(row.trays ?? row.trays_sold ?? 0),
          customer_name: row.customer_name || row.buyer_name || null,
          total_eggs: inferredTotalEggs,
          total_amount: totalAmountValue,
        } as EggSaleRecord;
      });

      setSales(rows);
      // Expand the newest bucket by default for quick visibility.
      const firstDate = (rows[0]?.sale_date || rows[0]?.sold_on || '').toString().slice(0, 10);
      if (firstDate) {
        setExpandedGroups(new Set([buildGroupKey(firstDate, groupBy)]));
      }
    } catch (error) {
      console.error('Error loading egg sales:', error);
    } finally {
      setLoading(false);
    }
  };

  function getWeekStartISO(dateISO: string): string {
    const d = new Date(`${dateISO}T12:00:00`);
    const day = d.getDay(); // 0 Sun ... 6 Sat
    const diffToMonday = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diffToMonday);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayNum}`;
  }

  function buildGroupKey(dateISO: string, mode: 'month' | 'week' | 'day'): string {
    if (!dateISO) return 'unknown';
    if (mode === 'day') return dateISO;
    if (mode === 'month') return dateISO.slice(0, 7);
    return getWeekStartISO(dateISO);
  }

  function groupLabel(groupKey: string, mode: 'month' | 'week' | 'day'): string {
    if (groupKey === 'unknown') return 'Unknown Date';
    if (mode === 'month') {
      const d = new Date(`${groupKey}-01T12:00:00`);
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    if (mode === 'week') {
      const start = new Date(`${groupKey}T12:00:00`);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    }
    return new Date(`${groupKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-neon-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!sales.length) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Egg className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Egg Sales Yet</h3>
        <p className="text-gray-500">Record your first egg sale to start tracking history</p>
      </div>
    );
  }

  const totalEggsSold = sales.reduce((sum, s) => sum + Number(s.total_eggs ?? 0), 0);
  const totalRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0);
  const eggsPerTraySafe = eggsPerTray && eggsPerTray > 0 ? eggsPerTray : 30;

  const groupedSales = (() => {
    const groups: Record<string, EggSaleRecord[]> = {};
    sales.forEach((sale) => {
      const dateISO = (sale.sale_date || sale.sold_on || '').toString().slice(0, 10);
      const key = buildGroupKey(dateISO, groupBy);
      if (!groups[key]) groups[key] = [];
      groups[key].push(sale);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  })();

  const customerSummaries = (() => {
    const map: Record<string, {
      name: string;
      totalTrays: number;
      totalAmount: number;
      purchases: number;
      pricePointTrays: Record<string, number>;
    }> = {};

    sales.forEach((sale) => {
      const rawName = (sale.customer_name || '').trim();
      const name = rawName || 'Unknown';
      const key = name.toLowerCase();
      const totalEggs = Number(sale.total_eggs ?? 0);
      const trays = totalEggs / eggsPerTraySafe;
      const amount = Number(sale.total_amount ?? 0);
      const pricePerTray = trays > 0 ? amount / trays : 0;
      const priceKey = pricePerTray > 0 ? Math.round(pricePerTray).toString() : '0';

      if (!map[key]) {
        map[key] = {
          name,
          totalTrays: 0,
          totalAmount: 0,
          purchases: 0,
          pricePointTrays: {},
        };
      }
      map[key].totalTrays += trays;
      map[key].totalAmount += amount;
      map[key].purchases += 1;
      map[key].pricePointTrays[priceKey] = (map[key].pricePointTrays[priceKey] || 0) + trays;
    });

    const q = customerSearch.trim().toLowerCase();
    return Object.values(map)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => b.totalTrays - a.totalTrays);
  })();

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-6">
        <div className="p-3 sm:p-4 bg-amber-50 rounded-xl">
          <p className="text-xs sm:text-sm text-amber-700 mb-1">Total Eggs Sold</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatEggs(totalEggsSold, eggsPerTray)}</p>
          <p className="text-xs text-gray-500 mt-0.5">{totalEggsSold.toLocaleString()} total eggs</p>
        </div>
        {!hideFinancials && (
          <div className="p-3 sm:p-4 bg-green-50 rounded-xl">
            <p className="text-xs sm:text-sm text-green-700 mb-1">Total Revenue</p>
            <p className="text-xl sm:text-2xl font-bold text-gray-900 break-words">
              {totalRevenue.toLocaleString()} {currency}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg p-1.5 sm:p-2 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1.5">
          <h3 className="text-[11px] sm:text-xs font-semibold text-gray-900">Customer Purchase Ranking</h3>
          <div className="relative w-full sm:w-56">
            <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Search customer name..."
              className="w-full pl-6 pr-2 py-1 text-[11px] border border-gray-200 rounded-md focus:ring-1 focus:ring-amber-100 focus:border-amber-300"
            />
          </div>
        </div>
        <div className="space-y-1 max-h-16 overflow-y-auto">
          {customerSummaries.map((c) => {
            const priceBreakdown = Object.entries(c.pricePointTrays)
              .filter(([price]) => price !== '0')
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([price, trays]) => `${Math.round(trays).toLocaleString()} trays @ ${Number(price).toLocaleString()} ${currency}`)
              .join(', ');
            return (
              <div key={c.name} className="p-1 rounded-md bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold text-gray-900 truncate">{c.name}</div>
                  <div className="text-[11px] font-semibold text-amber-700">{Math.round(c.totalTrays).toLocaleString()} trays</div>
                </div>
                <div className="text-[10px] text-gray-600 mt-0.5">
                  Purchases: {c.purchases}
                  {!hideFinancials && (
                    <span> • Total: {c.totalAmount.toLocaleString()} {currency}</span>
                  )}
                </div>
                {!hideFinancials && priceBreakdown && (
                  <div className="text-[10px] text-gray-500 mt-0.5 truncate">{priceBreakdown}</div>
                )}
              </div>
            );
          })}
          {customerSummaries.length === 0 && (
            <div className="text-[11px] text-gray-500 py-1 text-center">No customer matches found.</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700">Group sales by:</span>
        {(['month', 'week', 'day'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setGroupBy(mode)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              groupBy === mode ? 'bg-amber-200 text-gray-900' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {groupedSales.map(([groupKey, records]) => {
          const expanded = expandedGroups.has(groupKey);
          const groupEggs = records.reduce((sum, s) => sum + Number(s.total_eggs ?? 0), 0);
          const groupRevenue = records.reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0);
          const groupTrays = groupEggs / eggsPerTraySafe;
          return (
            <div key={groupKey} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className="w-full px-3 sm:px-4 py-2.5 bg-gray-50 hover:bg-gray-100 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <span className="text-sm font-semibold text-gray-900">{groupLabel(groupKey, groupBy)}</span>
                  <span className="text-xs text-gray-500">({records.length} sales)</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-700">{Math.round(groupTrays).toLocaleString()} trays</div>
                  {!hideFinancials && (
                    <div className="text-xs font-semibold text-green-700">{groupRevenue.toLocaleString()} {currency}</div>
                  )}
                </div>
              </button>

              {expanded && (
                <div className="p-2 sm:p-3 space-y-2">
                  {records.map((sale) => {
                    const saleDate = (sale.sale_date || sale.sold_on || '').toString().slice(0, 10);
                    const small = Number(sale.small_eggs_sold ?? 0);
                    const medium = Number(sale.medium_eggs_sold ?? 0);
                    const large = Number(sale.large_eggs_sold ?? 0);
                    const jumbo = Number(sale.jumbo_eggs_sold ?? 0);
                    const totalEggs = Number(sale.total_eggs ?? small + medium + large + jumbo);
                    const totalAmount = Number(sale.total_amount ?? 0);
                    const equivalentTrays = totalEggs / eggsPerTraySafe;
                    const pricePerTray = equivalentTrays > 0 ? totalAmount / equivalentTrays : 0;
                    return (
                      <div
                        key={sale.id}
                        className="border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 text-sm sm:text-base font-semibold text-gray-900">
                              <Egg className="w-4 h-4 text-amber-600" />
                              {formatEggs(totalEggs, eggsPerTray)}
                            </span>
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-full">
                              S {small} | M {medium} | L {large} | J {jumbo}
                            </span>
                          </div>
                          <div className="text-xs sm:text-sm text-gray-500 flex items-center gap-3 flex-wrap mt-1">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                              {saleDate ? new Date(saleDate + 'T12:00:00').toLocaleDateString() : 'N/A'}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3 h-3 sm:w-4 sm:h-4" />
                              {sale.customer_name?.trim() || 'Unknown'}
                            </span>
                          </div>
                          {sale.notes && <p className="text-xs text-gray-600 mt-1 truncate">{sale.notes}</p>}
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                          {!hideFinancials && (
                            <div className="text-right">
                              <div className="font-semibold text-green-600 text-sm sm:text-base">
                                {totalAmount.toLocaleString()} {currency}
                              </div>
                              {equivalentTrays > 0 && (
                                <div className="text-[11px] sm:text-xs text-gray-500">
                                  {Math.round(pricePerTray).toLocaleString()} {currency}/tray
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingSale(sale)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <Edit3 className="w-4 h-4" />
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingSale && (
        <EditEggSaleModal
          record={editingSale}
          currencyCode={currentFarm?.currency_code || 'XAF'}
          onClose={() => setEditingSale(null)}
          onSuccess={() => {
            setEditingSale(null);
            loadSales();
          }}
        />
      )}
    </div>
  );
}
