import { useState } from 'react';
import { Calendar, Plus, Scale, AlertCircle, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Flock } from '../../types/database';

interface WeightCheckInputFormProps {
  flock: Flock;
  onCalculate: (weights: number[], date: string) => void;
  onViewHistory?: () => void;
}

function getRecommendedSampleSize(totalBirds: number): number {
  if (totalBirds <= 100) return 10;
  if (totalBirds <= 500) return 15;
  if (totalBirds <= 1000) return 20;
  if (totalBirds <= 2000) return 30;
  if (totalBirds <= 5000) return 40;
  return 50;
}

function getFlockAge(arrivalDate: string) {
  // Parse as local date to avoid timezone off-by-one
  const arrParts = String(arrivalDate).split(/[-T]/);
  const arrival = arrParts.length >= 3
    ? new Date(parseInt(arrParts[0], 10), parseInt(arrParts[1], 10) - 1, parseInt(arrParts[2], 10))
    : new Date(arrivalDate);
  arrival.setHours(0, 0, 0, 0);

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((now.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
  const weeks = Math.max(1, Math.floor(diffDays / 7) + 1);
  const days = diffDays % 7;
  return { weeks, days };
}

export function WeightCheckInputForm({ flock, onCalculate, onViewHistory }: WeightCheckInputFormProps) {
  const { t } = useTranslation();
  const recommendedSize = getRecommendedSampleSize(flock.current_count || 0);
  const [weights, setWeights] = useState<string[]>(Array(recommendedSize).fill(''));
  const [weighDate, setWeighDate] = useState(new Date().toISOString().split('T')[0]);

  const enteredCount = weights.filter(w => w && parseFloat(w) > 0).length;
  const canCalculate = enteredCount >= 10;

  const handleWeightChange = (index: number, value: string) => {
    const newWeights = [...weights];
    newWeights[index] = value;
    setWeights(newWeights);
  };

  const addMoreFields = () => {
    if (weights.length < 100) {
      setWeights([...weights, ...Array(10).fill('')]);
    }
  };

  const handleCalculate = () => {
    const validWeights = weights
      .filter(w => w && parseFloat(w) > 0)
      .map(w => parseFloat(w));

    if (validWeights.length >= 10) {
      onCalculate(validWeights, weighDate);
    }
  };

  return (
    <div className="bg-white rounded-xl p-2.5 space-y-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-gray-900 mb-0.5">
            {t('weight.weight_check_flock', { flock: flock.name })}
          </h2>
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
            <div className="flex items-center gap-1">
              <Scale className="w-3 h-3" />
              <span>{flock.current_count?.toLocaleString()} {t('weight.birds_alive')}</span>
            </div>
            <div>
              {t('weight.week')} {getFlockAge(flock.arrival_date).weeks}
              {getFlockAge(flock.arrival_date).days > 0 && <span className="text-gray-400 ml-0.5">{getFlockAge(flock.arrival_date).days}d</span>}
            </div>
            <div className="text-xs">{new Date(flock.arrival_date).toLocaleDateString()}</div>
          </div>
        </div>
        {onViewHistory && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onViewHistory();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 text-gray-900 rounded-lg text-xs font-medium hover:bg-[#f5f0e8] transition-all"
          >
            <History className="w-3.5 h-3.5" />
            {t('weight.view_history')}
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {t('weight.weigh_date')}
        </label>
        <input
          type="date"
          value={weighDate}
          onChange={(e) => setWeighDate(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          max={new Date().toISOString().split('T')[0]}
          className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 transition-all text-xs"
        />
        {new Date(weighDate) < new Date() && (
          <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" />
            {t('weight.backdating_note') || 'Backdating: This record will be added to historical data'}
          </p>
        )}
        {new Date(weighDate) < new Date(flock.arrival_date) && (
          <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5" />
            {t('weight.pre_app_record_note') || 'Pre-app record: This date is before flock arrival. Record will appear in graph.'}
          </p>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
        <div className="flex items-start gap-2">
          <Scale className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-gray-900">
              {t('weight.recommended_sample_size', { count: recommendedSize })}
            </p>
            <p className="text-[10px] text-gray-600 mt-0.5">
              {t('weight.based_on_flock_size', { count: flock.current_count ?? 0 })}
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">
          {t('weight.enter_individual_weights')}
        </h3>

        <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 mb-2">
          {weights.map((weight, index) => (
            <div key={index}>
              <label className="block text-[10px] text-gray-500 mb-0.5">
                {t('weight.weight', { number: index + 1 })}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="10"
                value={weight}
                onChange={(e) => handleWeightChange(index, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                placeholder="0.00"
                className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-400 transition-all text-sm placeholder-gray-400"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between mb-2">
          <div className="text-center flex-1">
            <p className="text-sm text-gray-900">
              {t('weight.entered')}: <span className="font-bold text-lg text-gray-900">{enteredCount}</span> / {recommendedSize} {t('dashboard.birds')}
            </p>
            {enteredCount < 10 && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1 justify-center mt-0.5">
                <AlertCircle className="w-3 h-3" />
                {t('weight.need_at_least_10')}
              </p>
            )}
            {enteredCount >= 10 && enteredCount < recommendedSize && (
              <p className="text-[10px] text-blue-600 mt-0.5">
                {t('weight.good_add_more')}
              </p>
            )}
            {enteredCount >= recommendedSize && (
              <p className="text-[10px] text-green-600 mt-0.5">
                {t('weight.excellent_sample_size')}
              </p>
            )}
          </div>
        </div>

        {weights.length < 100 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addMoreFields();
            }}
            className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            {t('weight.add_more_fields')}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleCalculate();
        }}
        disabled={!canCalculate}
        className={`w-full py-2.5 rounded-lg font-semibold text-sm transition-all ${
          canCalculate
            ? 'bg-white border border-gray-200 text-gray-900 hover:bg-[#f5f0e8]'
            : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {canCalculate
          ? t('weight.calculate_results')
          : t('weight.enter_at_least_10', { current: enteredCount })}
      </button>
    </div>
  );
}
