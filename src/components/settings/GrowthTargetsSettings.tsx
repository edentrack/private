import { useState, useEffect } from 'react';
import { TrendingUp, Save, RotateCcw, Edit2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface GrowthTarget {
  weight: number;
  description: string;
}

interface GrowthTargets {
  [week: string]: GrowthTarget;
}

const DEFAULT_BROILER_TARGETS: GrowthTargets = {
  "1": { weight: 0.15, description: "Chick starter phase" },
  "2": { weight: 0.35, description: "Early growth" },
  "3": { weight: 0.60, description: "Rapid growth begins" },
  "4": { weight: 1.00, description: "Switch to grower feed" },
  "5": { weight: 1.50, description: "Pre-market growth" },
  "6": { weight: 2.00, description: "Near market weight" },
  "7": { weight: 2.50, description: "Market ready - optimal" },
  "8": { weight: 2.80, description: "Market ready - maximum" }
};

const DEFAULT_LAYER_TARGETS: GrowthTargets = {
  "1": { weight: 0.15, description: "Chick starter phase" },
  "2": { weight: 0.35, description: "Early growth" },
  "4": { weight: 0.50, description: "Grower phase begins" },
  "8": { weight: 0.90, description: "Mid grower phase" },
  "12": { weight: 1.20, description: "Late grower phase" },
  "16": { weight: 1.45, description: "Pre-layer phase" },
  "18": { weight: 1.55, description: "Point of lay" },
  "20": { weight: 1.60, description: "Peak production" }
};

type FlockType = 'broiler' | 'layer';

interface GrowthTargetsSettingsProps {
  type: FlockType;
}

export function GrowthTargetsSettings({ type }: GrowthTargetsSettingsProps) {
  const { currentFarm } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [targets, setTargets] = useState<GrowthTargets>(
    type === 'broiler' ? DEFAULT_BROILER_TARGETS : DEFAULT_LAYER_TARGETS
  );
  const [minAge, setMinAge] = useState(6);
  const [minWeight, setMinWeight] = useState(2.0);
  const [optimalWeight, setOptimalWeight] = useState(2.5);

  useEffect(() => {
    loadSettings();
  }, [currentFarm?.id, type]);

  const loadSettings = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data, error } = await supabase
        .from('farms')
        .select('broiler_growth_targets, layer_growth_targets, market_ready_min_age, market_ready_min_weight, market_ready_optimal_weight')
        .eq('id', currentFarm.id)
        .single();

      if (!error && data) {
        if (type === 'broiler') {
          setTargets(data.broiler_growth_targets || DEFAULT_BROILER_TARGETS);
        } else {
          setTargets(data.layer_growth_targets || DEFAULT_LAYER_TARGETS);
        }
        setMinAge(data.market_ready_min_age || 6);
        setMinWeight(data.market_ready_min_weight || 2.0);
        setOptimalWeight(data.market_ready_optimal_weight || 2.5);
      }
    } catch (error) {
      console.error('Error loading growth targets:', error);
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    setIsSaving(true);
    try {
      const updateData = type === 'broiler'
        ? {
            broiler_growth_targets: targets,
            market_ready_min_age: minAge,
            market_ready_min_weight: minWeight,
            market_ready_optimal_weight: optimalWeight
          }
        : {
            layer_growth_targets: targets
          };

      const { error } = await supabase
        .from('farms')
        .update(updateData)
        .eq('id', currentFarm.id);

      if (error) throw error;

      setIsEditing(false);
    } catch (error) {
      console.error('Error saving growth targets:', error);
      alert('Failed to save growth targets');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Reset to default targets? This will overwrite your custom targets.')) {
      if (type === 'broiler') {
        setTargets(DEFAULT_BROILER_TARGETS);
        setMinAge(6);
        setMinWeight(2.0);
        setOptimalWeight(2.5);
      } else {
        setTargets(DEFAULT_LAYER_TARGETS);
      }
    }
  };

  const updateTarget = (week: string, weight: number) => {
    setTargets({
      ...targets,
      [week]: { ...targets[week], weight }
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-[#3D5F42]" />
          <div>
            <h3 className="text-lg font-bold text-gray-900">
              Growth Targets - {type === 'broiler' ? 'Broilers' : 'Layers'}
            </h3>
            <p className="text-sm text-gray-600">Customize target weights for each week</p>
          </div>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            Edit Targets
          </button>
        )}
      </div>

      <div className="space-y-3 mb-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Week-by-Week Target Weights</h4>
        {Object.keys(targets).sort((a, b) => parseInt(a) - parseInt(b)).map(week => (
          <div
            key={week}
            className="flex items-center gap-4 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <span className="w-20 font-medium text-gray-900">Week {week}:</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={targets[week].weight}
                onChange={(e) => updateTarget(week, parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                className={`w-24 px-3 py-2 border rounded-lg text-center font-medium ${
                  isEditing
                    ? 'border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-100 text-gray-600'
                }`}
              />
              <span className="text-gray-600 font-medium">kg</span>
            </div>
            <span className="text-gray-600 text-sm flex-1">{targets[week].description}</span>
            {week === '7' && type === 'broiler' && (
              <span className="text-yellow-500 text-xl">⭐</span>
            )}
          </div>
        ))}
      </div>

      {type === 'broiler' && (
        <div className="border-t border-gray-200 pt-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-4">Market Ready Criteria</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
              <span className="w-40 text-gray-700">Minimum Age:</span>
              <input
                type="number"
                min="1"
                value={minAge}
                onChange={(e) => setMinAge(parseInt(e.target.value) || 1)}
                disabled={!isEditing}
                className={`w-24 px-3 py-2 border rounded-lg text-center font-medium ${
                  isEditing
                    ? 'border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-100 text-gray-600'
                }`}
              />
              <span className="text-gray-600">weeks</span>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
              <span className="w-40 text-gray-700">Minimum Weight:</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={minWeight}
                onChange={(e) => setMinWeight(parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                className={`w-24 px-3 py-2 border rounded-lg text-center font-medium ${
                  isEditing
                    ? 'border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-100 text-gray-600'
                }`}
              />
              <span className="text-gray-600">kg</span>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
              <span className="w-40 text-gray-700">Optimal Weight:</span>
              <input
                type="number"
                step="0.1"
                min="0"
                value={optimalWeight}
                onChange={(e) => setOptimalWeight(parseFloat(e.target.value) || 0)}
                disabled={!isEditing}
                className={`w-24 px-3 py-2 border rounded-lg text-center font-medium ${
                  isEditing
                    ? 'border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-100 text-gray-600'
                }`}
              />
              <span className="text-gray-600">kg</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-900">
          <span className="font-medium">💡 Tip:</span> These targets are used in weight analysis and market readiness calculations.
          Adjust based on your breed, climate, and feed quality for more accurate insights.
        </p>
      </div>

      {isEditing && (
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Growth Targets'}
          </button>
          <button
            onClick={() => {
              setIsEditing(false);
              loadSettings();
            }}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        ℹ️ Based on: {type === 'broiler' ? 'Cobb 500 breed standards' : 'Standard layer breed growth curves'}.
        Adjust for your specific breed and conditions.
      </p>
    </div>
  );
}
