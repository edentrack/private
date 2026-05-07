import { useState, useEffect } from 'react';
import { FileText, Download, Share2, Calendar, TrendingUp, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { shareViaWhatsApp } from '../../utils/whatsappShare';
import { formatEggsCompact } from '../../utils/eggFormatting';
import { todayLocal } from '../../utils/dateUtils';

interface EggCollection {
  id: string;
  collection_date: string;
  small_eggs: number;
  medium_eggs: number;
  large_eggs: number;
  jumbo_eggs: number;
  damaged_eggs: number;
  total_eggs: number;
  notes: string | null;
  flock_name: string | null;
}

interface EggProductionReportsProps {
  flockId: string | null;
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export function EggProductionReports({ flockId }: EggProductionReportsProps) {
  const { currentFarm } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(todayLocal());
  const [collections, setCollections] = useState<EggCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [eggsPerTray, setEggsPerTray] = useState(30);

  useEffect(() => {
    loadFarmSettings();
    loadCollections();
  }, [currentFarm?.id, flockId, startDate, endDate]);

  async function loadFarmSettings() {
    if (!currentFarm?.id) return;
    const { data } = await supabase
      .from('farms')
      .select('eggs_per_tray')
      .eq('id', currentFarm.id)
      .maybeSingle();
    if (data?.eggs_per_tray) {
      setEggsPerTray(data.eggs_per_tray);
    }
  }

  async function loadCollections() {
    if (!currentFarm?.id) return;

    setLoading(true);
    try {
      let query = supabase
        .from('egg_collections')
        .select(`
          id,
          collection_date,
          small_eggs,
          medium_eggs,
          large_eggs,
          jumbo_eggs,
          damaged_eggs,
          total_eggs,
          notes,
          flocks:flock_id (name)
        `)
        .eq('farm_id', currentFarm.id)
        .gte('collection_date', startDate)
        .lte('collection_date', endDate)
        .order('collection_date', { ascending: false });

      if (flockId) {
        query = query.eq('flock_id', flockId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        ...item,
        flock_name: item.flocks?.name || 'All Flocks',
      }));

      setCollections(formatted);
    } catch (error) {
      console.error('Error loading collections:', error);
    } finally {
      setLoading(false);
    }
  }

  function setPeriodFilter(newPeriod: ReportPeriod) {
    setPeriod(newPeriod);
    const end = new Date();
    const start = new Date();

    if (newPeriod === 'daily') {
      start.setDate(end.getDate() - 1);
    } else if (newPeriod === 'weekly') {
      start.setDate(end.getDate() - 7);
    } else if (newPeriod === 'monthly') {
      start.setMonth(end.getMonth() - 1);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }

  function calculateSummary() {
    return collections.reduce(
      (acc, col) => ({
        totalEggs: acc.totalEggs + col.total_eggs,
        smallEggs: acc.smallEggs + col.small_eggs,
        mediumEggs: acc.mediumEggs + col.medium_eggs,
        largeEggs: acc.largeEggs + col.large_eggs,
        jumboEggs: acc.jumboEggs + col.jumbo_eggs,
        damagedEggs: acc.damagedEggs + col.damaged_eggs,
      }),
      {
        totalEggs: 0,
        smallEggs: 0,
        mediumEggs: 0,
        largeEggs: 0,
        jumboEggs: 0,
        damagedEggs: 0,
      }
    );
  }

  function exportToCSV() {
    const summary = calculateSummary();
    const farmName = currentFarm?.name || 'Farm';
    const fileName = `${farmName}_Egg_Production_${startDate}_to_${endDate}.csv`;

    const headers = [
      'Date',
      'Flock',
      'Small',
      'Medium',
      'Large',
      'Jumbo',
      'Damaged',
      'Total',
      'Notes',
    ];

    const rows = collections.map((col) => [
      col.collection_date,
      col.flock_name || '',
      col.small_eggs,
      col.medium_eggs,
      col.large_eggs,
      col.jumbo_eggs,
      col.damaged_eggs,
      col.total_eggs,
      col.notes || '',
    ]);

    rows.push([]);
    rows.push(['SUMMARY']);
    rows.push(['Total Eggs Collected', '', '', '', '', '', '', summary.totalEggs]);
    rows.push(['Small Eggs', '', summary.smallEggs]);
    rows.push(['Medium Eggs', '', summary.mediumEggs]);
    rows.push(['Large Eggs', '', summary.largeEggs]);
    rows.push(['Jumbo Eggs', '', summary.jumboEggs]);
    rows.push(['Damaged Eggs', '', summary.damagedEggs]);
    const distinctDays = new Set(collections.map(c => c.collection_date)).size;
    rows.push(['Average per Day', '', '', '', '', '', '', distinctDays > 0 ? Math.round(summary.totalEggs / distinctDays) : 0]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
  }

  function shareReport() {
    const summary = calculateSummary();
    const farmName = currentFarm?.name || 'Farm';
    const distinctDays = new Set(collections.map(c => c.collection_date)).size;
    const avgPerDay = distinctDays > 0 ? Math.round(summary.totalEggs / distinctDays) : 0;

    const message = `*${farmName} - Egg Production Report*\n\n` +
      `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}\n\n` +
      `*Summary:*\n` +
      `Total Eggs: ${summary.totalEggs.toLocaleString()}\n` +
      `- Small: ${summary.smallEggs.toLocaleString()}\n` +
      `- Medium: ${summary.mediumEggs.toLocaleString()}\n` +
      `- Large: ${summary.largeEggs.toLocaleString()}\n` +
      `- Jumbo: ${summary.jumboEggs.toLocaleString()}\n` +
      `- Damaged: ${summary.damagedEggs.toLocaleString()}\n\n` +
      `Average per Day: ${avgPerDay.toLocaleString()} eggs\n` +
      `Collections: ${collections.length}`;

    shareViaWhatsApp(message);
  }

  const summary = calculateSummary();
  const distinctDays = new Set(collections.map(c => c.collection_date)).size;
  const avgPerDay = distinctDays > 0 ? Math.round(summary.totalEggs / distinctDays) : 0;

  if (loading && collections.length === 0) {
    return (
      <div className="bg-white rounded-3xl p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 rounded-xl">
            <FileText className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Production Reports</h3>
            <p className="text-sm text-gray-600">View and export egg collection history</p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Filters
          <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as ReportPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodFilter(p)}
                className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {(() => {
        // Audit fix: cards used to say "Damaged" with no period context, so
        // users didn't know if "31 eggs damaged" was today, this week, or
        // all-time. Compute a clear period label and append it to every
        // headline so the meaning is unambiguous.
        const periodLabel = period === 'daily' ? 'today'
          : period === 'weekly' ? 'this week'
          : period === 'monthly' ? 'this month'
          : 'in selected range';
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
                <p className="text-[11px] font-medium text-green-900 truncate">Collected {periodLabel}</p>
              </div>
              <p className="text-xl font-bold text-green-900">{summary.totalEggs.toLocaleString()}</p>
              <p className="text-[10px] text-green-700 mt-0.5">eggs</p>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <p className="text-[11px] font-medium text-blue-900 truncate">Avg per day</p>
              </div>
              <p className="text-xl font-bold text-blue-900">{avgPerDay.toLocaleString()}</p>
              <p className="text-[10px] text-blue-700 mt-0.5">eggs/day</p>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-[11px] font-medium text-amber-900 truncate">Collections {periodLabel}</p>
              </div>
              <p className="text-xl font-bold text-amber-900">{collections.length}</p>
              <p className="text-[10px] text-amber-700 mt-0.5">records</p>
            </div>

            <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-[11px] font-medium text-red-900 truncate">Damaged {periodLabel}</p>
              </div>
              <p className="text-xl font-bold text-red-900">{summary.damagedEggs.toLocaleString()}</p>
              <p className="text-[10px] text-red-700 mt-0.5">eggs</p>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-2">
        <button
          onClick={exportToCSV}
          disabled={collections.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
        <button
          onClick={shareReport}
          disabled={collections.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Share2 className="w-4 h-4" />
          Share Report
        </button>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-semibold text-gray-900 mb-3">Detailed Records</h4>

        {collections.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No collections found for the selected period
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {collections.map((col) => (
              <div
                key={col.id}
                className="bg-gray-50 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors"
              >
                {/* Audit fix: detailed record rows used to be ~p-4 padding +
                    text-2xl headline + repeated size grid. On mobile this
                    eats the whole screen. Compact to single-row layout
                    with a horizontal size strip below. */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {new Date(col.collection_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-[11px] text-gray-500 truncate">{col.flock_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-semibold text-gray-900">{col.total_eggs.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-500">{formatEggsCompact(col.total_eggs, eggsPerTray)}</p>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-600 flex-wrap">
                  <span>S {col.small_eggs}</span>
                  <span className="text-gray-300">·</span>
                  <span>M {col.medium_eggs}</span>
                  <span className="text-gray-300">·</span>
                  <span>L {col.large_eggs}</span>
                  <span className="text-gray-300">·</span>
                  <span>J {col.jumbo_eggs}</span>
                  {col.damaged_eggs > 0 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-red-700">Dmg {col.damaged_eggs}</span>
                    </>
                  )}
                </div>

                {col.notes && (
                  <p className="mt-1 text-[11px] text-gray-600 italic line-clamp-1">
                    {col.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
