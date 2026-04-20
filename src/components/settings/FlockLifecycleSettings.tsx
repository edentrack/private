import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Edit2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';;

interface Phase {
  name: string;
  startWeek: number;
  endWeek: number;
  feedType: string;
}

export function FlockLifecycleSettings() {
  const { t } = useTranslation();
  const { currentFarm } = useAuth();
  const [broilerDuration, setBroilerDuration] = useState(8);
  const [layerDuration, setLayerDuration] = useState(72);
  const [broilerPhases, setBroilerPhases] = useState<Phase[]>([]);
  const [layerPhases, setLayerPhases] = useState<Phase[]>([]);
  const [editingPhase, setEditingPhase] = useState<{ type: 'broiler' | 'layer'; index: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (currentFarm?.id) {
      loadSettings();
    }
  }, [currentFarm?.id]);

  // Default phases (matching ProductionCycleWidget defaults)
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

  const loadSettings = async () => {
    if (!currentFarm?.id) return;

    try {
      const { data } = await supabase
        .from('farms')
        .select('broiler_total_duration_weeks, layer_total_duration_weeks, broiler_phases, layer_phases')
        .eq('id', currentFarm.id)
        .single();

      if (data) {
        if (data.broiler_total_duration_weeks) {
          setBroilerDuration(data.broiler_total_duration_weeks);
        } else {
          setBroilerDuration(8); // Default
        }
        if (data.layer_total_duration_weeks) {
          setLayerDuration(data.layer_total_duration_weeks);
        } else {
          setLayerDuration(72); // Default
        }
        if (data.broiler_phases && Array.isArray(data.broiler_phases) && data.broiler_phases.length > 0) {
          setBroilerPhases(data.broiler_phases);
        } else {
          setBroilerPhases(DEFAULT_BROILER_PHASES);
        }
        if (data.layer_phases && Array.isArray(data.layer_phases) && data.layer_phases.length > 0) {
          setLayerPhases(data.layer_phases);
        } else {
          setLayerPhases(DEFAULT_LAYER_PHASES);
        }
      } else {
        // No data found, use defaults
        setBroilerDuration(8);
        setLayerDuration(72);
        setBroilerPhases(DEFAULT_BROILER_PHASES);
        setLayerPhases(DEFAULT_LAYER_PHASES);
      }
    } catch (error) {
      console.error('Error loading lifecycle settings:', error);
      // Use defaults on error
      setBroilerDuration(8);
      setLayerDuration(72);
      setBroilerPhases(DEFAULT_BROILER_PHASES);
      setLayerPhases(DEFAULT_LAYER_PHASES);
    }
  };

  const handleSave = async () => {
    if (!currentFarm?.id) return;

    setIsSaving(true);
    setMessage('');

    try {
      // Validate phases
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

      const { error } = await supabase
        .from('farms')
        .update({
          broiler_total_duration_weeks: broilerDuration,
          layer_total_duration_weeks: layerDuration,
          broiler_phases: broilerPhases,
          layer_phases: layerPhases,
        })
        .eq('id', currentFarm.id);

      if (error) throw error;

      setMessage(t('settings.flock_lifecycle_save_success'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Error saving lifecycle settings:', error);
      setMessage(error.message || t('settings.flock_lifecycle_save_error'));
    } finally {
      setIsSaving(false);
    }
  };

  const addPhase = (type: 'broiler' | 'layer') => {
    const phases = type === 'broiler' ? broilerPhases : layerPhases;
    const totalDuration = type === 'broiler' ? broilerDuration : layerDuration;
    const lastPhase = phases[phases.length - 1];
    const newStartWeek = lastPhase ? lastPhase.endWeek + 1 : 1;
    
    if (newStartWeek > totalDuration) {
      alert(t('settings.flock_lifecycle_cannot_add_phase'));
      return;
    }

    const newPhase: Phase = {
      name: t('settings.flock_lifecycle_new_phase'),
      startWeek: newStartWeek,
      endWeek: Math.min(newStartWeek + 3, totalDuration),
      feedType: t('settings.flock_lifecycle_feed_type'),
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
    const isEditing = editingPhase?.type === type && editingPhase.index === index;
    
    if (isEditing) {
      return (
        <div className="grid grid-cols-4 gap-2 items-center p-2 bg-blue-50 rounded-lg">
          <input
            type="text"
            value={phase.name}
            onChange={(e) => updatePhase(type, index, 'name', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
            placeholder={t('settings.flock_lifecycle_phase_name')}
          />
          <input
            type="number"
            value={phase.startWeek}
            onChange={(e) => updatePhase(type, index, 'startWeek', parseInt(e.target.value) || 1)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
            min={1}
            placeholder={t('settings.flock_lifecycle_start_week')}
          />
          <input
            type="number"
            value={phase.endWeek}
            onChange={(e) => updatePhase(type, index, 'endWeek', parseInt(e.target.value) || 1)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
            min={phase.startWeek}
            placeholder={t('settings.flock_lifecycle_end_week')}
          />
          <input
            type="text"
            value={phase.feedType}
            onChange={(e) => updatePhase(type, index, 'feedType', e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded text-sm"
            placeholder={t('settings.flock_lifecycle_feed_type')}
          />
          <div className="col-span-4 flex gap-2">
            <button
              onClick={() => setEditingPhase(null)}
              className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
            >
              {t('common.done')}
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
          <span className="text-gray-600">{t('common.week_short')} {phase.startWeek}-{phase.endWeek}</span>
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
        <h3 className="text-xl font-bold text-gray-900 mb-2">{t('settings.flock_lifecycle_title')}</h3>
        <p className="text-sm text-gray-600">
          {t('settings.flock_lifecycle_description')}
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg border ${message.includes('success') ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {message}
        </div>
      )}

      {/* Broiler Configuration */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold text-gray-900">{t('settings.flock_lifecycle_broiler_config')}</h4>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.flock_lifecycle_total_duration')}
          </label>
          <input
            type="number"
            value={broilerDuration}
            onChange={(e) => setBroilerDuration(parseInt(e.target.value) || 8)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            min={1}
            max={52}
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('settings.flock_lifecycle_broiler_duration_desc')}
          </p>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">{t('settings.flock_lifecycle_phases')}</label>
            <button
              onClick={() => addPhase('broiler')}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <Plus className="w-4 h-4" />
              {t('settings.flock_lifecycle_add_phase')}
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
      <div className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-lg font-semibold text-gray-900">{t('settings.flock_lifecycle_layer_config')}</h4>
        </div>
        
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('settings.flock_lifecycle_total_duration')}
          </label>
          <input
            type="number"
            value={layerDuration}
            onChange={(e) => setLayerDuration(parseInt(e.target.value) || 72)}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            min={1}
            max={104}
          />
          <p className="text-xs text-gray-500 mt-2">
            {t('settings.flock_lifecycle_layer_duration_desc')}
          </p>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-gray-700">{t('settings.flock_lifecycle_phases')}</label>
            <button
              onClick={() => addPhase('layer')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('settings.flock_lifecycle_add_phase')}
            </button>
          </div>
          <div className="space-y-2">
            {layerPhases.length > 0 ? (
              layerPhases.map((phase, index) => (
                <div key={index}>
                  {renderPhaseEditor(phase, 'layer', index)}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">{t('settings.flock_lifecycle_loading_phases')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2F4A34] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          {isSaving ? t('settings.saving') : t('settings.save_settings')}
        </button>
      </div>
    </div>
  );
}
