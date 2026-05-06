import { useState, useMemo } from 'react';
import { Camera, Search, AlertTriangle, X, ImageIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabaseClient';
import {
  FISH_DISEASES,
  searchDiseases,
  type FishDisease,
  type DiseaseSeverity,
} from '../../data/fishDiseases';

/**
 * Fish Health & Disease — Phase B Step 18 UI.
 *
 * Two modes:
 *   1. Browse / search the disease library (grounded in src/data/fishDiseases.ts)
 *   2. Upload a photo of a sick fish — Eden AI returns ranked diagnoses via
 *      GPT-4 Vision (the ai-chat edge function already supports image input;
 *      we just point it at a disease-diagnosis system prompt).
 *
 * UI is intentionally a SAFETY-FIRST surface: every diagnosis card has a
 * "consult a fish-health vet to confirm" warning. The AI is for triage,
 * not prescription.
 */

interface AquaFlock {
  id: string;
  name: string;
  type: 'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish';
}

const AQUA_TYPES = ['Catfish', 'Tilapia', 'Clarias', 'Other Fish'] as const;

const SEVERITY_COLOR: Record<DiseaseSeverity, string> = {
  mild: 'bg-blue-100 text-blue-800',
  moderate: 'bg-amber-100 text-amber-800',
  severe: 'bg-red-100 text-red-800',
  fatal: 'bg-red-200 text-red-900 border border-red-300',
};

interface DiagnosisResult {
  diseaseId: string;
  confidence: number; // 0-1
  reasoning: string;
}

interface DiagnosisResponse {
  diagnoses: DiagnosisResult[];
  /** Sonnet sets this true when it's not confident enough to commit. UI uses
   *  this OR a top-confidence < 0.7 to surface the Opus expert-review button. */
  uncertain?: boolean;
  /** Which model produced this set of diagnoses. Tracked so the UI can show
   *  'Sonnet' vs 'Opus expert review' next to each pane. */
  model?: 'sonnet' | 'opus';
}

const MODEL_SONNET_ID = 'claude-sonnet-4-6';
const MODEL_OPUS_ID = 'claude-opus-4-6';
const EXPERT_REVIEW_CONFIDENCE_THRESHOLD = 0.7;

export function FishHealthPage() {
  const { currentFarm, user, profile } = useAuth();
  const toast = useToast();

  const [mode, setMode] = useState<'library' | 'diagnose'>('library');
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'all' | 'Tilapia' | 'Catfish' | 'Clarias' | 'Other Fish'>('all');
  const [openDisease, setOpenDisease] = useState<FishDisease | null>(null);

  // Diagnose mode
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [sonnetResult, setSonnetResult] = useState<DiagnosisResponse | null>(null);
  const [opusResult, setOpusResult] = useState<DiagnosisResponse | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [flocks, setFlocks] = useState<AquaFlock[]>([]);
  const [diagnoseFlockId, setDiagnoseFlockId] = useState<string>('');
  const [extraNotes, setExtraNotes] = useState('');

  const filtered = useMemo(() => {
    let list = searchQuery.trim() ? searchDiseases(searchQuery) : FISH_DISEASES;
    if (speciesFilter !== 'all') {
      list = list.filter(d => d.affectedSpecies.includes(speciesFilter));
    }
    return list;
  }, [searchQuery, speciesFilter]);

  // Lazy load flocks only when user opens diagnose mode (avoids extra query on library mode)
  const loadFlocks = async () => {
    if (!currentFarm?.id || flocks.length > 0) return;
    const { data } = await supabase
      .from('flocks')
      .select('id, name, type')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .in('type', AQUA_TYPES as readonly string[])
      .order('name');
    setFlocks((data as AquaFlock[]) || []);
    if (data && data.length > 0) setDiagnoseFlockId(data[0].id);
  };

  const switchToDiagnose = () => {
    setMode('diagnose');
    loadFlocks();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo too large — max 10 MB');
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setSonnetResult(null);
    setOpusResult(null);
    setDiagnosisError(null);
  };

  /**
   * Convert the picked file to base64 for the edge function payload.
   * Memoised at runtime — runs once per photo rather than once per Sonnet/Opus call.
   */
  const fileToBase64 = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mediaType: file.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  /**
   * Build the diagnosis prompt. Schema is identical for Sonnet and Opus —
   * only the requested rigour in the body differs (Opus is asked to
   * differentiate look-alikes more aggressively).
   */
  const buildPrompt = (modelTier: 'sonnet' | 'opus', speciesContext: string): string => {
    const opusGuidance =
      modelTier === 'opus'
        ? 'You are providing an EXPERT REVIEW after the first model returned uncertain or low-confidence results. Be more rigorous: differentiate visually similar diseases (e.g., columnaris vs. saprolegnia, MAS vs. nitrite poisoning) using subtle cues; if you genuinely cannot tell, return an empty array and set "uncertain": true with a short "uncertaintyReason".'
        : 'Triage this case for a smallholder fish farmer. If you are not confident, set "uncertain": true rather than guessing.';
    return [
      `I'm a fish farmer. Please look at this photo and tell me what disease or condition the fish most likely has.`,
      `Species: ${speciesContext}.`,
      extraNotes ? `Extra observations: ${extraNotes}` : '',
      '',
      opusGuidance,
      '',
      'Respond ONLY with valid JSON in this exact shape:',
      '{',
      '  "diagnoses": [ { "diseaseId": "<one of: ' +
        FISH_DISEASES.map(d => d.id).join(', ') +
        '>", "confidence": 0.0-1.0, "reasoning": "1-2 sentence explanation" } ],',
      '  "uncertain": true | false,',
      '  "uncertaintyReason": "optional short string when uncertain=true"',
      '}',
      'Up to 3 diagnoses, ranked by confidence. If unsure, return an empty diagnoses array and set uncertain=true.',
    ].join('\n');
  };

  /**
   * Invoke the ai-chat edge function with an explicit model override.
   * Returns the parsed DiagnosisResponse, or throws with a user-facing error.
   */
  const callDiseaseModel = async (
    modelId: string,
    base64: string,
    mediaType: string,
    speciesContext: string,
    modelTier: 'sonnet' | 'opus',
  ): Promise<DiagnosisResponse> => {
    const promptText = buildPrompt(modelTier, speciesContext);
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        farmId: currentFarm!.id,
        userId: user!.id,
        // The ai-chat edge function whitelists this; non-whitelisted values
        // are silently ignored and selectModel() picks instead.
        model: modelId,
        messages: [
          {
            role: 'user',
            content: promptText,
            images: [{ base64, mediaType }],
          },
        ],
        mode: 'disease-diagnosis',
      },
    });
    if (error) throw new Error(error.message || 'Eden AI call failed');

    const text =
      (data?.reply as string) ||
      (data?.content as string) ||
      (typeof data === 'string' ? data : '');
    const match = text.match(/\{[\s\S]*"diagnoses"[\s\S]*\}/);
    if (!match) {
      throw new Error('Could not parse a structured diagnosis from the model response');
    }
    const parsed = JSON.parse(match[0]) as DiagnosisResponse;
    const valid = (parsed.diagnoses || [])
      .filter(d => FISH_DISEASES.some(disease => disease.id === d.diseaseId))
      .slice(0, 3);
    return {
      diagnoses: valid,
      uncertain: !!parsed.uncertain,
      model: modelTier,
    };
  };

  const handleDiagnose = async () => {
    if (!imageFile || !user || !currentFarm?.id) {
      toast.error('Please pick a photo first');
      return;
    }
    setDiagnosing(true);
    setDiagnosisError(null);
    setSonnetResult(null);
    setOpusResult(null);

    try {
      const { base64, mediaType } = await fileToBase64(imageFile);
      const flock = flocks.find(f => f.id === diagnoseFlockId);
      const speciesContext = flock ? flock.type : 'fish';
      const result = await callDiseaseModel(MODEL_SONNET_ID, base64, mediaType, speciesContext, 'sonnet');
      if (result.diagnoses.length === 0 && result.uncertain) {
        setSonnetResult(result);
        setDiagnosisError(
          'Eden was uncertain after looking at the photo. Click "Get expert review" to escalate to the high-tier model, or browse the disease library below.',
        );
      } else if (result.diagnoses.length === 0) {
        setDiagnosisError(
          'Eden could not match the photo to any known disease. Browse the library below for likely candidates and consult a vet.',
        );
      } else {
        setSonnetResult(result);
      }
    } catch (err: any) {
      console.error('Diagnosis error', err);
      setDiagnosisError(err?.message || 'Failed to call Eden AI for diagnosis');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleExpertReview = async () => {
    if (!imageFile || !user || !currentFarm?.id) return;
    setReviewing(true);
    setDiagnosisError(null);

    try {
      const { base64, mediaType } = await fileToBase64(imageFile);
      const flock = flocks.find(f => f.id === diagnoseFlockId);
      const speciesContext = flock ? flock.type : 'fish';
      const result = await callDiseaseModel(MODEL_OPUS_ID, base64, mediaType, speciesContext, 'opus');
      setOpusResult(result);
    } catch (err: any) {
      console.error('Expert review error', err);
      setDiagnosisError(err?.message || 'Failed to get expert review from Eden AI');
    } finally {
      setReviewing(false);
    }
  };

  /**
   * Decide whether to show the "Get expert review" button.
   * Yes if Sonnet returned uncertain=true OR top diagnosis confidence < 70%
   * AND Opus hasn't been called yet AND we're not currently reviewing.
   */
  const shouldShowExpertReviewCta = (): boolean => {
    if (!sonnetResult || opusResult || reviewing) return false;
    if (sonnetResult.uncertain) return true;
    const top = sonnetResult.diagnoses[0];
    if (top && top.confidence < EXPERT_REVIEW_CONFIDENCE_THRESHOLD) return true;
    return false;
  };

  const renderDiseaseCard = (d: FishDisease) => (
    <button
      key={d.id}
      type="button"
      onClick={() => setOpenDisease(d)}
      className="bg-white border border-gray-200 rounded-2xl p-4 text-left hover:border-gray-400 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight">{d.name}</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${SEVERITY_COLOR[d.severity]}`}>
          {d.severity}
        </span>
      </div>
      {d.scientificName && (
        <p className="text-xs italic text-gray-500 mb-1.5">{d.scientificName}</p>
      )}
      <p className="text-xs text-gray-700 leading-snug">{d.oneLiner}</p>
      <div className="flex flex-wrap gap-1 mt-2">
        {d.affectedSpecies.map(s => (
          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {s}
          </span>
        ))}
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fish Health & Diseases</h1>
          <p className="text-sm text-gray-500">Browse the disease library or upload a photo for AI-assisted triage.</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-900 leading-relaxed">
          Eden's diagnoses are for <strong>triage only</strong>. Always confirm with a fish-health professional before
          starting antibiotics or pond-wide treatments. Wrong treatment can be worse than the disease.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setMode('library')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'library'
              ? 'border-[#3D5F42] text-[#3D5F42]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="inline w-4 h-4 mr-1" />
          Browse library
        </button>
        <button
          type="button"
          onClick={switchToDiagnose}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'diagnose'
              ? 'border-[#3D5F42] text-[#3D5F42]'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="inline w-4 h-4 mr-1" />
          Diagnose from photo
        </button>
      </div>

      {mode === 'library' && (
        <>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, symptom, or cause…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30"
              />
            </div>
            <select
              value={speciesFilter}
              onChange={e => setSpeciesFilter(e.target.value as any)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="all">All species</option>
              <option value="Tilapia">Tilapia</option>
              <option value="Catfish">Catfish</option>
              <option value="Clarias">Clarias</option>
              <option value="Other Fish">Other</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <p className="text-sm">No diseases match. Try a different search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(renderDiseaseCard)}
            </div>
          )}
        </>
      )}

      {mode === 'diagnose' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pond / species</label>
                {flocks.length === 0 ? (
                  <p className="text-xs text-amber-600">No active aquaculture flocks. Create a pond first.</p>
                ) : (
                  <select
                    value={diagnoseFlockId}
                    onChange={e => setDiagnoseFlockId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    {flocks.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#3D5F42] file:text-white hover:file:bg-[#2f4a34]"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Extra observations <span className="text-gray-400">optional</span></label>
              <textarea
                value={extraNotes}
                onChange={e => setExtraNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Started 2 days ago, fish gasping at surface, water turned green this week."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D5F42]/30 resize-none"
              />
            </div>
            {imagePreview && (
              <div className="mt-3 relative w-full max-w-xs">
                <img src={imagePreview} alt="Fish" className="rounded-lg border border-gray-200 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    setSonnetResult(null);
                    setOpusResult(null);
                  }}
                  className="absolute top-1 right-1 p-1 bg-white/90 rounded-full hover:bg-white"
                >
                  <X className="w-3 h-3 text-gray-700" />
                </button>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleDiagnose}
                disabled={!imageFile || diagnosing || profile?.subscription_tier === 'free'}
                className="px-4 py-2 text-sm font-medium bg-[#3D5F42] text-white rounded-lg hover:bg-[#2f4a34] disabled:opacity-60 inline-flex items-center gap-2"
                title={profile?.subscription_tier === 'free' ? 'Photo diagnosis requires the Grower plan' : ''}
              >
                <ImageIcon className="w-4 h-4" />
                {diagnosing ? 'Asking Eden…' : 'Diagnose photo'}
              </button>
            </div>
            {profile?.subscription_tier === 'free' && (
              <p className="text-xs text-amber-700 mt-2">
                Photo diagnosis is a <strong>Grower plan</strong> feature. Upgrade to use Eden's vision diagnosis.
              </p>
            )}
            {diagnosisError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-800 text-xs p-3 rounded-lg">
                {diagnosisError}
              </div>
            )}
          </div>

          {sonnetResult && sonnetResult.diagnoses.length > 0 && (
            <DiagnosisPane
              title="Eden's ranked diagnoses"
              modelLabel="Sonnet"
              result={sonnetResult}
              onOpenDisease={setOpenDisease}
            />
          )}

          {/* "Get expert review" button — only when Sonnet was uncertain or
              top confidence < 70%, AND Opus hasn't been called yet. Escalates
              to claude-opus-4-6 for a second look. */}
          {shouldShowExpertReviewCta() && (
            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <Search className="w-4 h-4 text-purple-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-900">Want a second opinion?</p>
                <p className="text-xs text-purple-800 mt-0.5">
                  {sonnetResult?.uncertain
                    ? 'Eden was uncertain. The expert-tier model can take a closer look — it is slower but better at differentiating visually similar diseases.'
                    : `The top diagnosis is below ${Math.round(EXPERT_REVIEW_CONFIDENCE_THRESHOLD * 100)}% confidence. The expert-tier model can re-examine the photo with more rigour.`}
                </p>
                <button
                  type="button"
                  onClick={handleExpertReview}
                  disabled={reviewing || profile?.subscription_tier === 'free'}
                  className="mt-2 px-3 py-1.5 text-xs font-medium bg-purple-700 text-white rounded-lg hover:bg-purple-800 disabled:opacity-60 inline-flex items-center gap-1.5"
                  title={profile?.subscription_tier === 'free' ? 'Expert review requires the Grower plan' : ''}
                >
                  <Search className="w-3 h-3" />
                  {reviewing ? 'Asking expert model…' : 'Get expert review'}
                </button>
              </div>
            </div>
          )}

          {opusResult && opusResult.diagnoses.length > 0 && (
            <DiagnosisPane
              title="Expert review (Opus)"
              modelLabel="Opus"
              accent="purple"
              result={opusResult}
              onOpenDisease={setOpenDisease}
            />
          )}

          {opusResult && opusResult.diagnoses.length === 0 && opusResult.uncertain && (
            <div className="bg-purple-50 border border-purple-200 text-purple-900 text-xs p-3 rounded-lg">
              The expert model was also uncertain. Browse the disease library below for likely candidates and consult a fish-health professional before treating.
            </div>
          )}
        </div>
      )}

      {openDisease && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
          onClick={() => setOpenDisease(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-3xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-gray-900">{openDisease.name}</h2>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${SEVERITY_COLOR[openDisease.severity]}`}>
                    {openDisease.severity}
                  </span>
                </div>
                {openDisease.scientificName && (
                  <p className="text-xs italic text-gray-500">{openDisease.scientificName}</p>
                )}
              </div>
              <button onClick={() => setOpenDisease(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <DetailSection title="Symptoms" items={openDisease.symptoms} />
              <DetailSection title="Causes" items={openDisease.causes} />
              <DetailSection title="Treatment" items={openDisease.treatment} accent="green" />
              <DetailSection title="Prevention" items={openDisease.prevention} accent="blue" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiagnosisPane({
  title,
  modelLabel,
  result,
  onOpenDisease,
  accent,
}: {
  title: string;
  modelLabel: string;
  result: DiagnosisResponse;
  onOpenDisease: (d: FishDisease) => void;
  accent?: 'purple';
}) {
  const headerClass = accent === 'purple' ? 'text-purple-700' : 'text-gray-700';
  const cardClass =
    accent === 'purple'
      ? 'bg-white border border-purple-200 rounded-2xl p-4'
      : 'bg-white border border-gray-200 rounded-2xl p-4';
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className={`text-sm font-semibold ${headerClass}`}>{title}</h2>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono uppercase tracking-wide">
          {modelLabel}
        </span>
      </div>
      {result.diagnoses.map((d, i) => {
        const disease = FISH_DISEASES.find(x => x.id === d.diseaseId);
        if (!disease) return null;
        return (
          <div key={`${modelLabel}-${d.diseaseId}`} className={cardClass}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                <h3 className="font-semibold text-gray-900">{disease.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide ${SEVERITY_COLOR[disease.severity]}`}>
                  {disease.severity}
                </span>
              </div>
              <span className="text-xs font-mono text-gray-600">{Math.round(d.confidence * 100)}%</span>
            </div>
            <p className="text-xs text-gray-700 italic mb-2">{d.reasoning}</p>
            <button
              type="button"
              onClick={() => onOpenDisease(disease)}
              className="text-xs text-[#3D5F42] font-medium hover:underline"
            >
              View full treatment plan →
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DetailSection({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent?: 'green' | 'blue';
}) {
  const accentClass =
    accent === 'green' ? 'border-l-4 border-green-400 pl-3' : accent === 'blue' ? 'border-l-4 border-blue-400 pl-3' : '';
  return (
    <div className={accentClass}>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
            <span className="text-gray-400 mt-1">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
