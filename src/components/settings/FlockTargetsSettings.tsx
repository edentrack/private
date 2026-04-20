import { useState, useEffect } from 'react';
import { TrendingUp, Save, RotateCcw, Edit2, X, RefreshCw, Plus, Trash2, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface GrowthTarget {
  weight: number;
  description: string;
}

interface GrowthTargets {
  [week: string]: GrowthTarget;
}

interface Phase {
  name: string;
  startWeek: number;
  endWeek: number;
  feedType: string;
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
  "20": { weight: 1.60, description: "Peak production" },
  "28": { weight: 1.89, description: "Peak production weight" },
  "40": { weight: 1.94, description: "Maintenance" },
  "60": { weight: 1.99, description: "Maintenance" },
  "72": { weight: 2.02, description: "Maintenance" }
};

const DEFAULT_BROILER_PHASES: Phase[] = [
  { name: 'Brooding', startWeek: 1, endWeek: 2, feedType: 'Starter' },
  { name: 'Growth', startWeek: 3, endWeek: 4, feedType: 'Grower' },
  { name: 'Finishing', startWeek: 5, endWeek: 8, feedType: 'Finisher' },
];

const DEFAULT_LAYER_PHASES: Phase[] = [
  { name: 'Chick', startWeek: 1, endWeek: 5, feedType: 'Starter' },
  { name: 'Grower', startWeek: 6, endWeek: 12, feedType: 'Grower' },
  { name: 'Pullet', startWeek: 13, endWeek: 17, feedType: 'Developer' },
  { name: 'Pre-lay', startWeek: 18, endWeek: 20, feedType: 'Pre-layer' },
  { name: 'Laying', startWeek: 21, endWeek: 72, feedType: 'Layer mash' },
];

type TabType = 'broiler-growth' | 'layer-growth' | 'feed-intake' | 'lifecycle';

export function FlockTargetsSettings() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('broiler-growth');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Growth targets state
  const [broilerTargets, setBroilerTargets] = useState<GrowthTargets>(DEFAULT_BROILER_TARGETS);
  const [layerTargets, setLayerTargets] = useState<GrowthTargets>(DEFAULT_LAYER_TARGETS);
  const [minAge, setMinAge] = useState(6);
  const [minWeight, setMinWeight] = useState(2.0);
  const [optimalWeight, setOptimalWeight] = useState(2.5);

  // Feed Intake Targets state - Broilers: typically 6-8 weeks; Layers: 28+ weeks to 72+
  const [broilerFeedIntake, setBroilerFeedIntake] = useState<Record<string, number>>({
    "1": 14.5, "2": 19, "3": 24, "4": 28, "5": 35, "6": 39, "7": 42, "8": 47
  });
  const [layerFeedIntake, setLayerFeedIntake] = useState<Record<string, number>>({
    "1": 14.5, "2": 19, "3": 24, "4": 28, "5": 35, "6": 39, "7": 42, "8": 47, "9": 56,
    "10": 54, "11": 60, "12": 64, "13": 69, "14": 72, "15": 74, "16": 77, "17": 80, "18": 85,
    "19": 88, "20": 94, "21": 98, "22": 102, "23": 106, "24": 108, "25": 109, "26": 110, "27": 110, "28": 110
  });
  const [maxFeedIntakeWeeks, setMaxFeedIntakeWeeks] = useState<{ broiler: number; layer: number }>({ broiler: 8, layer: 40 });

  // Lifecycle state
  const [broilerDuration, setBroilerDuration] = useState(8);
  const [layerDuration, setLayerDuration] = useState(72);
  const [broilerPhases, setBroilerPhases] = useState<Phase[]>(DEFAULT_BROILER_PHASES);
  const [layerPhases, setLayerPhases] = useState<Phase[]>(DEFAULT_LAYER_PHASES);
  const [editingPhase, setEditingPhase] = useState<{ type: 'broiler' | 'layer'; index: number } | null>(null);
  const [feedIntakeType, setFeedIntakeType] = useState<'broiler' | 'layer'>('layer');

  useEffect(() => {
    if (currentFarm?.id) {
      loadSettings();
    }
  }, [currentFarm?.id]);

  const loadSettings = async () => {
    if (!currentFarm?.id) return;

    try {
      // Use select('*') to avoid schema cache errors if feed intake columns were added by a late migration
      const { data, error } = await supabase
        .from('farms')
        .select('broiler_growth_targets, layer_growth_targets, market_ready_min_age, market_ready_min_weight, market_ready_optimal_weight, broiler_total_duration_weeks, layer_total_duration_weeks, broiler_phases, layer_phases, broiler_feed_intake_targets, layer_feed_intake_targets')
        .eq('id', currentFarm.id)
        .single();

      if (error?.message?.includes('broiler_feed_intake_targets') || error?.message?.includes('schema cache')) {
        // Retry without feed intake columns - they may not exist yet; user needs to run migrations
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('farms')
          .select('broiler_growth_targets, layer_growth_targets, market_ready_min_age, market_ready_min_weight, market_ready_optimal_weight, broiler_total_duration_weeks, layer_total_duration_weeks, broiler_phases, layer_phases')
          .eq('id', currentFarm.id)
          .single();
        if (!fallbackError && fallbackData) {
          const d = fallbackData as any;
          setBroilerTargets(d.broiler_growth_targets || DEFAULT_BROILER_TARGETS);
          setLayerTargets(d.layer_growth_targets || DEFAULT_LAYER_TARGETS);
          setMinAge(d.market_ready_min_age || 6);
          setMinWeight(d.market_ready_min_weight || 2.0);
          setOptimalWeight(d.market_ready_optimal_weight || 2.5);
          setBroilerDuration(d.broiler_total_duration_weeks || 8);
          setLayerDuration(d.layer_total_duration_weeks || 72);
          setBroilerPhases(d.broiler_phases && Array.isArray(d.broiler_phases) && d.broiler_phases.length > 0 ? d.broiler_phases : DEFAULT_BROILER_PHASES);
          setLayerPhases(d.layer_phases && Array.isArray(d.layer_phases) && d.layer_phases.length > 0 ? d.layer_phases : DEFAULT_LAYER_PHASES);
          setMessage('Run database migrations to enable feed intake targets. Using defaults for now.');
          setTimeout(() => setMessage(''), 5000);
        }
        return;
      }

      if (!error && data) {
        // Load growth targets
        setBroilerTargets(data.broiler_growth_targets || DEFAULT_BROILER_TARGETS);
        setLayerTargets(data.layer_growth_targets || DEFAULT_LAYER_TARGETS);
        setMinAge(data.market_ready_min_age || 6);
        setMinWeight(data.market_ready_min_weight || 2.0);
        setOptimalWeight(data.market_ready_optimal_weight || 2.5);

        // Load feed intake targets
        if (data.broiler_feed_intake_targets && typeof data.broiler_feed_intake_targets === 'object') {
          const b = data.broiler_feed_intake_targets as Record<string, number>;
          setBroilerFeedIntake(b);
          const maxBroiler = Math.max(8, ...Object.keys(b).map(k => parseInt(k, 10)).filter(n => !isNaN(n)));
          setMaxFeedIntakeWeeks(prev => ({ ...prev, broiler: Math.max(prev.broiler, maxBroiler) }));
        }
        if (data.layer_feed_intake_targets && typeof data.layer_feed_intake_targets === 'object') {
          const l = data.layer_feed_intake_targets as Record<string, number>;
          setLayerFeedIntake(l);
          const maxLayer = Math.max(40, ...Object.keys(l).map(k => parseInt(k, 10)).filter(n => !isNaN(n)));
          setMaxFeedIntakeWeeks(prev => ({ ...prev, layer: Math.max(prev.layer, maxLayer) }));
        }

        // Load lifecycle settings
        setBroilerDuration(data.broiler_total_duration_weeks || 8);
        setLayerDuration(data.layer_total_duration_weeks || 72);
        setBroilerPhases(data.broiler_phases && Array.isArray(data.broiler_phases) && data.broiler_phases.length > 0 ? data.broiler_phases : DEFAULT_BROILER_PHASES);
        setLayerPhases(data.layer_phases && Array.isArray(data.layer_phases) && data.layer_phases.length > 0 ? data.layer_phases : DEFAULT_LAYER_PHASES);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    setIsSaving(true);
    setMessage('');

    try {
      // Validate lifecycle phases if on lifecycle tab
      if (activeTab === 'lifecycle') {
        const validatePhases = (phases: Phase[], totalDuration: number) => {
          for (let i = 0; i < phases.length; i++) {
            const phase = phases[i];
            if (phase.startWeek < 1 || phase.endWeek > totalDuration) {
              throw new Error(t('settings.flock_lifecycle_validation_week_range', { phaseName: phase.name, maxWeek: totalDuration }));
            }
            if (phase.startWeek > phase.endWeek) {
              throw new Error(t('settings.flock_lifecycle_validation_start_end', { phaseName: phase.name }));
            }
            if (i > 0 && phase.startWeek !== phases[i - 1].endWeek + 1) {
              throw new Error(t('settings.flock_lifecycle_validation_not_connected', { phaseName: phase.name }));
            }
          }
        };

        validatePhases(broilerPhases, broilerDuration);
        validatePhases(layerPhases, layerDuration);
      }

      const updateData: any = {
        broiler_growth_targets: broilerTargets,
        layer_growth_targets: layerTargets,
        market_ready_min_age: minAge,
        market_ready_min_weight: minWeight,
        market_ready_optimal_weight: optimalWeight,
        broiler_total_duration_weeks: broilerDuration,
        layer_total_duration_weeks: layerDuration,
        broiler_phases: broilerPhases,
        layer_phases: layerPhases,
        broiler_feed_intake_targets: broilerFeedIntake,
        layer_feed_intake_targets: layerFeedIntake,
      };

      const { error } = await supabase
        .from('farms')
        .update(updateData)
        .eq('id', currentFarm.id);

      if (error) throw error;

      setMessage(t('settings.settings_saved') || 'Settings saved successfully');
      setTimeout(() => setMessage(''), 3000);
      setIsEditing(false);
    } catch (error: any) {
      console.error('Error saving settings:', error);
      const errMsg = error?.message || '';
      if (errMsg.includes('broiler_feed_intake_targets') || errMsg.includes('layer_feed_intake_targets') || errMsg.includes('schema cache')) {
        setMessage('Feed intake columns not found. Run "supabase db push" or apply the migration to add them.');
      } else {
        setMessage(errMsg || t('settings.save_failed') || 'Failed to save settings');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm(t('settings.reset_targets_confirm') || 'Reset to default targets? This will overwrite your custom settings.')) {
      return;
    }

    if (activeTab === 'broiler-growth') {
      setBroilerTargets(DEFAULT_BROILER_TARGETS);
      setMinAge(6);
      setMinWeight(2.0);
      setOptimalWeight(2.5);
    } else if (activeTab === 'layer-growth') {
      setLayerTargets(DEFAULT_LAYER_TARGETS);
    } else if (activeTab === 'lifecycle') {
      setBroilerDuration(8);
      setLayerDuration(72);
      setBroilerPhases(DEFAULT_BROILER_PHASES);
      setLayerPhases(DEFAULT_LAYER_PHASES);
    } else if (activeTab === 'feed-intake') {
      setBroilerFeedIntake({ "1": 14.5, "2": 19, "3": 24, "4": 28, "5": 35, "6": 39, "7": 42, "8": 47 });
      setLayerFeedIntake({
        "1": 14.5, "2": 19, "3": 24, "4": 28, "5": 35, "6": 39, "7": 42, "8": 47, "9": 56,
        "10": 54, "11": 60, "12": 64, "13": 69, "14": 72, "15": 74, "16": 77, "17": 80, "18": 85,
        "19": 88, "20": 94, "21": 98, "22": 102, "23": 106, "24": 108, "25": 109, "26": 110, "27": 110, "28": 110
      });
      setMaxFeedIntakeWeeks({ broiler: 8, layer: 40 });
    }
  };

  const updateBroilerTarget = (week: string, weight: number) => {
    setBroilerTargets({
      ...broilerTargets,
      [week]: { ...broilerTargets[week], weight }
    });
  };

  const updateLayerTarget = (week: string, weight: number) => {
    setLayerTargets({
      ...layerTargets,
      [week]: { ...layerTargets[week], weight }
    });
  };

  const addPhase = (type: 'broiler' | 'layer') => {
    const phases = type === 'broiler' ? broilerPhases : layerPhases;
    const totalDuration = type === 'broiler' ? broilerDuration : layerDuration;
    const lastPhase = phases[phases.length - 1];
    const newStartWeek = lastPhase ? lastPhase.endWeek + 1 : 1;
    
    if (newStartWeek > totalDuration) {
      alert(t('settings.flock_lifecycle_cannot_add_phase') || 'Cannot add phase beyond total duration');
      return;
    }

    const newPhase: Phase = {
      name: t('settings.flock_lifecycle_new_phase') || 'New Phase',
      startWeek: newStartWeek,
      endWeek: Math.min(newStartWeek + 3, totalDuration),
      feedType: t('settings.flock_lifecycle_feed_type') || 'Feed Type',
    };

    if (type === 'broiler') {
      setBroilerPhases([...broilerPhases, newPhase]);
    } else {
      setLayerPhases([...layerPhases, newPhase]);
    }
    setEditingPhase({ type, index: phases.length });
  };

  const removePhase = (type: 'broiler' | 'layer', index: number) => {
    if (type === 'broiler') {
      setBroilerPhases(broilerPhases.filter((_, i) => i !== index));
    } else {
      setLayerPhases(layerPhases.filter((_, i) => i !== index));
    }
    setEditingPhase(null);
  };

  const updatePhase = (type: 'broiler' | 'layer', index: number, field: keyof Phase, value: string | number) => {
    const phases = type === 'broiler' ? broilerPhases : layerPhases;
    const updatedPhases = [...phases];
    updatedPhases[index] = { ...updatedPhases[index], [field]: value };
    
    if (type === 'broiler') {
      setBroilerPhases(updatedPhases);
    } else {
      setLayerPhases(updatedPhases);
    }
  };

  const renderPhaseEditor = (phase: Phase, type: 'broiler' | 'layer', index: number) => {
    const isEditingPhase = editingPhase?.type === type && editingPhase.index === index;
    
    if (isEditingPhase) {
      return (
        <div className="grid grid-cols-4 gap-2 items-center p-2 bg-blue-50 rounded-lg">
          <input
            type="text"
            value={phase.name}
            onChange={(e) => updatePhase(type, index, 'name', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
            placeholder={t('settings.flock_lifecycle_phase_name') || 'Phase Name'}
          />
          <input
            type="number"
            value={phase.startWeek}
            onChange={(e) => updatePhase(type, index, 'startWeek', parseInt(e.target.value) || 1)}
            className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
            min={1}
          />
          <input
            type="number"
            value={phase.endWeek}
            onChange={(e) => updatePhase(type, index, 'endWeek', parseInt(e.target.value) || 1)}
            className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
            min={phase.startWeek}
          />
          <input
            type="text"
            value={phase.feedType}
            onChange={(e) => updatePhase(type, index, 'feedType', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm bg-white text-gray-900"
            placeholder={t('settings.flock_lifecycle_feed_type') || 'Feed Type'}
          />
          <div className="col-span-4 flex gap-2">
            <button
              onClick={() => setEditingPhase(null)}
              className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            >
              {t('common.done') || 'Done'}
            </button>
            <button
              onClick={() => removePhase(type, index)}
              className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex-1 grid grid-cols-3 gap-4 text-sm">
          <span className="font-medium text-gray-900">{phase.name}</span>
          <span className="text-gray-600">{t('common.week_short') || 'W'} {phase.startWeek}-{phase.endWeek}</span>
          <span className="text-gray-600">{phase.feedType}</span>
        </div>
        <button
          onClick={() => setEditingPhase({ type, index })}
          className="ml-2 p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="border-b border-gray-200 pb-4">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {t('settings.flock_targets_title') || 'Flock Growth Targets & Lifecycle'}
        </h3>
        <p className="text-sm text-gray-600">
          {t('settings.flock_targets_description') || 'Configure growth targets and lifecycle phases for broilers and layers'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('broiler-growth')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'broiler-growth'
              ? 'border-b-2 border-[#3D5F42] text-[#3D5F42]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('settings.broiler_growth_targets') || 'Broiler Growth'}
        </button>
        <button
          onClick={() => setActiveTab('layer-growth')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'layer-growth'
              ? 'border-b-2 border-[#3D5F42] text-[#3D5F42]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('settings.layer_growth_targets') || 'Layer Growth'}
        </button>
        <button
          onClick={() => setActiveTab('feed-intake')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'feed-intake'
              ? 'border-b-2 border-[#3D5F42] text-[#3D5F42]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {(t('settings.feed_intake_targets') && t('settings.feed_intake_targets') !== 'settings.feed_intake_targets') ? t('settings.feed_intake_targets') : 'Feed Intake Targets'}
        </button>
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'lifecycle'
              ? 'border-b-2 border-[#3D5F42] text-[#3D5F42]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {t('settings.flock_lifecycle_title') || 'Lifecycle Configuration'}
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${
          message.includes('success') || message.includes('saved')
            ? 'bg-green-50 text-green-800 border-green-200'
            : 'bg-red-50 text-red-800 border-red-200'
        }`}>
          {message}
        </div>
      )}

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Broiler Growth Targets */}
        {activeTab === 'broiler-growth' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#3D5F42]" />
                <h4 className="text-lg font-semibold text-gray-900">
                  {t('settings.broiler_growth_targets') || 'Broiler Growth Targets'}
                </h4>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  {t('common.edit') || 'Edit'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700">
                {t('settings.week_by_week_targets') || 'Week-by-Week Target Weights'}
              </h5>
              {Object.keys(broilerTargets).sort((a, b) => parseInt(a) - parseInt(b)).map(week => (
                <div
                  key={week}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
                >
                  <span className="w-20 font-medium text-gray-900">{t('common.week') || 'Week'} {week}:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={broilerTargets[week].weight}
                      onChange={(e) => updateBroilerTarget(week, parseFloat(e.target.value) || 0)}
                      disabled={!isEditing}
                      className={`w-24 px-3 py-2 pr-10 border rounded-lg text-center font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        isEditing
                          ? 'border-gray-300 bg-white text-gray-900'
                          : 'border-gray-200 bg-gray-100 text-gray-600'
                      }`}
                    />
                    <span className="text-gray-600 font-medium text-sm pointer-events-none">kg</span>
                  </div>
                  <span className="text-gray-600 text-sm flex-1">{broilerTargets[week].description}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-200 pt-4">
              <h5 className="text-sm font-medium text-gray-700 mb-3">
                {t('settings.market_ready_criteria') || 'Market Ready Criteria'}
              </h5>
              <div className="space-y-2">
                <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                  <span className="w-40 text-gray-700 text-sm">{t('settings.minimum_age') || 'Minimum Age'}:</span>
                  <input
                    type="number"
                    min="1"
                    value={minAge}
                    onChange={(e) => setMinAge(parseInt(e.target.value) || 1)}
                    disabled={!isEditing}
                    className={`w-24 px-3 py-2 border rounded-lg text-center font-medium text-sm ${
                      isEditing ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-600'
                    }`}
                  />
                  <span className="text-gray-600 text-sm">{t('common.weeks') || 'weeks'}</span>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                  <span className="w-40 text-gray-700 text-sm">{t('settings.minimum_weight') || 'Minimum Weight'}:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={minWeight}
                    onChange={(e) => setMinWeight(parseFloat(e.target.value) || 0)}
                    disabled={!isEditing}
                    className={`w-24 px-3 py-2 pr-10 border rounded-lg text-center font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isEditing ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-600'
                    }`}
                  />
                  <span className="text-gray-600 text-sm pointer-events-none">kg</span>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-lg bg-gray-50">
                  <span className="w-40 text-gray-700 text-sm">{t('settings.optimal_weight') || 'Optimal Weight'}:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={optimalWeight}
                    onChange={(e) => setOptimalWeight(parseFloat(e.target.value) || 0)}
                    disabled={!isEditing}
                    className={`w-24 px-3 py-2 pr-10 border rounded-lg text-center font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                      isEditing ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-200 bg-gray-100 text-gray-600'
                    }`}
                  />
                  <span className="text-gray-600 text-sm pointer-events-none">kg</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Layer Growth Targets */}
        {activeTab === 'layer-growth' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#3D5F42]" />
                <h4 className="text-lg font-semibold text-gray-900">
                  {t('settings.layer_growth_targets') || 'Layer Growth Targets'}
                </h4>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  {t('common.edit') || 'Edit'}
                </button>
              )}
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-gray-700">
                {t('settings.week_by_week_targets') || 'Week-by-Week Target Weights'}
              </h5>
              {Object.keys(layerTargets).sort((a, b) => parseInt(a) - parseInt(b)).map(week => (
                <div
                  key={week}
                  className="flex items-center gap-4 p-3 rounded-lg bg-gray-50"
                >
                  <span className="w-20 font-medium text-gray-900">{t('common.week') || 'Week'} {week}:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={layerTargets[week].weight}
                      onChange={(e) => updateLayerTarget(week, parseFloat(e.target.value) || 0)}
                      disabled={!isEditing}
                      className={`w-24 px-3 py-2 pr-10 border rounded-lg text-center font-medium text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                        isEditing
                          ? 'border-gray-300 bg-white text-gray-900'
                          : 'border-gray-200 bg-gray-100 text-gray-600'
                      }`}
                    />
                    <span className="text-gray-600 font-medium text-sm pointer-events-none">kg</span>
                  </div>
                  <span className="text-gray-600 text-sm flex-1">{layerTargets[week].description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feed Intake Targets */}
        {activeTab === 'feed-intake' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-green-600" />
                <h4 className="text-lg font-semibold text-gray-900">
                  {(t('settings.feed_intake_targets') && t('settings.feed_intake_targets') !== 'settings.feed_intake_targets') ? t('settings.feed_intake_targets') : 'Feed Intake Targets (g/bird/day)'}
                </h4>
              </div>
              {!isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  {t('common.edit') || 'Edit'}
                </button>
              )}
            </div>

            {/* Type Selector */}
            <div className="flex gap-2 border-b border-gray-200 pb-2">
              <button
                onClick={() => setFeedIntakeType('broiler')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  feedIntakeType === 'broiler'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Broilers
              </button>
              <button
                onClick={() => setFeedIntakeType('layer')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  feedIntakeType === 'layer'
                    ? 'border-b-2 border-green-600 text-green-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Layers
              </button>
            </div>

            {/* Feed Intake Grid */}
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {(t('settings.feed_intake_description') && t('settings.feed_intake_description') !== 'settings.feed_intake_description') ? t('settings.feed_intake_description') : 'Set expected feed intake in grams per bird per day for each week. Use "Add more weeks" to extend beyond the default.'}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-[500px] overflow-y-auto p-2">
                {Array.from({ length: maxFeedIntakeWeeks[feedIntakeType] }, (_, i) => (i + 1).toString()).map(week => {
                  const targets = feedIntakeType === 'broiler' ? broilerFeedIntake : layerFeedIntake;
                  const setTargets = feedIntakeType === 'broiler' ? setBroilerFeedIntake : setLayerFeedIntake;
                  
                  return (
                    <div
                      key={week}
                      className="flex flex-col gap-1 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-xs font-medium text-gray-600">Week {week}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={targets[week] || ''}
                          onChange={(e) => {
                            const newTargets = { ...targets };
                            const value = parseFloat(e.target.value) || 0;
                            if (value > 0) {
                              newTargets[week] = value;
                            } else {
                              delete newTargets[week];
                            }
                            setTargets(newTargets);
                          }}
                          disabled={!isEditing}
                          placeholder="0"
                          className={`w-full px-2 py-1.5 pr-8 border rounded text-sm text-center font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                            isEditing
                              ? 'border-gray-300 bg-white text-gray-900'
                              : 'border-gray-200 bg-gray-100 text-gray-600'
                          }`}
                        />
                        <span className="text-xs text-gray-500 pointer-events-none">g</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => {
                    const key = feedIntakeType;
                    setMaxFeedIntakeWeeks(prev => ({
                      ...prev,
                      [key]: prev[key] + 10
                    }));
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {(t('settings.add_more_weeks') && t('settings.add_more_weeks') !== 'settings.add_more_weeks') ? t('settings.add_more_weeks') : 'Add more weeks'}
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  {feedIntakeType === 'broiler'
                    ? (t('settings.broiler_weeks_hint') !== 'settings.broiler_weeks_hint' ? t('settings.broiler_weeks_hint') : 'Broilers typically reach market at 6–8 weeks. Add more if you keep them longer.')
                    : (t('settings.layer_weeks_hint') !== 'settings.layer_weeks_hint' ? t('settings.layer_weeks_hint') : 'Layers can produce for 72+ weeks. Add more weeks for long-term planning.')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lifecycle Configuration */}
        {activeTab === 'lifecycle' && (
          <div className="space-y-4">
            {/* Broiler Configuration */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-900">
                  {t('settings.flock_lifecycle_broiler_config') || 'Broiler Configuration'}
                </h4>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.flock_lifecycle_total_duration') || 'Total Duration (weeks)'}
                </label>
                <input
                  type="number"
                  value={broilerDuration}
                  onChange={(e) => setBroilerDuration(parseInt(e.target.value) || 8)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  min={1}
                  max={52}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.flock_lifecycle_broiler_duration_desc') || 'Total lifecycle duration in weeks'}
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    {t('settings.flock_lifecycle_phases') || 'Lifecycle Phases'}
                  </label>
                  <button
                    onClick={() => addPhase('broiler')}
                    className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4" />
                    {t('settings.flock_lifecycle_add_phase') || 'Add Phase'}
                  </button>
                </div>
                <div className="space-y-2">
                  {broilerPhases.map((phase, index) => (
                    <div key={index}>
                      {renderPhaseEditor(phase, 'broiler', index)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Layer Configuration */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-900">
                  {t('settings.flock_lifecycle_layer_config') || 'Layer Configuration'}
                </h4>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('settings.flock_lifecycle_total_duration') || 'Total Duration (weeks)'}
                </label>
                <input
                  type="number"
                  value={layerDuration}
                  onChange={(e) => setLayerDuration(parseInt(e.target.value) || 72)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900"
                  min={1}
                  max={104}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('settings.flock_lifecycle_layer_duration_desc') || 'Total lifecycle duration in weeks'}
                </p>
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    {t('settings.flock_lifecycle_phases') || 'Lifecycle Phases'}
                  </label>
                  <button
                    onClick={() => addPhase('layer')}
                    className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    <Plus className="w-4 h-4" />
                    {t('settings.flock_lifecycle_add_phase') || 'Add Phase'}
                  </button>
                </div>
                <div className="space-y-2">
                  {layerPhases.map((phase, index) => (
                    <div key={index}>
                      {renderPhaseEditor(phase, 'layer', index)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? t('settings.saving') || 'Saving...' : t('settings.save_settings') || 'Save Settings'}
        </button>
        {isEditing && (
          <>
            <button
              onClick={() => {
                setIsEditing(false);
                loadSettings();
              }}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
              {t('common.cancel') || 'Cancel'}
            </button>
            <button
              onClick={handleReset}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {t('settings.reset_to_defaults') || 'Reset to Defaults'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
