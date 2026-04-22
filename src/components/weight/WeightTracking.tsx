import { useEffect, useState } from 'react';
import { Scale, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';;
import { usePermissions } from '../../contexts/PermissionsContext';
import { canPerformAction } from '../../utils/navigationPermissions';
import { Flock } from '../../types/database';
import { WeightCheckInputForm } from './WeightCheckInputForm';
import { WeightCheckResults } from './WeightCheckResults';
import { WeightHistoryView } from './WeightHistoryView';
import { analyzeWeightCheck } from '../../utils/weightAnalysis';
import { getSpeciesTerminology, getSpeciesByType, AnimalSpecies } from '../../utils/speciesModules';
import { WeightProgressWidget } from '../dashboard/WeightProgressWidget';
import { FeedIntakeChart } from './FeedIntakeChart';
import { WaterConsumptionChart } from './WaterConsumptionChart';

interface WeightTrackingProps {
  flock: Flock | null;
}

function calculateRecommendedSampleSize(flockSize: number): number {
  if (flockSize <= 100) return Math.min(flockSize, 10);
  if (flockSize <= 500) return 20;
  if (flockSize <= 1000) return 30;
  if (flockSize <= 5000) return 50;
  return Math.min(Math.ceil(Math.sqrt(flockSize)), 100);
}

function calculateConfidenceLevel(sampleSize: number, flockSize: number): string {
  const ratio = sampleSize / flockSize;
  if (ratio >= 0.1) return 'High';
  if (ratio >= 0.05) return 'Good';
  if (ratio >= 0.02) return 'Moderate';
  return 'Low';
}

export function WeightTracking({ flock: flockProp }: WeightTrackingProps) {
  const { t } = useTranslation();
  const { currentRole, user, currentFarm } = useAuth();
  const { farmPermissions } = usePermissions();
  const canLogWeight = canPerformAction(currentRole, 'create', 'weight', farmPermissions);
  const [availableFlocks, setAvailableFlocks] = useState<Flock[]>([]);
  const [selectedFlock, setSelectedFlock] = useState<Flock | null>(flockProp);
  const [loadingFlocks, setLoadingFlocks] = useState(true);
  const [view, setView] = useState<'input' | 'results' | 'history'>('input');
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const flock = selectedFlock || flockProp;

  useEffect(() => {
    if (user && currentFarm?.id) {
      loadAvailableFlocks();
    }
  }, [user, currentFarm?.id]);

  // Update selected flock when flockProp changes (from dashboard selection)
  useEffect(() => {
    if (flockProp) {
      setSelectedFlock(flockProp);
    }
  }, [flockProp]);

  const loadAvailableFlocks = async () => {
    if (!currentFarm?.id) return;
    
    setLoadingFlocks(true);
    try {
      const { data } = await supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      setAvailableFlocks(data || []);

      // If no flock is selected yet and we have flocks, select the first one
      if (!selectedFlock && data && data.length > 0) {
        // Prefer the flock from dashboard if it exists in the list
        const dashboardFlock = flockProp && data.find(f => f.id === flockProp.id);
        setSelectedFlock(dashboardFlock || data[0]);
      } else if (selectedFlock && data) {
        // Update selected flock if it exists in the new list (in case it was updated)
        const updatedFlock = data.find(f => f.id === selectedFlock.id);
        if (updatedFlock) {
          setSelectedFlock(updatedFlock);
        }
      }
    } catch (error) {
      console.error('Error loading flocks:', error);
    } finally {
      setLoadingFlocks(false);
    }
  };

  const handleCalculate = async (weights: number[], checkDate: string) => {
    if (!flock) return;

    setSaving(true);
    try {
      const { data: previousCheck } = await supabase
        .from('weight_logs')
        .select('average_weight, date')
        .eq('flock_id', flock.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const previousData = previousCheck
        ? { weight: previousCheck.average_weight, date: previousCheck.date }
        : null;

      const results = await analyzeWeightCheck(weights, flock, previousData, supabase);

      const { error } = await supabase.from('weight_logs').insert({
        flock_id: flock.id,
        farm_id: flock.farm_id,
        date: checkDate,
        average_weight: results.average,
        bird_count: flock.current_count,
        sample_size: results.count,
        individual_weights: weights,
        min_weight: results.min,
        max_weight: results.max,
        std_dev: results.stdDev,
        coefficient_variation: results.cv,
        total_estimated_weight: results.totalFlockWeight,
        daily_gain: results.dailyGain,
        market_ready: results.marketStatus?.includes('READY') || false,
        recorded_by: user?.id,
      });

      if (error) throw error;

      setAnalysisResults(results);
      setView('results');
    } catch (error) {
      console.error('Error analyzing weight:', error);
      alert('Error saving weight check. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNewCheck = () => {
    setView('input');
    setAnalysisResults(null);
  };

  const handleViewHistory = () => {
    setView('history');
  };

  const handleBackFromHistory = () => {
    if (analysisResults) {
      setView('results');
    } else {
      setView('input');
    }
  };

  if (view === 'history' && flock) {
    return <WeightHistoryView flock={flock} onBack={handleBackFromHistory} />;
  }

  if (loadingFlocks) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">{t('weight.loading_flocks') || 'Loading flocks...'}</p>
      </div>
    );
  }

  if (availableFlocks.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-12 text-center">
        <Scale className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('weight.no_active_flocks_yet') || 'No Active Flocks'}</h3>
        <p className="text-gray-600 text-sm max-w-sm mx-auto">{t('weight.create_flock_first') || 'Create a flock to start tracking weight checks and growth'}</p>
      </div>
    );
  }

  if (!canLogWeight) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center">
        <Scale className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('weight.access_restricted') || 'Access Restricted'}</h3>
        <p className="text-gray-600">{t('weight.no_permission') || 'You do not have permission to record weight checks'}</p>
      </div>
    );
  }

  if (saving) {
    return (
      <div className="bg-white rounded-3xl p-12 text-center">
        <div className="w-12 h-12 border-2 border-gray-200 border-t-[#3D5F42] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">{t('weight.processing') || 'Processing weight analysis...'}</p>
      </div>
    );
  }

  if (view === 'results' && analysisResults && flock) {
    return (
      <WeightCheckResults
        flock={flock}
        results={analysisResults}
        onNewCheck={handleNewCheck}
        onViewHistory={handleViewHistory}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Flock Selector - Compact */}
      {availableFlocks.length > 0 && (
        <div className="bg-white rounded-xl p-2 shadow-sm">
          <label className="block text-[11px] font-medium text-gray-600 mb-1">
            {t('weight.select_flock', { defaultValue: 'Select Flock' })}
          </label>
          <select
            value={flock?.id || ''}
            onChange={(e) => {
              const selectedFlockId = e.target.value;
              const flock = availableFlocks.find(f => f.id === selectedFlockId);
              if (flock) {
                setSelectedFlock(flock);
                // Reset view when changing flocks
                setView('input');
                setAnalysisResults(null);
              }
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white text-gray-900 text-sm focus:ring-2 focus:ring-[#3D5F42] focus:border-transparent transition-all"
          >
            {availableFlocks.map(f => {
              const species: AnimalSpecies = (f as { species?: string }).species || getSpeciesByType(f.type as any) || 'poultry';
              const terminology = getSpeciesTerminology(species);
              // Parse as local date to avoid timezone off-by-one
              const arrParts = String(f.arrival_date).split(/[-T]/);
              const arrival = arrParts.length >= 3
                ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
                : new Date(f.arrival_date);
              arrival.setHours(0, 0, 0, 0);
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              const diffDays = Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
              const week = Math.max(1, Math.floor(diffDays / 7) + 1);
              
              return (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.type}) - {f.current_count?.toLocaleString()} {terminology.animals.toLowerCase()} - Week {week}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {flock ? (
        <>
          <WeightCheckInputForm flock={flock} onCalculate={handleCalculate} onViewHistory={handleViewHistory} />
          <WeightProgressWidget flockId={flock.id} />
          <FeedIntakeChart flock={flock} />
          <WaterConsumptionChart flock={flock} />
        </>
      ) : (
        <div className="bg-white rounded-2xl p-8 text-center">
          <Scale className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">{t('weight.select_flock_to_begin') || 'Select a flock to begin weight tracking'}</p>
        </div>
      )}
    </div>
  );
}
