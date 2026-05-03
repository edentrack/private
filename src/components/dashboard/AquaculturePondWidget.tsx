import { useEffect, useState } from 'react';
import { Fish, Droplets, Calendar, TrendingUp, Scale, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import type { Flock } from '../../types/database';

interface AquaculturePondWidgetProps {
  pond: Flock;
  onNavigate: (view: string) => void;
}

interface PondStats {
  lastWaterQuality: { logged_at: string; temperature_c?: number | null; dissolved_oxygen?: number | null } | null;
  totalHarvested: number;
  latestStocking: { stocked_at: string; fingerling_count: number; species: string } | null;
  daysStocked: number;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

export function AquaculturePondWidget({ pond, onNavigate }: AquaculturePondWidgetProps) {
  const { currentFarm } = useAuth();
  const [stats, setStats] = useState<PondStats>({
    lastWaterQuality: null,
    totalHarvested: 0,
    latestStocking: null,
    daysStocked: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentFarm?.id || !pond?.id) return;
    const load = async () => {
      setLoading(true);
      const [wqResult, harvestResult, stockResult] = await Promise.all([
        supabase
          .from('water_quality_logs')
          .select('logged_at, temperature_c, dissolved_oxygen')
          .eq('flock_id', pond.id)
          .order('logged_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('harvest_records')
          .select('total_weight_kg')
          .eq('flock_id', pond.id),
        supabase
          .from('stocking_events')
          .select('stocked_at, fingerling_count, species')
          .eq('flock_id', pond.id)
          .order('stocked_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const totalHarvested = (harvestResult.data || []).reduce((sum, r) => sum + (r.total_weight_kg || 0), 0);
      const daysStocked = pond.arrival_date ? daysAgo(pond.arrival_date) : 0;

      setStats({
        lastWaterQuality: wqResult.data ?? null,
        totalHarvested,
        latestStocking: stockResult.data ?? null,
        daysStocked,
      });
      setLoading(false);
    };
    load();
  }, [currentFarm?.id, pond?.id]);

  const stockingDensity = pond.stocking_density
    ? `${pond.stocking_density.toFixed(1)} fish/m²`
    : null;

  const pondSizeLabel = (pond as any).pond_size_sqm
    ? `${(pond as any).pond_size_sqm} m²`
    : null;

  // Estimate weeks to harvest (catfish ~24 weeks, tilapia ~20 weeks from 4-6g fingerlings)
  const weeksToHarvest = (() => {
    const targetWeeks = pond.type === 'Tilapia' ? 20 : 24;
    const weeksStocked = Math.floor(stats.daysStocked / 7);
    return Math.max(0, targetWeeks - weeksStocked);
  })();

  const doStatus = stats.lastWaterQuality?.dissolved_oxygen;
  const doColor = doStatus == null ? 'text-gray-400' : doStatus >= 5 ? 'text-emerald-600' : doStatus >= 3 ? 'text-amber-500' : 'text-red-500';
  const doLabel = doStatus == null ? 'Not logged' : doStatus >= 5 ? 'Good' : doStatus >= 3 ? 'Low' : 'Critical';

  return (
    <div className="section-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
            <Fish className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{pond.name}</p>
            <p className="text-xs text-gray-500">{pond.type} · {pond.current_count?.toLocaleString()} fish</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('flocks')}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          Details <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-medium text-blue-700 uppercase tracking-wide">Days stocked</span>
          </div>
          <p className="text-xl font-bold text-blue-900">{stats.daysStocked}</p>
          <p className="text-[10px] text-blue-600 mt-0.5">{Math.floor(stats.daysStocked / 7)} weeks</p>
        </div>

        <div className="bg-emerald-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Est. harvest</span>
          </div>
          {weeksToHarvest > 0 ? (
            <>
              <p className="text-xl font-bold text-emerald-900">{weeksToHarvest}w</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">to market size</p>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-emerald-900">Ready</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">harvest now</p>
            </>
          )}
        </div>

        <div className="bg-cyan-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Droplets className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-[10px] font-medium text-cyan-700 uppercase tracking-wide">Dissolved O₂</span>
          </div>
          <p className={`text-xl font-bold ${doColor}`}>
            {doStatus != null ? `${doStatus} mg/L` : '—'}
          </p>
          <p className={`text-[10px] mt-0.5 ${doColor}`}>{doLabel}</p>
        </div>

        <div className="bg-amber-50 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Scale className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">Harvested</span>
          </div>
          <p className="text-xl font-bold text-amber-900">
            {stats.totalHarvested > 0 ? `${stats.totalHarvested.toFixed(1)} kg` : '0 kg'}
          </p>
          <p className="text-[10px] text-amber-600 mt-0.5">total to date</p>
        </div>
      </div>

      {/* Pond info row */}
      {(pondSizeLabel || stockingDensity) && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          {pondSizeLabel && (
            <span className="text-xs text-gray-500">Pond: <span className="font-medium text-gray-700">{pondSizeLabel}</span></span>
          )}
          {stockingDensity && (
            <span className="text-xs text-gray-500">Density: <span className="font-medium text-gray-700">{stockingDensity}</span></span>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onNavigate('harvest')}
          className="flex-1 py-2 text-xs font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          Log Harvest
        </button>
        <button
          onClick={() => onNavigate('water-quality')}
          className="flex-1 py-2 text-xs font-medium border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Water Quality
        </button>
      </div>
    </div>
  );
}
