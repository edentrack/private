import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Flock } from '../../types/database';
import { WeightCheckInputForm } from './WeightCheckInputForm';
import { WeightCheckResults } from './WeightCheckResults';
import { WeightHistoryView } from './WeightHistoryView';
import { analyzeWeightCheck } from '../../utils/weightAnalysis';
import { getRecommendedSampleSize } from '../../utils/weightCalculations';

interface WeightCheckPageProps {
  flock: Flock;
  onBack: () => void;
}

export function WeightCheckPage({ flock, onBack }: WeightCheckPageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [view, setView] = useState<'input' | 'results' | 'history'>('input');
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const recommendedSampleSize = getRecommendedSampleSize(flock.current_count || 0);

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
        sample_size: results.count,
        individual_weights: weights,
        min_weight: results.min,
        max_weight: results.max,
        std_dev: results.stdDev,
        coefficient_variation: results.cv,
        total_estimated_weight: results.totalFlockWeight,
        daily_gain: results.dailyGain,
        market_ready: results.canSell,
        recorded_by: user?.id,
      });

      if (error) throw error;

      setAnalysisResults(results);
      setView('results');
    } catch (error) {
      console.error('Error saving weight check:', error);
      alert('Failed to save weight check. Please try again.');
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

  if (view === 'history') {
    return <WeightHistoryView flock={flock} onBack={handleBackFromHistory} />;
  }

  if (view === 'results' && analysisResults) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          {t('weight.back_to_flocks')}
        </button>

        <WeightCheckResults
          flock={flock}
          results={analysisResults}
          onNewCheck={handleNewCheck}
          onViewHistory={handleViewHistory}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onBack();
        }}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Flocks
      </button>

      <WeightCheckInputForm
        flock={flock}
        onCalculate={handleCalculate}
        onViewHistory={handleViewHistory}
      />
    </div>
  );
}
