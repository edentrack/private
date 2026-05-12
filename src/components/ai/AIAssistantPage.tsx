import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Navigation, CheckCircle, X, Mic, MicOff, Camera, Bot, Paperclip, FileSpreadsheet, Volume2, VolumeX, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useFarmSpecies } from '../../hooks/useSpecies';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { EdenAvatarAnimated } from './EdenAvatarAnimated';
import { EdenHeader } from './EdenHeader';
import { EdenEmptyState } from './EdenEmptyState';
import { EdenLogActionCard } from './EdenLogActionCard';
import { EdenStructuredResponse, parseStructuredResponse } from './EdenStructuredResponse';
import { getFarmTodayISO, getFarmTimeZone } from '../../utils/farmTime';
import { useEdenChat, EdenChatScope, EdenChatMessage } from '../../hooks/useEdenChat';
import { sortActionsByDependency } from '../../utils/actionDependencyOrder';

interface ImageAttachment {
  data: string;       // base64 (no prefix)
  mediaType: string;
  preview: string;    // data URL for display
}

interface PendingFile {
  name: string;
  content: string;  // CSV/text content (capped at 200 rows)
  rowCount: number;
}

interface LogAction {
  type:
    | 'LOG_MORTALITY' | 'LOG_EGGS' | 'LOG_EXPENSE' | 'LOG_PURCHASE'
    | 'COMPLETE_TASK' | 'CREATE_TASK'
    | 'LOG_WEIGHT' | 'LOG_FEED_USAGE'
    | 'LOG_EGG_SALE' | 'LOG_BIRD_SALE'
    // Fish (aquaculture) — Eden as operator
    | 'LOG_WATER_QUALITY' | 'LOG_POND_INSPECTION' | 'LOG_STOCKING'
    | 'LOG_HARVEST' | 'LOG_SAMPLING' | 'LOG_FISH_LOSS'
    // Rabbit — Eden as operator
    | 'LOG_BREEDING' | 'LOG_KINDLING' | 'LOG_WEANING'
    | 'REGISTER_RABBIT' | 'LOG_RABBIT_LOSS' | 'LOG_RABBIT_HARVEST'
    // Phase 6 onboarding — Eden creates the farm itself
    | 'CREATE_FARM' | 'CREATE_FLOCK' | 'CREATE_POND' | 'CREATE_RABBITRY'
    | 'ONBOARDING_COMPLETE' | 'SWITCH_TO_FORM'
    // Farm Journal — Eden writes a free-form note to the timeline.
    // Use for observations, milestones, summaries, anything Eden
    // wants to surface without it being a structured log.
    | 'LOG_JOURNAL';
  log_date?: string;  // universal ISO date override for bulk imports
  // Common
  flock_name?: string;
  notes?: string;
  currency?: string;
  // Mortality
  count?: number;
  cause?: string;
  // Egg collection
  small_eggs?: number;
  medium_eggs?: number;
  large_eggs?: number;
  jumbo_eggs?: number;
  damaged_eggs?: number;
  cracked?: number;
  // Expense
  category?: string;
  amount?: number;
  description?: string;
  // Purchase
  item_name?: string;
  inventory_category?: 'feed' | 'Medication' | 'Equipment' | 'Supplies';
  quantity?: number;
  unit?: string;
  purchase_date?: string;
  paid_from_profit?: boolean;
  // Medication-specific add-ons. When inventory_category='Medication',
  // the executor also creates a vet_logs row so the medication shows up
  // in withdrawal-period tracking. The fields below let the AI pass
  // through optional veterinary context the farmer mentioned (vet name,
  // dosage, withdrawal). Missing fields fall back to sensible defaults.
  vet_name?: string;
  dosage?: string;
  withdrawal_period_days?: number;
  diagnosis?: string;
  // LOG_JOURNAL — Eden notes
  journal_entry_type?: 'observation' | 'financial' | 'milestone' | 'personal' | 'health' | 'auto_summary';
  journal_title?: string;
  journal_body?: string;
  // Weight
  avg_weight_kg?: number;
  sample_size?: number;
  // Feed
  feed_type?: string;
  bags_used?: number;
  // Task completion / creation
  task_title_hint?: string;
  title?: string;
  due_date?: string;
  // Egg sale
  small_eggs_sold?: number;
  medium_eggs_sold?: number;
  large_eggs_sold?: number;
  jumbo_eggs_sold?: number;
  small_price?: number;
  medium_price?: number;
  large_price?: number;
  jumbo_price?: number;
  trays_sold?: number;
  customer_name?: string;
  customer_phone?: string;
  payment_status?: string;
  sale_date?: string;
  // Bird sale
  birds_sold?: number;
  price_per_bird?: number;
  total_amount?: number;
  // ─── Fish (aquaculture) species-aware actions ────────────────────────
  // pond_name is an alias for flock_name for fish — the executor checks
  // pond_name first and falls back to flock_name. Kept separate so the
  // system prompt can read naturally.
  pond_name?: string;
  // LOG_WATER_QUALITY
  dissolved_oxygen?: number;
  temperature_c?: number;
  ph?: number;
  ammonia_mgl?: number;
  nitrite_mgl?: number;
  // LOG_POND_INSPECTION
  water_clarity?: 'clear' | 'murky' | 'green' | 'brown' | 'black';
  fish_behavior?: 'normal' | 'lethargic' | 'gasping' | 'erratic' | 'feeding-vigorous';
  feeding_response?: 'vigorous' | 'normal' | 'slow' | 'none';
  dead_fish_count?: number;
  // LOG_STOCKING (fish species at row level) OR CREATE_FARM (top-level
  // farm species). We accept both unions on the same field — the executor
  // disambiguates by `type`.
  fingerling_count?: number;
  species?: 'tilapia' | 'catfish' | 'clarias' | 'other' | 'poultry' | 'aquaculture' | 'rabbits';
  source?: string;
  cost_per_fingerling?: number;
  total_cost?: number;
  stocked_at?: string;
  // LOG_HARVEST (fish)
  total_weight_kg?: number;
  price_per_kg?: number;
  buyer_name?: string;
  harvested_at?: string;
  // LOG_SAMPLING
  abw_g?: number;
  sampled_at?: string;
  // ─── Rabbit species-aware actions ─────────────────────────────────────
  rabbitry_name?: string;
  // LOG_BREEDING / LOG_KINDLING / REGISTER_RABBIT
  doe_tag?: string;
  buck_tag?: string;
  mating_date?: string;
  expected_kindling_date?: string;
  // LOG_KINDLING
  kits_born_alive?: number;
  kits_born_dead?: number;
  kindling_date?: string;
  breeding_event_hint?: string;
  // LOG_WEANING
  kits_weaned?: number;
  weaning_date?: string;
  // REGISTER_RABBIT
  tag?: string;
  sex?: 'doe' | 'buck';
  breed?: string;
  birth_date?: string;
  sire_tag?: string;
  dam_tag?: string;
  // LOG_RABBIT_HARVEST
  total_live_weight_kg?: number;
  total_carcass_weight_kg?: number;
  sale_price?: number;
  harvest_date?: string;
  // Cross-farm mode: Eden includes this in [LOG] blocks to specify the target farm.
  target_farm_id?: string;

  // ─── Phase 6 onboarding — Eden creates the farm itself ──────────────
  // CREATE_FARM uses `name` for the farm name. Subsequent CREATE_FLOCK /
  // CREATE_POND / CREATE_RABBITRY reference back via `farm_name`. Fields
  // `breed`, `count`, `species` already declared above; this block adds
  // only the fields that don't yet exist.
  country?: string;
  currency_code?: string;
  location?: string;
  farm_name?: string;
  name?: string;
  stocked_date?: string;
  current_phase?: 'chick' | 'grower' | 'layer' | 'broiler';
  // CREATE_POND
  area_sqm?: number;
  depth_m?: number;
  water_source?: string;
  // CREATE_RABBITRY
  capacity?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
  attachedFile?: { name: string; rowCount: number };
  actions?: Array<{ type: string; label: string; href: string }>;
  logAction?: LogAction;
  logConfirmed?: boolean;
  logSaving?: boolean;
  logError?: string;
  bulkLogActions?: LogAction[];
  bulkLogSelected?: boolean[];
  bulkLogConfirmed?: boolean;
  bulkLogResult?: { saved: number; total: number; failed: number };
  bulkLogProgress?: { done: number; total: number };
  payRunAction?: { worker_name: string; worker_id?: string; amount: number; bonus?: number; pay_date: string; pay_period_start?: string; pay_period_end?: string; currency: string; notes?: string };
  payRunConfirmed?: boolean;
  saveConfigAction?: { egg_prices?: Record<string, number>; payout_account?: string; default_pay_day?: number };
  saveConfigConfirmed?: boolean;
  updateRecordAction?: { table: string; match: Record<string, any>; update: Record<string, any> };
  updateRecordConfirmed?: boolean;
  voidRecordAction?: { table: string; match: Record<string, any>; reason?: string };
  voidRecordConfirmed?: boolean;
  logWorkerAction?: { name: string; role?: string; pay_type?: string; monthly_salary?: number; hourly_rate?: number; currency?: string; phone?: string; notes?: string };
  logWorkerConfirmed?: boolean;
  updateWorkerAction?: { match_name: string; update: Record<string, any> };
  updateWorkerConfirmed?: boolean;
  updateTeamMemberAction?: { farm_member_id: string; member_name: string; old_role: string; new_role: string };
  updateTeamMemberConfirmed?: boolean;
  timestamp: Date;
}

// Per-species suggestion lists used to live here; they're now generated by
// Haiku on demand via useEdenChips and rendered by EdenEmptyState. Static
// fallbacks (when Haiku is unreachable) live in src/hooks/useEdenChips.ts.


/**
 * Map a persisted Supabase row to the in-memory display shape. Persisted rows
 * only carry log_action; richer fields (bulkLogActions, payRunAction, etc.)
 * are derived at runtime from the edge-function response and are not stored.
 *
 * Pre-Phase-1 we cached chat in `localStorage` under `eden_chat_messages`
 * keyed by date; that is now superseded by per-scope caching inside
 * useEdenChat. The old key is left orphaned (auto-evicts as cache fills);
 * if the page is opened on the day of upgrade users see no chat history,
 * which is acceptable per the migration plan in EDEN_PER_FARM_CHAT.md.
 */
function persistedToDisplay(row: EdenChatMessage): ChatMessage {
  const log = row.log_action as LogAction | null | undefined;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    images: undefined,
    logAction: log ?? undefined,
    logConfirmed: row.log_confirmed ?? undefined,
    timestamp: new Date(row.created_at),
  };
}

export function AIAssistantPage() {
  const { currentFarm, user, profile, allFarms, switchFarm } = useAuth();
  const { language } = useLanguage();
  const isFr = language === 'fr';
  const { showToast } = useToast();
  useTranslation(); // i18n side-effect; translations resolved inline elsewhere
  const farmSpecies = useFarmSpecies();

  // Phase 1 — per-farm chat persistence. The conversation scope is either a
  // single farm OR "All my farms" (cross-farm mode). Cross-farm mode requires
  // disambiguation on writes; see docs/EDEN_PER_FARM_CHAT.md.
  const [crossFarm, setCrossFarm] = useState(false);
  const scope: EdenChatScope = crossFarm
    ? { mode: 'all' }
    : { mode: 'farm', farmId: currentFarm?.id ?? '' };
  const persistedChat = useEdenChat(user?.id ?? null, scope);

  // The on-screen `messages` list mirrors persisted history but carries
  // transient UI state (logSaving, bulkLogProgress) that does NOT go to DB.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  // Phase G voice support — Whisper-backed (better African-language coverage
  // than browser SpeechRecognition). MediaRecorder captures audio; we stop
  // when the user taps the mic again, then ship the blob to /transcribe-audio.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  // Language picker for voice (Whisper hint + TTS voice). Persisted via localStorage.
  const [voiceLang, setVoiceLang] = useState<'en' | 'fr' | 'sw' | 'yo' | 'ha' | 'pidgin'>(() => {
    try {
      const stored = localStorage.getItem('eden_voice_lang') as any;
      if (['en', 'fr', 'sw', 'yo', 'ha', 'pidgin'].includes(stored)) return stored;
    } catch {}
    return 'en';
  });
  // TTS auto-play of Eden's replies. Defaults off so we don't surprise users.
  const [ttsEnabled, setTtsEnabled] = useState(() => {
    try { return localStorage.getItem('eden_tts_enabled') === 'true'; } catch { return false; }
  });
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [usageInfo, setUsageInfo] = useState<{ used: number; cap: number; tier: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Switched from HTMLInputElement to HTMLTextAreaElement in May 2026
  // so long messages wrap inside the bar instead of horizontally scrolling
  // off-screen on a 360-390px Android viewport. Auto-grow logic lives on
  // onChange below.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Phase G: replaced browser SpeechRecognition with MediaRecorder + Whisper.
  // Recognition ref removed — see mediaRecorderRef above.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Mirror persisted history into the display state when scope or DB rows
  // change. Transient UI flags (logSaving, bulkLog progress) are dropped here
  // — they're never useful after a reload anyway.
  useEffect(() => {
    setMessages(persistedChat.messages.map(persistedToDisplay));
  }, [persistedChat.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [attachMenuOpen]);

  // Scroll to bottom whenever the visual viewport shrinks (keyboard opens on iOS/Android)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewportChange = () => {
      // Small delay lets the browser finish repositioning before we scroll
      requestAnimationFrame(() =>
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
      );
    };
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    return () => {
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
    };
  }, []);

  // Auto-send prefill message from setup score card or other navigation triggers
  useEffect(() => {
    try {
      const prefill = sessionStorage.getItem('eden_prefill_message');
      if (prefill) {
        sessionStorage.removeItem('eden_prefill_message');
        setTimeout(() => sendMessage(prefill), 400);
      }
    } catch {}
  }, []);


  /**
   * Phase G voice: record audio with MediaRecorder, then upload to our
   * `transcribe-audio` edge function (which calls Whisper).
   *
   * Why not the browser's built-in SpeechRecognition? Because Whisper
   * handles Hausa, Yoruba, Swahili, and Nigerian Pidgin meaningfully
   * better than Chrome's SpeechRecognition (which has narrow language
   * coverage and falls over for non-English speakers).
   *
   * Flow:
   *   tap mic → start recording (mediaRecorder)
   *   tap mic again → stop, upload, transcribe, drop into input box
   *   user can edit before hitting Send
   */
  const toggleVoice = async () => {
    if (transcribing) return;

    if (listening) {
      // Stop the current recording. The 'stop' handler runs the upload.
      mediaRecorderRef.current?.stop();
      setListening(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Voice input not supported in this browser', 'error');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      showToast(err?.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Could not access microphone', 'error');
      return;
    }

    // Pick a MIME type the browser actually supports. Chrome/Edge default
    // to audio/webm;codecs=opus. Safari needs audio/mp4. Whisper handles both.
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t)) || '';
    const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      // Free the mic immediately so the OS shows it's released.
      stream.getTracks().forEach(t => t.stop());

      const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
      audioChunksRef.current = [];
      if (blob.size === 0) return;

      setTranscribing(true);
      try {
        const formData = new FormData();
        formData.append('file', blob, mimeType.includes('mp4') ? 'audio.m4a' : 'audio.webm');
        formData.append('language', voiceLang);

        const { data, error } = await supabase.functions.invoke('transcribe-audio', {
          body: formData,
        });
        if (error) throw error;
        const text = (data as any)?.text;
        if (text) {
          // Append to existing input rather than overwriting — lets the user
          // dictate in chunks.
          setInput(prev => (prev ? `${prev.trim()} ${text}` : text));
        } else {
          showToast('Could not transcribe - try speaking closer to the mic', 'warning');
        }
      } catch (err: any) {
        const msg = err?.message || 'Transcription failed';
        if (msg.includes('not configured')) {
          showToast('Voice transcription not yet configured - admin needs to set OPENAI_API_KEY', 'error');
        } else {
          showToast(msg, 'error');
        }
      } finally {
        setTranscribing(false);
      }
    };

    mediaRecorder.start();
    setListening(true);

    // Safety auto-stop at 60 seconds. Whisper handles up to 25 MB; a 60s
    // opus recording is ~500 KB — well under. Avoids hung mic sessions.
    setTimeout(() => {
      if (mediaRecorderRef.current === mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        setListening(false);
      }
    }, 60_000);
  };

  /**
   * Browser TTS for Eden's replies. Falls back to a default voice when
   * the requested language isn't available.
   *
   * Pidgin and Hausa rarely have native TTS voices in the browser — we
   * fall back to the closest English voice. The user can disable TTS via
   * the speaker toggle.
   */
  const speakText = (text: string) => {
    if (!ttsEnabled || !text) return;
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel(); // stop any in-flight speech
      const utter = new SpeechSynthesisUtterance(text.replace(/[*#`_~]/g, '').slice(0, 4000));
      // Map our voiceLang to a BCP-47 tag. Pidgin/Hausa have no widely-supported
      // tag, so fall back to en.
      const langMap: Record<string, string> = {
        en: 'en-US',
        fr: 'fr-FR',
        sw: 'sw-KE',
        yo: 'yo-NG',
        ha: 'en-NG', // best fallback
        pidgin: 'en-NG',
      };
      utter.lang = langMap[voiceLang] || 'en-US';
      // Try to pick a matching voice if installed.
      const voices = window.speechSynthesis.getVoices();
      const pref = voices.find(v => v.lang === utter.lang) || voices.find(v => v.lang.startsWith(utter.lang.slice(0, 2)));
      if (pref) utter.voice = pref;
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch {
      // swallow - TTS is non-critical
    }
  };

  const toggleTts = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    try { localStorage.setItem('eden_tts_enabled', String(next)); } catch {}
    if (!next && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const handleVoiceLangChange = (lang: typeof voiceLang) => {
    setVoiceLang(lang);
    try { localStorage.setItem('eden_voice_lang', lang); } catch {}
  };

  const addImages = async (files: FileList | null) => {
    if (!files) return;
    const newImgs: ImageAttachment[] = [];
    for (const file of Array.from(files).slice(0, 3)) {
      if (!file.type.startsWith('image/')) continue;
      const preview = URL.createObjectURL(file);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      bytes.forEach(b => binary += String.fromCharCode(b));
      const data = btoa(binary);
      newImgs.push({ data, mediaType: file.type, preview });
    }
    setPendingImages(prev => [...prev, ...newImgs].slice(0, 3));
  };

  const addFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n');
      const header = lines[0] || '';
      const dataLines = lines.slice(1).filter(l => l.trim());
      const capped = dataLines.slice(0, 200);
      const content = [header, ...capped].join('\n');
      setPendingFile({ name: file.name, content, rowCount: capped.length });
    } catch {
      showToast('Could not read file - make sure it is a plain CSV or text file', 'error');
    }
  };

  const checkForDuplicate = async (logAction: LogAction, farmId: string): Promise<string | null> => {
    const today = new Date().toISOString().split('T')[0];
    try {
      if (logAction.type === 'LOG_EGG_SALE') {
        const saleDay = logAction.sale_date || logAction.log_date || today;
        // Only check for duplicate when both customer AND amount are known - avoids false positives on multi-flock farms
        if (logAction.customer_name && logAction.total_amount) {
          const { data } = await supabase.from('egg_sales').select('id, total_eggs, total_amount').eq('farm_id', farmId).eq('sale_date', saleDay).eq('total_amount', logAction.total_amount).ilike('customer_name', `%${logAction.customer_name}%`).limit(1);
          if (data?.length) return `Egg sale to "${logAction.customer_name}" for ${logAction.total_amount} on ${saleDay} already exists`;
        }
      } else if (logAction.type === 'LOG_EXPENSE') {
        const expDay = logAction.log_date || today;
        const { data } = await supabase.from('expenses').select('id, amount').eq('farm_id', farmId).eq('incurred_on', expDay).eq('category', logAction.category || '').eq('amount', logAction.amount || 0).limit(1);
        if (data?.length) return `Expense "${logAction.description}" on ${expDay} for ${logAction.amount} already exists`;
      } else if (logAction.type === 'LOG_PURCHASE') {
        const purchDay = logAction.purchase_date || logAction.log_date || today;
        const { data } = await supabase.from('expenses').select('id, amount').eq('farm_id', farmId).eq('incurred_on', purchDay).eq('amount', logAction.amount || 0).ilike('description', `%${logAction.item_name}%`).limit(1);
        if (data?.length) return `Purchase of "${logAction.item_name}" on ${purchDay} already exists`;
      }
    } catch {}
    return null;
  };

  // Core DB write logic, reused by both single confirmLog and bulk confirmBulkLog
  const executeLogAction = async (logAction: LogAction, farmId: string, currency: string) => {
    const today = getFarmTodayISO(getFarmTimeZone(currentFarm));
    const recordDate = logAction.log_date || today;

    const findFlock = async (name?: string) => {
      if (!name) return null;
      const { data } = await supabase.from('flocks').select('id,name,current_count').eq('farm_id', farmId).ilike('name', `%${name}%`).limit(1);
      return data?.[0] || null;
    };

    if (logAction.type === 'LOG_MORTALITY') {
      const flock = await findFlock(logAction.flock_name);
      if (!flock) throw new Error(`Flock "${logAction.flock_name}" not found`);
      const { data: mortData, error: mortErr } = await supabase.from('mortality_logs').insert({
        farm_id: farmId, flock_id: flock.id,
        count: logAction.count, cause: logAction.cause || 'unknown',
        notes: logAction.notes || '',
        event_date: recordDate,
        created_by: user?.id || null,
      }).select('id');
      if (mortErr) throw new Error(`Mortality save failed: ${mortErr.message}`);
      if (!mortData?.length) throw new Error('Mortality record not saved - possible permission issue. Check you are logged in.');
      // Auto-complete any pending mortality tasks scheduled for this date
      try {
        const { data: mortTasks } = await supabase.from('tasks')
          .select('id').eq('farm_id', farmId).eq('status', 'pending')
          .gte('scheduled_for', recordDate).lte('scheduled_for', recordDate)
          .ilike('title_override', '%mort%');
        if (mortTasks?.length) {
          await supabase.from('tasks').update({ status: 'completed' }).in('id', mortTasks.map((t: any) => t.id));
        }
      } catch {}

    } else if (logAction.type === 'LOG_EGGS') {
      const flock = await findFlock(logAction.flock_name);
      if (!flock) throw new Error(`Flock "${logAction.flock_name}" not found`);
      const small = logAction.small_eggs || 0;
      const medium = logAction.medium_eggs || 0;
      const large = logAction.large_eggs || 0;
      const jumbo = logAction.jumbo_eggs || 0;
      const damaged = logAction.damaged_eggs || logAction.cracked || 0;
      const totalGood = small + medium + large + jumbo;
      const eggsPerTray = 30;
      const trays = Math.floor(totalGood / eggsPerTray);
      const { data: collData, error: collErr } = await supabase.from('egg_collections').insert({
        farm_id: farmId, flock_id: flock.id,
        // omit 'date' and 'trays_collected' - legacy columns with defaults set by migration; PostgREST schema cache issue
        collection_date: recordDate, collected_on: recordDate,
        small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo,
        damaged_eggs: damaged, broken: damaged,
        total_eggs: totalGood, trays,
        notes: logAction.notes || null, created_by: user?.id || null,
      }).select('id');
      if (collErr) throw new Error(`Egg collection save failed: ${collErr.message}`);
      if (!collData?.length) throw new Error('Collection not saved - possible permission issue. Check you are logged in.');
      const { data: inv } = await supabase.from('egg_inventory').select('*').eq('farm_id', farmId).maybeSingle();
      if (inv) {
        await supabase.from('egg_inventory').update({ small_eggs: (inv.small_eggs || 0) + small, medium_eggs: (inv.medium_eggs || 0) + medium, large_eggs: (inv.large_eggs || 0) + large, jumbo_eggs: (inv.jumbo_eggs || 0) + jumbo, last_updated: new Date().toISOString() }).eq('farm_id', farmId);
      } else {
        await supabase.from('egg_inventory').insert({ farm_id: farmId, small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo, last_updated: new Date().toISOString() });
      }
      // Auto-complete any pending egg-collection tasks scheduled for this date
      try {
        const { data: eggTasks } = await supabase.from('tasks')
          .select('id').eq('farm_id', farmId).eq('status', 'pending')
          .gte('scheduled_for', recordDate).lte('scheduled_for', recordDate)
          .ilike('title_override', '%egg%');
        if (eggTasks?.length) {
          await supabase.from('tasks').update({ status: 'completed' }).in('id', eggTasks.map((t: any) => t.id));
        }
      } catch {}

    } else if (logAction.type === 'LOG_EGG_SALE') {
      const smallSold = logAction.small_eggs_sold || 0;
      const mediumSold = logAction.medium_eggs_sold || 0;
      const largeSold = logAction.large_eggs_sold || 0;
      const jumboSold = logAction.jumbo_eggs_sold || 0;
      const traysCount = logAction.trays_sold || 0;
      // total_eggs: prefer per-size breakdown; fall back to trays * 30
      const totalSoldFromBreakdown = smallSold + mediumSold + largeSold + jumboSold;
      const totalSold = totalSoldFromBreakdown > 0 ? totalSoldFromBreakdown : traysCount * 30;
      const unitPrice = logAction.small_price || logAction.medium_price || logAction.large_price || logAction.jumbo_price || 0;
      const totalAmount = logAction.total_amount ||
        (totalSoldFromBreakdown > 0
          ? (smallSold * (logAction.small_price || 0)) + (mediumSold * (logAction.medium_price || 0)) +
            (largeSold * (logAction.large_price || 0)) + (jumboSold * (logAction.jumbo_price || 0))
          : traysCount * unitPrice);
      const saleDay = logAction.sale_date || logAction.log_date || today;
      // For legacy schema compat: find any active flock (original egg_sales had flock_id NOT NULL)
      const saleFlock = logAction.flock_name
        ? await findFlock(logAction.flock_name)
        : ((await supabase.from('flocks').select('id').eq('farm_id', farmId).eq('status', 'active').limit(1)).data?.[0] || null);
      // Mirror LogSaleModal's insert exactly - same columns, same order, no legacy fields
      const salePayload = {
        farm_id: farmId,
        flock_id: saleFlock?.id || null,
        sold_on: saleDay,
        sale_date: saleDay,
        trays: traysCount || Math.floor(totalSold / 30),
        unit_price: unitPrice,
        customer_name: logAction.customer_name || null,
        customer_phone: logAction.customer_phone || null,
        small_eggs_sold: smallSold, medium_eggs_sold: mediumSold, large_eggs_sold: largeSold, jumbo_eggs_sold: jumboSold,
        small_price: logAction.small_price || 0, medium_price: logAction.medium_price || 0,
        large_price: logAction.large_price || 0, jumbo_price: logAction.jumbo_price || 0,
        total_eggs: totalSold,
        total_amount: totalAmount,
        payment_status: logAction.payment_status || 'paid',
        notes: logAction.notes || null,
        sold_by: user?.id || null,
      };
      const { data: saleData, error: saleInsertErr } = await supabase.from('egg_sales').insert(salePayload).select('id');
      if (saleInsertErr) throw new Error(`Egg sale save failed: ${saleInsertErr.message}`);
      if (!saleData?.length) throw new Error('Sale not saved - possible permission issue. Try logging out and back in.');
      const { data: inv } = await supabase.from('egg_inventory').select('*').eq('farm_id', farmId).maybeSingle();
      if (inv) {
        await supabase.from('egg_inventory').update({
          small_eggs: Math.max(0, (inv.small_eggs || 0) - smallSold),
          medium_eggs: Math.max(0, (inv.medium_eggs || 0) - mediumSold),
          large_eggs: Math.max(0, (inv.large_eggs || 0) - largeSold),
          jumbo_eggs: Math.max(0, (inv.jumbo_eggs || 0) - jumboSold),
          last_updated: new Date().toISOString(),
        }).eq('farm_id', farmId);
      }
    } else if (logAction.type === 'LOG_BIRD_SALE') {
      const flock = await findFlock(logAction.flock_name);
      if (!flock) throw new Error(`Flock "${logAction.flock_name}" not found`);
      const birdsSold = logAction.birds_sold || 0;
      const pricePerBird = logAction.price_per_bird || 0;
      const totalAmount = logAction.total_amount || (birdsSold * pricePerBird);
      const saleMethod = pricePerBird > 0 ? 'per_bird' : 'lump_sum';
      const birdSaleDay = logAction.sale_date || logAction.log_date || today;
      const { data: birdSaleData, error: birdSaleErr } = await supabase.from('bird_sales').insert({
        farm_id: farmId, flock_id: flock.id, sale_date: birdSaleDay,
        birds_sold: birdsSold, price_per_bird: pricePerBird || null, total_amount: totalAmount,
        sale_method: saleMethod, sale_type: 'sale',
        customer_name: logAction.customer_name || null, customer_phone: logAction.customer_phone || null,
        payment_status: logAction.payment_status || 'paid',
        amount_paid: logAction.payment_status === 'pending' ? 0 : totalAmount,
        amount_pending: logAction.payment_status === 'pending' ? totalAmount : 0,
        notes: logAction.notes || null, recorded_by: user?.id || null,
      }).select('id');
      if (birdSaleErr) throw new Error(`Bird sale save failed: ${birdSaleErr.message}`);
      if (!birdSaleData?.length) throw new Error('Bird sale not saved - possible permission issue.');

      // BUG-020: decrement the flock/pond's current_count to match the sold
      // amount, same as the manual sale modal does. Without this, every
      // Eden-driven sale leaves the count inflated and the dashboard
      // reports stale stock.
      if (birdsSold > 0 && flock?.id) {
        const remaining = Math.max(0, (flock.current_count || 0) - birdsSold);
        await supabase
          .from('flocks')
          .update({ current_count: remaining })
          .eq('id', flock.id);
      }

    } else if (logAction.type === 'LOG_PURCHASE') {
      const invCat = logAction.inventory_category!;
      const expenseCat = invCat === 'feed' ? 'feed' : invCat === 'Medication' ? 'medication' : invCat === 'Equipment' ? 'equipment' : 'other';
      const flock = logAction.flock_name ? await findFlock(logAction.flock_name) : null;
      const purchaseDate = logAction.purchase_date || logAction.log_date || today;
      const { data: purchaseData, error: purchaseErr } = await supabase.from('expenses').insert({
        user_id: user?.id || null,
        farm_id: farmId, category: expenseCat, amount: logAction.amount,
        description: logAction.description || `${logAction.quantity} ${logAction.unit} ${logAction.item_name}`,
        currency, incurred_on: purchaseDate,
        flock_id: flock?.id || null, paid_from_profit: logAction.paid_from_profit ?? false,
      }).select('id');
      if (purchaseErr) throw new Error(`Purchase save failed: ${purchaseErr.message}`);
      if (!purchaseData?.length) throw new Error('Purchase not saved - possible permission issue.');
      if (invCat === 'feed') {
        let { data: ft } = await supabase.from('feed_types').select('id').eq('farm_id', farmId).ilike('name', logAction.item_name!).maybeSingle();
        if (!ft) {
          const { data: newFt } = await supabase.from('feed_types').insert({ farm_id: farmId, name: logAction.item_name, unit: logAction.unit || 'bags' }).select('id').single();
          ft = newFt;
        }
        if (ft) {
          const { data: existing } = await supabase.from('feed_inventory').select('id, quantity_bags').eq('farm_id', farmId).eq('feed_type_id', ft.id).maybeSingle();
          if (existing) {
            await supabase.from('feed_inventory').update({ quantity_bags: (existing.quantity_bags || 0) + (logAction.quantity || 0), last_updated: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('feed_inventory').insert({ farm_id: farmId, feed_type_id: ft.id, quantity_bags: logAction.quantity || 0, last_updated: new Date().toISOString() });
          }
        }
      } else {
        const { data: existing } = await supabase.from('other_inventory').select('id, quantity').eq('farm_id', farmId).ilike('item_name', logAction.item_name!).eq('category', invCat).maybeSingle();
        if (existing) {
          await supabase.from('other_inventory').update({ quantity: (existing.quantity || 0) + (logAction.quantity || 0) }).eq('id', existing.id);
        } else {
          await supabase.from('other_inventory').insert({ farm_id: farmId, item_name: logAction.item_name, category: invCat, quantity: logAction.quantity || 1, unit: logAction.unit || 'units' });
        }
      }

      // When the purchase is a medication, also drop a row into vet_logs
      // so the medication shows up in withdrawal-period tracking on the
      // Vet Log page. We do this last so a vet_logs RLS hiccup doesn't
      // poison the expense+inventory chain that already succeeded.
      // The farmer can edit/delete the auto-created entry from the Vet
      // Log page if Eden got something wrong.
      if (invCat === 'Medication') {
        const vetPayload = {
          farm_id: farmId,
          flock_id: flock?.id || null,
          visit_date: purchaseDate,
          vet_name: logAction.vet_name || null,
          diagnosis: logAction.diagnosis || null,
          medication: logAction.item_name || null,
          dosage: logAction.dosage || null,
          withdrawal_period_days: typeof logAction.withdrawal_period_days === 'number' ? logAction.withdrawal_period_days : null,
          notes: `[Auto-logged by Eden from purchase ${logAction.amount} ${currency}]`,
          created_by: user?.id || null,
          updated_at: new Date().toISOString(),
        };
        const { error: vetErr } = await supabase.from('vet_logs').insert(vetPayload);
        if (vetErr) console.warn('[Eden LOG_PURCHASE] Vet log not created:', vetErr);
      }

    } else if (logAction.type === 'LOG_EXPENSE') {
      // Normalise category to valid DB enum values - guard against AI returning 'utilities', 'chick_purchase', etc.
      const VALID_EXPENSE_CATEGORIES = ['feed', 'medication', 'equipment', 'labor', 'chicks purchase', 'transport', 'other'];
      const rawCat = (logAction.category || '').toLowerCase().trim();
      const categoryMap: Record<string, string> = {
        utilities: 'other', utility: 'other', fuel: 'other', power: 'other', electricity: 'other',
        chick_purchase: 'chicks purchase', chicks_purchase: 'chicks purchase', 'chick purchase': 'chicks purchase',
        labour: 'labor', wages: 'labor', salary: 'labor',
      };
      const normalisedCategory = categoryMap[rawCat] ?? (VALID_EXPENSE_CATEGORIES.includes(rawCat) ? rawCat : 'other');
      const { data: expData, error: expErr } = await supabase.from('expenses').insert({
        user_id: user?.id || null,
        farm_id: farmId, category: normalisedCategory, amount: logAction.amount,
        description: logAction.description, currency, incurred_on: recordDate,
      }).select('id');
      if (expErr) throw new Error(`Expense save failed: ${expErr.message}`);
      if (!expData?.length) throw new Error('Expense not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_JOURNAL') {
      // Eden writes a note to the Farm Journal. Uses the user's auth
      // context so RLS lets the insert through, but author_kind is
      // 'eden' so the timeline renders the sparkle icon + amber chip.
      const flock = logAction.flock_name ? await findFlock(logAction.flock_name) : null;
      const entryType = logAction.journal_entry_type || 'auto_summary';
      const body = logAction.journal_body || logAction.notes || logAction.description || '';
      if (!body.trim()) throw new Error('Journal entry requires a body.');
      const { error: jErr } = await supabase.from('journal_entries').insert({
        farm_id: farmId,
        flock_id: flock?.id || null,
        author_id: user?.id || null,
        author_role: null,        // Eden has no farm role
        author_kind: 'eden',      // → sparkle + amber chip in JournalPage
        channel: 'notes',         // Eden writes notes, not activity rows
        entry_type: entryType,
        title: logAction.journal_title || null,
        body,
        metadata: { eden_generated: true, log_date: recordDate },
      });
      if (jErr) throw new Error(`Journal entry save failed: ${jErr.message}`);

    } else if (logAction.type === 'LOG_WEIGHT') {
      const flock = await findFlock(logAction.flock_name);
      if (!flock) throw new Error(`Flock "${logAction.flock_name}" not found`);
      // table: weight_logs, column: average_weight (renamed from weight_kg)
      const { data: weightData, error: weightErr } = await supabase.from('weight_logs').insert({
        farm_id: farmId, flock_id: flock.id,
        average_weight: logAction.avg_weight_kg,
        sample_size: logAction.sample_size || 10,
        date: recordDate,
        recorded_by: user?.id || null,
      }).select('id');
      if (weightErr) throw new Error(`Weight save failed: ${weightErr.message}`);
      if (!weightData?.length) throw new Error('Weight record not saved - possible permission issue.');
      // Auto-complete any pending weight tasks scheduled for this date
      try {
        const { data: weightTasks } = await supabase.from('tasks')
          .select('id').eq('farm_id', farmId).eq('status', 'pending')
          .gte('scheduled_for', recordDate).lte('scheduled_for', recordDate)
          .ilike('title_override', '%weight%');
        if (weightTasks?.length) {
          await supabase.from('tasks').update({ status: 'completed' }).in('id', weightTasks.map((t: any) => t.id));
        }
      } catch {}

    } else if (logAction.type === 'LOG_FEED_USAGE') {
      const { data: stock } = await supabase.from('feed_stock').select('id,current_stock_bags').eq('farm_id', farmId).ilike('feed_type', `%${logAction.feed_type}%`).limit(1);
      if (stock?.[0]) {
        await supabase.from('feed_stock').update({ current_stock_bags: Math.max(0, (stock[0].current_stock_bags || 0) - (logAction.bags_used || 0)) }).eq('id', stock[0].id);
      }

    } else if (logAction.type === 'COMPLETE_TASK') {
      const hint = logAction.task_title_hint || '';
      const { data: matchedTasks } = await supabase.from('tasks')
        .select('id').eq('farm_id', farmId).eq('status', 'pending')
        .ilike('title_override', `%${hint}%`).limit(10);
      if (matchedTasks?.length) {
        await supabase.from('tasks').update({ status: 'completed' }).in('id', matchedTasks.map((t: any) => t.id));
      }

    } else if (logAction.type === 'CREATE_TASK') {
      if (!logAction.title) throw new Error('Task title is required');
      const taskDate = logAction.due_date || recordDate;
      // window_start / window_end are NOT NULL in the schema - default to 09:00 local with 60-min window
      const rawWindowStart = new Date(`${taskDate}T09:00:00`);
      const windowBase = isNaN(rawWindowStart.getTime()) ? new Date() : rawWindowStart;
      const windowStartISO = windowBase.toISOString();
      const windowEndISO = new Date(windowBase.getTime() + 60 * 60 * 1000).toISOString();
      const { data: taskData, error: taskErr } = await supabase.from('tasks').insert({
        farm_id: farmId,
        title_override: logAction.title,
        notes: logAction.notes || null,
        scheduled_for: taskDate,
        due_date: taskDate,
        scheduled_time: '09:00',
        window_start: windowStartISO,
        window_end: windowEndISO,
        status: 'pending',
        requires_input: false,
        is_archived: false,
      }).select('id');
      if (taskErr) throw new Error(`Task creation failed: ${taskErr.message}`);
      if (!taskData?.length) throw new Error('Task not saved - possible permission issue.');

    // ─── Fish (aquaculture) actions ───────────────────────────────────────
    } else if (logAction.type === 'LOG_WATER_QUALITY') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const { data: wqData, error: wqErr } = await supabase.from('water_quality_logs').insert({
        farm_id: farmId, flock_id: flock.id,
        logged_at: recordDate,
        temperature_c: logAction.temperature_c ?? null,
        dissolved_oxygen: logAction.dissolved_oxygen ?? null,
        ph: logAction.ph ?? null,
        ammonia_mgl: logAction.ammonia_mgl ?? null,
        nitrite_mgl: logAction.nitrite_mgl ?? null,
        notes: logAction.notes || null,
      }).select('id');
      if (wqErr) throw new Error(`Water quality save failed: ${wqErr.message}`);
      if (!wqData?.length) throw new Error('Water quality record not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_POND_INSPECTION') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const { data: piData, error: piErr } = await supabase.from('pond_inspections').insert({
        farm_id: farmId, flock_id: flock.id,
        inspection_date: recordDate,
        water_clarity: logAction.water_clarity || null,
        fish_behavior: logAction.fish_behavior || null,
        feeding_response: logAction.feeding_response || null,
        dead_fish_count: logAction.dead_fish_count ?? 0,
        notes: logAction.notes || null,
        inspected_by: user?.id || null,
      }).select('id');
      if (piErr) throw new Error(`Pond inspection save failed: ${piErr.message}`);
      if (!piData?.length) throw new Error('Pond inspection not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_STOCKING') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const fingerlingCount = logAction.fingerling_count || 0;
      const totalCost = logAction.total_cost ?? (logAction.cost_per_fingerling ? logAction.cost_per_fingerling * fingerlingCount : null);
      const { data: stockData, error: stockErr } = await supabase.from('stocking_events').insert({
        farm_id: farmId, flock_id: flock.id,
        stocked_at: logAction.stocked_at || recordDate,
        species: logAction.species || 'catfish',
        fingerling_count: fingerlingCount,
        source: logAction.source || null,
        cost_per_fingerling: logAction.cost_per_fingerling ?? null,
        total_cost: totalCost,
        notes: logAction.notes || null,
      }).select('id');
      if (stockErr) throw new Error(`Stocking save failed: ${stockErr.message}`);
      if (!stockData?.length) throw new Error('Stocking record not saved - possible permission issue.');
      if (fingerlingCount > 0) {
        await supabase.from('flocks').update({ current_count: (flock.current_count || 0) + fingerlingCount }).eq('id', flock.id).eq('farm_id', farmId);
      }

    } else if (logAction.type === 'LOG_HARVEST') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const totalAmount = logAction.total_amount ?? (logAction.price_per_kg && logAction.total_weight_kg ? logAction.price_per_kg * logAction.total_weight_kg : null);
      const { data: harvData, error: harvErr } = await supabase.from('harvest_records').insert({
        farm_id: farmId, flock_id: flock.id,
        harvested_at: logAction.harvested_at || recordDate,
        total_weight_kg: logAction.total_weight_kg || 0,
        price_per_kg: logAction.price_per_kg ?? null,
        total_amount: totalAmount,
        buyer_name: logAction.buyer_name || null,
        payment_status: logAction.payment_status || 'pending',
        notes: logAction.notes || null,
      }).select('id');
      if (harvErr) throw new Error(`Fish harvest save failed: ${harvErr.message}`);
      if (!harvData?.length) throw new Error('Fish harvest record not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_SAMPLING') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const sampleSize = logAction.sample_size || 10;
      const abwG = logAction.abw_g || 0;
      // Synthesise individual_weights_g - AI-driven sampling simplification (UI form allows per-fish entry)
      const individualWeights = Array(sampleSize).fill(abwG);
      const { data: sampData, error: sampErr } = await supabase.from('sampling_events').insert({
        farm_id: farmId, flock_id: flock.id,
        sampled_at: logAction.sampled_at || recordDate,
        sample_size: sampleSize,
        individual_weights_g: individualWeights,
        notes: logAction.notes || null,
        created_by: user?.id || null,
      }).select('id');
      if (sampErr) throw new Error(`Sampling save failed: ${sampErr.message}`);
      if (!sampData?.length) throw new Error('Sampling record not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_FISH_LOSS') {
      const pondName = logAction.pond_name || logAction.flock_name;
      const flock = await findFlock(pondName);
      if (!flock) throw new Error(`Pond "${pondName}" not found`);
      const { data: fishLossData, error: fishLossErr } = await supabase.from('mortality_logs').insert({
        farm_id: farmId, flock_id: flock.id,
        count: logAction.count, cause: logAction.cause || 'unknown',
        notes: logAction.notes || '',
        event_date: recordDate,
        created_by: user?.id || null,
      }).select('id');
      if (fishLossErr) throw new Error(`Fish loss save failed: ${fishLossErr.message}`);
      if (!fishLossData?.length) throw new Error('Fish loss record not saved - possible permission issue.');

    // ─── Rabbit actions ───────────────────────────────────────────────────
    } else if (logAction.type === 'LOG_BREEDING') {
      if (!logAction.doe_tag) throw new Error('doe_tag is required for LOG_BREEDING');
      if (!logAction.buck_tag) throw new Error('buck_tag is required for LOG_BREEDING');
      const matingDate = logAction.mating_date || recordDate;
      let expectedKindling = logAction.expected_kindling_date;
      if (!expectedKindling) {
        const d = new Date(matingDate);
        d.setDate(d.getDate() + 31);
        expectedKindling = d.toISOString().split('T')[0];
      }
      const rabbitryForBreeding = await findFlock(logAction.rabbitry_name || logAction.flock_name);
      const { data: breedData, error: breedErr } = await supabase.from('breeding_events').insert({
        farm_id: farmId,
        flock_id: rabbitryForBreeding?.id || null,
        doe_tag: logAction.doe_tag,
        buck_tag: logAction.buck_tag,
        mating_date: matingDate,
        expected_kindling_date: expectedKindling,
        notes: logAction.notes || null,
      }).select('id');
      if (breedErr) throw new Error(`Breeding event save failed: ${breedErr.message}`);
      if (!breedData?.length) throw new Error('Breeding event not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_KINDLING') {
      if (!logAction.doe_tag) throw new Error('doe_tag is required for LOG_KINDLING');
      const kindlingDate = logAction.kindling_date || recordDate;
      // Fuzzy-match the closest preceding breeding_event for this doe within 35 days
      let breedingEventId: string | null = null;
      try {
        const lookback = new Date(kindlingDate);
        lookback.setDate(lookback.getDate() - 35);
        const { data: beMatch } = await supabase.from('breeding_events')
          .select('id').eq('farm_id', farmId).eq('doe_tag', logAction.doe_tag)
          .gte('mating_date', lookback.toISOString().split('T')[0])
          .lte('mating_date', kindlingDate)
          .order('mating_date', { ascending: false }).limit(1);
        breedingEventId = beMatch?.[0]?.id || null;
      } catch {}
      const { data: litterData, error: litterErr } = await supabase.from('litters').insert({
        farm_id: farmId,
        breeding_event_id: breedingEventId,
        doe_tag: logAction.doe_tag,
        kindling_date: kindlingDate,
        kits_born_alive: logAction.kits_born_alive ?? 0,
        kits_born_dead: logAction.kits_born_dead ?? 0,
        notes: logAction.notes || null,
      }).select('id');
      if (litterErr) throw new Error(`Kindling save failed: ${litterErr.message}`);
      if (!litterData?.length) throw new Error('Kindling record not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_WEANING') {
      if (!logAction.doe_tag) throw new Error('doe_tag is required for LOG_WEANING');
      const { data: latestLitter } = await supabase.from('litters')
        .select('id').eq('farm_id', farmId).eq('doe_tag', logAction.doe_tag)
        .is('kits_weaned', null).order('kindling_date', { ascending: false }).limit(1);
      if (!latestLitter?.length) throw new Error(`No un-weaned litter found for doe "${logAction.doe_tag}"`);
      const { error: weanErr } = await supabase.from('litters')
        .update({ kits_weaned: logAction.kits_weaned ?? 0, weaning_date: logAction.weaning_date || recordDate })
        .eq('id', latestLitter[0].id).eq('farm_id', farmId);
      if (weanErr) throw new Error(`Weaning update failed: ${weanErr.message}`);

    } else if (logAction.type === 'REGISTER_RABBIT') {
      if (!logAction.tag) throw new Error('tag is required for REGISTER_RABBIT');
      if (!logAction.sex) throw new Error('sex (doe/buck) is required for REGISTER_RABBIT');
      const rabbitryForReg = await findFlock(logAction.rabbitry_name || logAction.flock_name);
      const { data: rabbitData, error: rabbitErr } = await supabase.from('rabbits').insert({
        farm_id: farmId,
        flock_id: rabbitryForReg?.id || null,
        tag: logAction.tag, sex: logAction.sex,
        breed: logAction.breed || null,
        birth_date: logAction.birth_date || null,
        sire_tag: logAction.sire_tag || null,
        dam_tag: logAction.dam_tag || null,
        status: 'active',
        notes: logAction.notes || null,
      }).select('id');
      if (rabbitErr) {
        if (rabbitErr.code === '23505') throw new Error(`Rabbit tag "${logAction.tag}" already exists on this farm`);
        throw new Error(`Rabbit registration failed: ${rabbitErr.message}`);
      }
      if (!rabbitData?.length) throw new Error('Rabbit not registered - possible permission issue.');

    } else if (logAction.type === 'LOG_RABBIT_LOSS') {
      const rabbitryName = logAction.rabbitry_name || logAction.flock_name;
      const flock = await findFlock(rabbitryName);
      if (!flock) throw new Error(`Rabbitry "${rabbitryName}" not found`);
      const { data: rLossData, error: rLossErr } = await supabase.from('mortality_logs').insert({
        farm_id: farmId, flock_id: flock.id,
        count: logAction.count, cause: logAction.cause || 'unknown',
        notes: logAction.notes || '',
        event_date: recordDate,
        created_by: user?.id || null,
      }).select('id');
      if (rLossErr) throw new Error(`Rabbit loss save failed: ${rLossErr.message}`);
      if (!rLossData?.length) throw new Error('Rabbit loss record not saved - possible permission issue.');

    } else if (logAction.type === 'LOG_RABBIT_HARVEST' || logAction.type === 'LOG_RABBIT_SALE') {
      // Accept either action name during the harvest→sales rename
      // transition. The edge function may still emit LOG_RABBIT_HARVEST
      // until it ships its own copy of the action map.
      const rabbitryName = logAction.rabbitry_name || logAction.flock_name;
      const flock = await findFlock(rabbitryName);
      if (!flock) throw new Error(`Rabbitry "${rabbitryName}" not found`);
      const saleCount = logAction.count || 0;
      // rabbit_sales (renamed from rabbit_harvest_records May 2026).
      // sold_at replaces harvested_at; weights / price / buyer fields
      // are unchanged.
      const { data: rsData, error: rsErr } = await supabase.from('rabbit_sales').insert({
        farm_id: farmId, flock_id: flock.id,
        sold_at: logAction.sale_date || logAction.harvest_date || recordDate,
        count: saleCount,
        total_live_weight_kg: logAction.total_live_weight_kg ?? null,
        total_carcass_weight_kg: logAction.total_carcass_weight_kg ?? null,
        price_per_kg: logAction.price_per_kg ?? null,
        total_amount: logAction.total_amount ?? logAction.sale_price ?? null,
        buyer_name: logAction.buyer_name || null,
        payment_status: logAction.payment_status || 'pending',
        notes: logAction.notes || null,
      }).select('id');
      if (rsErr) throw new Error(`Rabbit sale save failed: ${rsErr.message}`);
      if (!rsData?.length) throw new Error('Rabbit sale not saved - possible permission issue.');
      if (saleCount > 0) {
        await supabase.from('flocks').update({ current_count: Math.max(0, (flock.current_count || 0) - saleCount) }).eq('id', flock.id).eq('farm_id', farmId);
      }

    // ─── Phase 6 onboarding actions ────────────────────────────────────
    // CREATE_FARM creates a new farm AND adds the current user as owner
    // in farm_members. The farmId argument is ignored - we don't have one
    // yet. Subsequent CREATE_FLOCK/POND/RABBITRY rely on farm_name to
    // resolve back to the just-created farm.
    } else if (logAction.type === 'CREATE_FARM') {
      if (!user?.id) throw new Error('Not signed in');
      const farmName = (logAction.name || logAction.farm_name || '').trim();
      if (!farmName) throw new Error('Farm name required');
      const species = logAction.species || 'poultry';
      const { data: newFarm, error: cfErr } = await supabase
        .from('farms')
        .insert({
          name: farmName,
          owner_id: user.id,
          farm_type: species,
          country: logAction.country || null,
          location: logAction.location || null,
          currency_code: logAction.currency_code || logAction.currency || null,
        })
        .select('id, name, farm_type')
        .single();
      if (cfErr || !newFarm) throw new Error(`Create farm failed: ${cfErr?.message || 'unknown'}`);
      // Add the user as owner - table may have a trigger; this is defensive.
      await supabase
        .from('farm_members')
        .insert({ farm_id: newFarm.id, user_id: user.id, role: 'owner' })
        .then(({ error }) => {
          if (error && !/duplicate|already/i.test(error.message)) {
            console.warn('farm_members insert warning:', error.message);
          }
        });

    // CREATE_FLOCK / CREATE_POND / CREATE_RABBITRY - all insert into
    // `flocks` with the species-appropriate `type`. Resolves the parent
    // farm by name from the just-created CREATE_FARM in this session.
    } else if (
      logAction.type === 'CREATE_FLOCK' ||
      logAction.type === 'CREATE_POND' ||
      logAction.type === 'CREATE_RABBITRY'
    ) {
      const targetFarmName = (logAction.farm_name || '').trim();
      let targetFarmIdLocal = farmId;
      if (targetFarmName) {
        const { data: foundFarm } = await supabase
          .from('farms')
          .select('id, owner_id')
          .ilike('name', targetFarmName)
          .eq('owner_id', user?.id ?? '')
          .limit(1)
          .maybeSingle();
        if (foundFarm) targetFarmIdLocal = foundFarm.id;
      }
      if (!targetFarmIdLocal) throw new Error('Could not find the farm to add to');
      const entityName = (logAction.name || logAction.flock_name || '').trim();
      if (!entityName) throw new Error('Name required');
      // BUG-008 / BUG-033: don't hardcode Catfish - respect what Eden said.
      // Same fish_type / bird_type fields the onboarding flow uses.
      const normalizeFish = (s: string): string => {
        const k = s.toLowerCase();
        if (k.includes('tilapia')) return 'Tilapia';
        if (k.includes('catfish') || k.includes('clarias')) return 'Catfish';
        if (k.includes('salmon')) return 'Salmon';
        if (k.includes('trout')) return 'Trout';
        if (k.includes('carp')) return 'Carp';
        if (k.includes('shrimp') || k.includes('prawn')) return 'Shrimp';
        return s.charAt(0).toUpperCase() + s.slice(1);
      };
      const fishType: string | undefined = (logAction as any).fish_type;
      const birdType: string | undefined = (logAction as any).bird_type;
      const flockType =
        logAction.type === 'CREATE_POND'
          ? (fishType ? normalizeFish(fishType) : 'Catfish')
          : logAction.type === 'CREATE_RABBITRY'
          ? 'Rabbitry'
          : (birdType || (logAction.current_phase === 'layer' ? 'Layer' : 'Broiler'));
      const initialCount = Number(logAction.count) || 0;
      // Accept any of the date aliases Eden might emit. Pre-fix, only
      // `stocked_date` was honoured - which meant when the user said
      // "Pen 1, 100 layers, arrived 6 months ago" inline, Eden would
      // emit CREATE_FLOCK without a date and the flock got today's date,
      // showing "1 week old / Chick phase" for what was supposed to be
      // a 27-week-old layer flock. Greg flagged on May 2026.
      const stockedDate =
        (logAction as any).stocked_date ||
        (logAction as any).stocked_at ||
        (logAction as any).arrival_date ||
        (logAction as any).arrived_at ||
        recordDate;
      const { error: fErr } = await supabase.from('flocks').insert({
        farm_id: targetFarmIdLocal,
        user_id: user?.id ?? null,
        name: entityName,
        type: flockType,
        breed: logAction.breed || null,
        initial_count: initialCount,
        current_count: initialCount,
        start_date: stockedDate,
        arrival_date: stockedDate,
        status: 'active',
      });
      if (fErr) throw new Error(`Create ${logAction.type.replace('CREATE_', '').toLowerCase()} failed: ${fErr.message}`);

    // ONBOARDING_COMPLETE / SWITCH_TO_FORM are control signals - the
    // confirmLog wrapper handles UI state, here we just flip the
    // profiles.onboarding_status accordingly.
    } else if (logAction.type === 'ONBOARDING_COMPLETE') {
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ onboarding_status: 'completed', onboarding_completed: true })
          .eq('id', user.id);
      }
    } else if (logAction.type === 'SWITCH_TO_FORM') {
      if (user?.id) {
        await supabase
          .from('profiles')
          .update({ onboarding_status: 'chose_form' })
          .eq('id', user.id);
      }
    }
  };

  const confirmLog = async (messageId: string, logAction: LogAction) => {
    // In cross-farm mode the action targets a specific farm via target_farm_id.
    // In single-farm mode it always targets currentFarm.
    const targetFarmId = crossFarm
      ? (logAction.target_farm_id ?? null)
      : (currentFarm?.id ?? null);

    if (!targetFarmId) {
      if (crossFarm) {
        showToast('Eden did not specify which farm - re-ask and mention the farm name', 'error');
      } else {
        showToast('Please select a farm first', 'error');
      }
      return;
    }

    // Duplicate detection for single logs
    const dupeMsg = await checkForDuplicate(logAction, targetFarmId);
    if (dupeMsg) {
      const ok = window.confirm(`⚠️ Possible duplicate detected:\n${dupeMsg}\n\nSave anyway?`);
      if (!ok) return;
    }

    // Show saving spinner - do NOT set logConfirmed yet (only after DB write confirmed)
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logSaving: true, logError: undefined } : m));
    const currency = logAction.currency || 'XAF';

    try {
      await executeLogAction(logAction, targetFarmId, currency);

      // Only set logConfirmed AFTER the insert actually succeeded
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logSaving: false, logConfirmed: true } : m));
      // Persist the confirmation flag (best-effort).
      void persistedChat.setLogConfirmed(messageId, true);

      if (logAction.type === 'LOG_MORTALITY') {
        showToast(`Logged ${logAction.count} deaths in "${logAction.flock_name}"`, 'success');
      } else if (logAction.type === 'LOG_EGGS') {
        const total = (logAction.small_eggs||0)+(logAction.medium_eggs||0)+(logAction.large_eggs||0)+(logAction.jumbo_eggs||0);
        showToast(`Logged ${total} eggs from "${logAction.flock_name}"`, 'success');
      } else if (logAction.type === 'LOG_EGG_SALE') {
        const total = (logAction.small_eggs_sold||0)+(logAction.medium_eggs_sold||0)+(logAction.large_eggs_sold||0)+(logAction.jumbo_eggs_sold||0);
        showToast(`Logged sale of ${total || (logAction.trays_sold || 0) * 30} eggs`, 'success');
      } else if (logAction.type === 'LOG_BIRD_SALE') {
        showToast(`Logged sale of ${logAction.birds_sold} birds`, 'success');
      } else if (logAction.type === 'LOG_PURCHASE') {
        const emoji = logAction.inventory_category === 'feed' ? '🌾' : logAction.inventory_category === 'Medication' ? '💊' : logAction.inventory_category === 'Equipment' ? '🔧' : '📦';
        showToast(`${emoji} ${logAction.item_name} logged`, 'success');
      } else if (logAction.type === 'LOG_EXPENSE') {
        showToast(`Expense logged: ${logAction.description}`, 'success');
      } else if (logAction.type === 'LOG_WEIGHT') {
        showToast(`Weight logged for "${logAction.flock_name}"`, 'success');
      } else if (logAction.type === 'LOG_FEED_USAGE') {
        showToast(`Recorded ${logAction.bags_used} bag(s) of ${logAction.feed_type} used`, 'success');
      } else if (logAction.type === 'CREATE_TASK') {
        showToast(`Task added: "${logAction.title}"`, 'success');
      } else if (logAction.type === 'COMPLETE_TASK') {
        showToast(`Task marked as complete`, 'success');
      } else if (logAction.type === 'LOG_WATER_QUALITY') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Water quality logged for "${pond}"`, 'success');
      } else if (logAction.type === 'LOG_POND_INSPECTION') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Pond inspection saved for "${pond}"`, 'success');
      } else if (logAction.type === 'LOG_STOCKING') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Stocked ${logAction.fingerling_count?.toLocaleString() || 0} fingerlings into "${pond}"`, 'success');
      } else if (logAction.type === 'LOG_HARVEST') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Fish harvest logged for "${pond}": ${logAction.total_weight_kg} kg`, 'success');
      } else if (logAction.type === 'LOG_SAMPLING') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Sampling logged for "${pond}": ABW ${logAction.abw_g} g`, 'success');
      } else if (logAction.type === 'LOG_FISH_LOSS') {
        const pond = logAction.pond_name || logAction.flock_name;
        showToast(`Logged ${logAction.count} fish loss in "${pond}"`, 'success');
      } else if (logAction.type === 'LOG_BREEDING') {
        showToast(`Breeding recorded: ${logAction.doe_tag} × ${logAction.buck_tag}`, 'success');
      } else if (logAction.type === 'LOG_KINDLING') {
        showToast(`Kindling recorded for doe ${logAction.doe_tag}: ${logAction.kits_born_alive} kits alive`, 'success');
      } else if (logAction.type === 'LOG_WEANING') {
        showToast(`Weaning logged: ${logAction.kits_weaned} kits weaned from doe ${logAction.doe_tag}`, 'success');
      } else if (logAction.type === 'REGISTER_RABBIT') {
        showToast(`Rabbit "${logAction.tag}" (${logAction.sex}) registered`, 'success');
      } else if (logAction.type === 'LOG_RABBIT_LOSS') {
        const rabbitry = logAction.rabbitry_name || logAction.flock_name;
        showToast(`Logged ${logAction.count} rabbit loss in "${rabbitry}"`, 'success');
      } else if (logAction.type === 'LOG_RABBIT_HARVEST') {
        const rabbitry = logAction.rabbitry_name || logAction.flock_name;
        showToast(`Rabbit harvest logged: ${logAction.count} rabbits from "${rabbitry}"`, 'success');
      }
    } catch (err: any) {
      console.error('[Eden AI] Save failed:', err);
      const errMsg = err.message || String(err);
      showToast('Save failed: ' + errMsg, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logSaving: false, logConfirmed: false, logError: errMsg } : m));
    }
  };

  const confirmBulkLog = async (messageId: string, actions: LogAction[], selected: boolean[]) => {
    if (!currentFarm) return;

    // BUG-033: re-sort so prerequisites fire before dependents (e.g.
    // CREATE_RABBITRY → REGISTER_RABBIT → LOG_KINDLING → LOG_RABBIT_LOSS).
    // Eden's emission order isn't always dependency-correct - this layer
    // makes the executor robust to whatever order the model produces.
    const selectedActions = sortActionsByDependency(actions.filter((_, i) => selected[i]));
    if (selectedActions.length === 0) return;

    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, bulkLogConfirmed: true, bulkLogProgress: { done: 0, total: selectedActions.length } } : m));

    const currency = actions[0]?.currency || 'XAF';
    let successCount = 0;
    const errors: string[] = [];
    const CHUNK = 10;

    for (let i = 0; i < selectedActions.length; i += CHUNK) {
      const chunk = selectedActions.slice(i, i + CHUNK);
      for (const action of chunk) {
        try {
          const dupe = await checkForDuplicate(action, currentFarm.id);
          if (dupe) { errors.push(`Skipped: ${dupe}`); continue; }
          await executeLogAction(action, currentFarm.id, currency);
          successCount++;
        } catch (err: any) {
          errors.push(err.message || 'Unknown error');
        }
      }
      // Update live progress after each chunk
      setMessages(prev => prev.map(m => m.id === messageId
        ? { ...m, bulkLogProgress: { done: Math.min(i + CHUNK, selectedActions.length), total: selectedActions.length } }
        : m));
    }

    const result = { saved: successCount, total: selectedActions.length, failed: errors.length };
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, bulkLogResult: result, bulkLogProgress: undefined } : m));

    // Determine where to verify based on the record type
    const firstType = selectedActions[0]?.type;
    const verifyLocation =
      firstType === 'LOG_EGG_SALE' ? 'Sales → Egg Sales' :
      firstType === 'LOG_BIRD_SALE' ? 'Sales → Bird Sales' :
      firstType === 'LOG_EGGS' ? 'Egg Records' :
      firstType === 'LOG_EXPENSE' || firstType === 'LOG_PURCHASE' ? 'Finance → Expenses' :
      firstType === 'LOG_MORTALITY' ? 'Flock records' :
      firstType === 'CREATE_TASK' ? 'Tasks' :
      'the relevant section';

    if (successCount > 0) {
      showToast(`Saved ${successCount} of ${selectedActions.length} record${selectedActions.length !== 1 ? 's' : ''}${errors.length ? ` (${errors.length} skipped)` : ''}`, 'success');
      const skippedErrors = errors.filter(e => e.startsWith('Skipped:'));
      const skipped = skippedErrors.length;
      const failed = errors.length - skipped;
      const lines: string[] = [`✅ **${successCount} of ${selectedActions.length}** records saved.`];
      if (skipped > 0) {
        lines.push(`⚠️ **${skipped}** skipped - already in the system:`);
        skippedErrors.forEach(e => lines.push(`  • ${e.replace(/^Skipped: /, '')}`));
      }
      if (failed > 0) lines.push(`❌ **${failed}** failed to save - please retry those individually.`);
      lines.push(`\nVerify your entries under **${verifyLocation}**.`);
      const followUp: ChatMessage = {
        id: Date.now().toString() + '_f',
        role: 'assistant',
        content: lines.join('\n'),
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, followUp]);
    } else {
      showToast(`Import failed: ${errors[0] || 'Unknown error'}`, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, bulkLogConfirmed: false, bulkLogProgress: undefined } : m));
      const followUp: ChatMessage = {
        id: Date.now().toString() + '_f',
        role: 'assistant',
        content: `❌ None of the ${selectedActions.length} records could be saved - ${errors[0] || 'unknown error'}.\n\nTry again or paste a smaller batch and I'll log them for you.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, followUp]);
    }
  };

  const confirmPayRun = async (messageId: string, action: NonNullable<ChatMessage['payRunAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, payRunConfirmed: true } : m));
    try {
      const today = new Date().toISOString().split('T')[0];
      const monthStart = today.slice(0, 8) + '01';
      const totalAmount = (action.amount || 0) + (action.bonus || 0);

      const { data: run, error: runError } = await supabase
        .from('payroll_runs')
        .insert({
          farm_id: currentFarm!.id,
          pay_period_start: action.pay_period_start || monthStart,
          pay_period_end: action.pay_period_end || action.pay_date || today,
          status: 'completed',
          total_amount: totalAmount,
          total_workers: 1,
          currency: action.currency || currentFarm?.currency_code || 'XAF',
          created_by: user!.id,
          processed_at: new Date().toISOString(),
          notes: action.notes || `Pay run for ${action.worker_name}`,
        })
        .select()
        .single();

      if (runError) throw runError;

      // Look up from farm_workers first (offline workers), then fall back to auth team members
      let authWorkerId: string | null = action.worker_id || null;
      let farmWorkerId: string | null = null;

      if (!authWorkerId) {
        const { data: fw } = await supabase
          .from('farm_workers')
          .select('id')
          .eq('farm_id', currentFarm!.id)
          .ilike('name', `%${action.worker_name}%`)
          .maybeSingle();
        if (fw) {
          farmWorkerId = fw.id;
        } else {
          // Fallback: try auth-based team member
          const { data: tm } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('farm_id', currentFarm!.id)
            .ilike('name', `%${action.worker_name}%`)
            .maybeSingle();
          authWorkerId = tm?.user_id || null;
        }
      }

      await supabase.from('payroll_items').insert({
        payroll_run_id: run.id,
        farm_id: currentFarm!.id,
        worker_id: authWorkerId,
        farm_worker_id: farmWorkerId,
        worker_name: action.worker_name,
        pay_type: 'salary',
        base_pay: action.amount || 0,
        bonus_amount: action.bonus || 0,
        net_pay: totalAmount,
        currency: action.currency || currentFarm?.currency_code || 'XAF',
        status: 'paid',
        notes: action.notes,
      });

      showToast(`Pay run saved - ${action.worker_name} paid ${(action.currency || 'XAF')} ${totalAmount.toLocaleString()}`, 'success');
    } catch (err: any) {
      showToast('Failed to save pay run: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, payRunConfirmed: false } : m));
    }
  };

  const confirmSaveConfig = async (messageId: string, action: NonNullable<ChatMessage['saveConfigAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, saveConfigConfirmed: true } : m));
    try {
      const { data: existing } = await supabase
        .from('farm_setup_config')
        .select('egg_prices, payout_account, default_pay_day')
        .eq('farm_id', currentFarm!.id)
        .maybeSingle();

      await supabase.from('farm_setup_config').upsert({
        farm_id: currentFarm!.id,
        egg_prices: { ...(existing?.egg_prices || {}), ...(action.egg_prices || {}) },
        payout_account: action.payout_account ?? existing?.payout_account,
        default_pay_day: action.default_pay_day ?? existing?.default_pay_day ?? 30,
        updated_at: new Date().toISOString(),
      });

      showToast('Farm setup saved', 'success');
    } catch (err: any) {
      showToast('Failed to save config: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, saveConfigConfirmed: false } : m));
    }
  };

  const confirmUpdateRecord = async (messageId: string, action: NonNullable<ChatMessage['updateRecordAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateRecordConfirmed: true } : m));
    try {
      const matchConditions = Object.entries(action.match);
      let query = supabase.from(action.table as any).update(action.update).eq('farm_id', currentFarm!.id);
      for (const [key, value] of matchConditions) {
        if (typeof value === 'string' && key.includes('name')) {
          query = query.ilike(key, `%${value}%`);
        } else {
          query = query.eq(key, value);
        }
      }
      const { error, count } = await query;
      if (error) throw error;
      showToast(`Record updated successfully${count ? ` (${count} row${count !== 1 ? 's' : ''})` : ''}`, 'success');
    } catch (err: any) {
      showToast('Update failed: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateRecordConfirmed: false } : m));
    }
  };

  const confirmVoidRecord = async (messageId: string, action: NonNullable<ChatMessage['voidRecordAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, voidRecordConfirmed: true } : m));
    try {
      const matchConditions = Object.entries(action.match);
      let query = supabase.from(action.table as any).delete().eq('farm_id', currentFarm!.id);
      for (const [key, value] of matchConditions) {
        if (typeof value === 'string' && key.includes('name')) {
          query = query.ilike(key, `%${value}%`);
        } else {
          query = query.eq(key, value);
        }
      }
      const { error } = await query;
      if (error) throw error;
      showToast(`Record voided: ${action.reason || 'Removed from database'}`, 'success');
    } catch (err: any) {
      showToast('Void failed: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, voidRecordConfirmed: false } : m));
    }
  };

  const confirmUpdateTeamMember = async (messageId: string, action: NonNullable<ChatMessage['updateTeamMemberAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateTeamMemberConfirmed: true } : m));
    try {
      const { error } = await supabase.rpc('update_farm_member_role', {
        p_farm_member_id: action.farm_member_id,
        p_new_role: action.new_role,
      });
      if (error) throw error;
      showToast(`${action.member_name} is now a ${action.new_role}`, 'success');
    } catch (err: any) {
      showToast('Failed to update role: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateTeamMemberConfirmed: false } : m));
    }
  };

  const confirmLogWorker = async (messageId: string, action: NonNullable<ChatMessage['logWorkerAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logWorkerConfirmed: true } : m));
    try {
      await supabase.from('farm_workers').insert({
        farm_id: currentFarm!.id,
        name: action.name,
        role: action.role || 'worker',
        pay_type: action.pay_type || 'salary',
        monthly_salary: action.monthly_salary || null,
        hourly_rate: action.hourly_rate || null,
        currency: action.currency || currentFarm?.currency_code || 'XAF',
        phone: action.phone || null,
        notes: action.notes || null,
        is_active: true,
      });
      showToast(`${action.name} added as ${action.role || 'worker'}`, 'success');
    } catch (err: any) {
      showToast('Failed to add worker: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logWorkerConfirmed: false } : m));
    }
  };

  const confirmUpdateWorker = async (messageId: string, action: NonNullable<ChatMessage['updateWorkerAction']>) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateWorkerConfirmed: true } : m));
    try {
      const { error } = await supabase
        .from('farm_workers')
        .update({ ...action.update, updated_at: new Date().toISOString() })
        .eq('farm_id', currentFarm!.id)
        .ilike('name', `%${action.match_name}%`);
      if (error) throw error;
      showToast(`${action.match_name} updated`, 'success');
    } catch (err: any) {
      showToast('Failed to update worker: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, updateWorkerConfirmed: false } : m));
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if ((!text && pendingImages.length === 0 && !pendingFile) || loading) return;

    // In cross-farm mode there is no single currentFarm - that's the point.
    // We still require the user to belong to at least one farm to send anything.
    if (!crossFarm && !currentFarm) {
      showToast('Please select a farm first', 'error');
      return;
    }
    if (crossFarm && (!allFarms || allFarms.length === 0)) {
      showToast('No farms available for cross-farm mode.', 'error');
      return;
    }

    const imgs = [...pendingImages];
    const fileAttachment = pendingFile;

    // Append CSV content to the text message
    const fileBlock = fileAttachment
      ? `\n\n--- Attached File: ${fileAttachment.name} (${fileAttachment.rowCount} data rows) ---\n${fileAttachment.content}\n---`
      : '';
    const fullText = (text || '') + fileBlock;

    const userContent = text || (fileAttachment ? `Please import ${fileAttachment.name}` : '');

    // Persist user message first. This is the source of truth — local state
    // gets refreshed via the hook's effect.
    let persistedUserId: string | null = null;
    try {
      const persisted = await persistedChat.appendUserMessage(userContent);
      persistedUserId = persisted.id;
    } catch (err: any) {
      console.error('Failed to persist user message:', err);
      showToast('Could not save your message. Please retry.', 'error');
      return;
    }

    // Optimistically add to display state — the hook effect will replace
    // this with the canonical row on next tick, but the UI needs the message
    // visible immediately, with attachments which aren't persisted.
    const userMessage: ChatMessage = {
      id: persistedUserId,
      role: 'user',
      content: userContent,
      images: imgs.length > 0 ? imgs : undefined,
      attachedFile: fileAttachment ? { name: fileAttachment.name, rowCount: fileAttachment.rowCount } : undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    // Reset textarea height so it collapses back to 1 row after send.
    // The auto-grow onChange handler only fires on user input, not on
    // programmatic value clears, so we have to reset manually here.
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setPendingImages([]);
    setPendingFile(null);
    setLoading(true);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      // Refresh if token is expired or within 60 seconds of expiry
      if (!session || (session.expires_at && session.expires_at * 1000 - Date.now() < 60_000)) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          throw new Error('Your session expired - please reload the page and try again.');
        }
        session = refreshed.session;
      }

      const allMessages = [
        ...messages.slice(-9).map(m => ({
          role: m.role,
          content: m.content,
          images: m.images?.map(img => ({ data: img.data, mediaType: img.mediaType })),
        })),
        {
          role: 'user' as const,
          content: fullText || '',
          images: imgs.length > 0 ? imgs.map(img => ({ data: img.data, mediaType: img.mediaType })) : undefined,
        },
      ];

      // Pick the right anchor farm. In cross-farm mode the edge function
      // still needs ONE farm_id as the auth anchor (any farm the user
      // belongs to works) and the full list of farms to fetch context for.
      const anchorFarmId = currentFarm?.id ?? allFarms[0]?.id ?? '';
      const requestBody: Record<string, unknown> = {
        farm_id: anchorFarmId,
        messages: allMessages,
        include_context: true,
        // Tell Eden which language to write its prose in. Without this,
        // a French user with the UI in French still gets English replies
        // because the model has no signal about the user's language.
        language,
      };
      if (crossFarm && allFarms && allFarms.length > 0) {
        requestBody.cross_farm = true;
        requestBody.cross_farm_farm_ids = allFarms.map((f) => f.id);
      }
      const body = JSON.stringify(requestBody);

      const doFetch = () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 55_000);
        return fetch('/api/ai-chat', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body,
        }).finally(() => clearTimeout(timer));
      };

      let response: Response;
      try {
        response = await doFetch();
      } catch (fetchErr: any) {
        const isTimeout = fetchErr?.name === 'AbortError';
        console.error('AI fetch error (attempt 1):', fetchErr?.name, fetchErr?.message);
        await new Promise(r => setTimeout(r, 3000));
        try {
          response = await doFetch();
        } catch (fetchErr2: any) {
          const isTimeout2 = fetchErr2?.name === 'AbortError';
          console.error('AI fetch error (attempt 2):', fetchErr2?.name, fetchErr2?.message);
          const msg = isTimeout || isTimeout2
            ? 'Request timed out - Eden AI is slow to start. Try again in a moment.'
            : 'Could not reach Eden AI. Check your connection and try again.';
          throw new Error(msg);
        }
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          response.status === 504 || response.status === 524
            ? 'Eden AI is taking too long to respond. Please try again.'
            : `Server error ${response.status} - please try again.`
        );
      }
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Server error ${response.status}`);
      }
      if (data.msgsUsed && data.msgsCap) {
        setUsageInfo({ used: data.msgsUsed, cap: data.msgsCap, tier: data.tier || 'free' });
      }

      const bulkActions: LogAction[] = data.bulkLogActions || [];

      // Persist Eden's reply to Supabase. log_target_farm_id captures the
      // destination farm in cross-farm mode (Eden may have asked for it
      // before generating a [LOG]); falls back to the conversation's farm.
      const replyContent = data.message || 'I apologize, but I could not generate a response.';
      const targetFarmId = crossFarm
        ? (data.logAction?.target_farm_id ?? null)
        : (currentFarm?.id ?? null);

      let persistedAssistantId: string;
      try {
        const persisted = await persistedChat.appendAssistantMessage(replyContent, {
          logAction: data.logAction ?? null,
          logTargetFarmId: targetFarmId,
        });
        persistedAssistantId = persisted.id;
      } catch (err) {
        console.warn('Failed to persist assistant message:', err);
        persistedAssistantId = (Date.now() + 1).toString();
      }
      const msgId = persistedAssistantId;

      const assistantMessage: ChatMessage = {
        id: msgId,
        role: 'assistant',
        content: replyContent,
        actions: data.actions || [],
        logAction: data.logAction || null,
        // Auto-confirm bulk logs — skip the checkbox panel, go straight to progress bar
        bulkLogActions: bulkActions.length > 0 ? bulkActions : undefined,
        bulkLogConfirmed: bulkActions.length > 0 ? true : undefined,
        bulkLogProgress: bulkActions.length > 0 ? { done: 0, total: bulkActions.length } : undefined,
        payRunAction: data.payRunAction || undefined,
        saveConfigAction: data.saveConfigAction || undefined,
        updateRecordAction: data.updateRecordAction || undefined,
        voidRecordAction: data.voidRecordAction || undefined,
        logWorkerAction: data.logWorkerAction || undefined,
        updateWorkerAction: data.updateWorkerAction || undefined,
        updateTeamMemberAction: data.updateTeamMemberAction || undefined,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Read Eden's reply aloud if TTS is enabled (Phase G voice support).
      speakText(assistantMessage.content);

      // Auto-execute bulk log immediately — no confirm button needed
      if (bulkActions.length > 0 && currentFarm) {
        setTimeout(() => confirmBulkLog(msgId, bulkActions, bulkActions.map(() => true)), 50);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error.message || 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      showToast(error.message || 'Failed to send message', 'error');
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleBulkRow = (messageId: string, rowIdx: number) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId || !m.bulkLogSelected) return m;
      const next = [...m.bulkLogSelected];
      next[rowIdx] = !next[rowIdx];
      return { ...m, bulkLogSelected: next };
    }));
  };

  const toggleAllBulkRows = (messageId: string, value: boolean) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== messageId || !m.bulkLogSelected) return m;
      return { ...m, bulkLogSelected: m.bulkLogSelected.map(() => value) };
    }));
  };

  const summariseLogAction = (a: LogAction): string => {
    const cur = a.currency || '';
    const dateLabel = a.log_date ? ` · ${a.log_date}` : '';
    if (a.type === 'LOG_MORTALITY') return `${a.count} death(s) in "${a.flock_name}"${a.cause ? ` - ${a.cause}` : ''}${dateLabel}`;
    if (a.type === 'LOG_EGGS') {
      const parts = [];
      if (a.small_eggs) parts.push(`${a.small_eggs} small`);
      if (a.medium_eggs) parts.push(`${a.medium_eggs} medium`);
      if (a.large_eggs) parts.push(`${a.large_eggs} large`);
      if (a.jumbo_eggs) parts.push(`${a.jumbo_eggs} jumbo`);
      const total = (a.small_eggs||0)+(a.medium_eggs||0)+(a.large_eggs||0)+(a.jumbo_eggs||0);
      return `${total} eggs from "${a.flock_name}"${dateLabel}`;
    }
    if (a.type === 'LOG_EGG_SALE') {
      const total = (a.small_eggs_sold||0)+(a.medium_eggs_sold||0)+(a.large_eggs_sold||0)+(a.jumbo_eggs_sold||0);
      const amount = a.total_amount || 0;
      return `${total} eggs sold${amount ? ` · ${amount.toLocaleString()} ${cur}` : ''}${a.customer_name ? ` → ${a.customer_name}` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_BIRD_SALE') {
      const total = a.total_amount || ((a.birds_sold||0)*(a.price_per_bird||0));
      return `${a.birds_sold} bird(s) sold${total ? ` · ${total.toLocaleString()} ${cur}` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_PURCHASE') {
      const emoji = a.inventory_category === 'feed' ? '🌾' : a.inventory_category === 'Medication' ? '💊' : a.inventory_category === 'Equipment' ? '🔧' : '📦';
      return `${emoji} ${a.quantity} ${a.unit} "${a.item_name}" · ${(a.amount||0).toLocaleString()} ${cur}${dateLabel}`;
    }
    if (a.type === 'LOG_EXPENSE') return `${a.description} · ${(a.amount||0).toLocaleString()} ${cur}${dateLabel}`;
    if (a.type === 'LOG_WEIGHT') return `Weight "${a.flock_name}": ${a.avg_weight_kg} kg avg${dateLabel}`;
    if (a.type === 'LOG_FEED_USAGE') return `${a.bags_used} bag(s) of ${a.feed_type} used${dateLabel}`;
    if (a.type === 'LOG_WATER_QUALITY') {
      const pond = a.pond_name || a.flock_name;
      return `Water quality "${pond}": DO ${a.dissolved_oxygen ?? ' - '} mg/L, pH ${a.ph ?? ' - '}, Temp ${a.temperature_c ?? ' - '}°C${dateLabel}`;
    }
    if (a.type === 'LOG_POND_INSPECTION') {
      const pond = a.pond_name || a.flock_name;
      return `Pond inspection "${pond}": clarity ${a.water_clarity || ' - '}, fish ${a.fish_behavior || ' - '}${a.dead_fish_count ? `, ${a.dead_fish_count} dead` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_STOCKING') {
      // Species-aware verb + noun: "stocking fingerlings" is aquaculture
      // vocab. For poultry it's "delivered birds", for rabbits "acquired
      // rabbits". Greg flagged the fish-only wording on poultry farms in
      // his May 2026 audit (BUG #7).
      const pond = a.pond_name || a.flock_name;
      const sp = String(a.species || '').toLowerCase();
      const count = (a.fingerling_count || 0).toLocaleString();
      const isFish = ['catfish', 'tilapia', 'salmon', 'trout', 'carp', 'shrimp', 'clarias', 'fish', 'other fish'].includes(sp);
      const isRabbit = sp === 'rabbit' || sp === 'rabbits' || sp === 'rabbitry';
      if (isFish) return `Stocked ${count} ${a.species} fingerlings into "${pond}"${dateLabel}`;
      if (isRabbit) return `Acquired ${count} rabbits into "${pond}"${dateLabel}`;
      return `Delivered ${count} ${a.species || 'birds'} to "${pond}"${dateLabel}`;
    }
    if (a.type === 'LOG_HARVEST') {
      const pond = a.pond_name || a.flock_name;
      return `Fish harvest "${pond}": ${a.total_weight_kg} kg${a.price_per_kg ? ` @ ${a.price_per_kg}/${cur}/kg` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_SAMPLING') {
      const pond = a.pond_name || a.flock_name;
      return `Sampling "${pond}": n=${a.sample_size || 10}, ABW ${a.abw_g || ' - '} g${dateLabel}`;
    }
    if (a.type === 'LOG_FISH_LOSS') {
      const pond = a.pond_name || a.flock_name;
      return `${a.count} fish loss in "${pond}"${a.cause ? ` - ${a.cause}` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_BREEDING') return `Breeding: ${a.doe_tag} × ${a.buck_tag}${a.mating_date ? ` on ${a.mating_date}` : ''}`;
    if (a.type === 'LOG_KINDLING') return `Kindling: doe ${a.doe_tag} - ${a.kits_born_alive ?? 0} alive, ${a.kits_born_dead ?? 0} dead${dateLabel}`;
    if (a.type === 'LOG_WEANING') return `Weaning: ${a.kits_weaned ?? 0} kits from doe ${a.doe_tag}${dateLabel}`;
    if (a.type === 'REGISTER_RABBIT') return `Register rabbit: tag "${a.tag}" · ${a.sex}${a.breed ? ` · ${a.breed}` : ''}`;
    if (a.type === 'LOG_RABBIT_LOSS') {
      const rabbitry = a.rabbitry_name || a.flock_name;
      return `${a.count} rabbit loss in "${rabbitry}"${a.cause ? ` - ${a.cause}` : ''}${dateLabel}`;
    }
    if (a.type === 'LOG_RABBIT_HARVEST') {
      const rabbitry = a.rabbitry_name || a.flock_name;
      return `Rabbit harvest "${rabbitry}": ${a.count} rabbits${a.total_live_weight_kg ? `, ${a.total_live_weight_kg} kg live wt` : ''}${dateLabel}`;
    }
    return 'Log data';
  };

  const handleActionClick = (href: string) => {
    window.location.hash = href;
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  if (!currentFarm) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="text-center">
          <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Please select a farm to use Eden</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <EdenHeader
        speciesId={farmSpecies.id}
        allFarms={allFarms ?? []}
        currentFarmId={currentFarm?.id ?? null}
        crossFarm={crossFarm}
        usageInfo={usageInfo}
        showClear={messages.length > 0}
        onClear={async () => {
          await persistedChat.clear();
          setMessages([]);
        }}
        onSelectFarm={(farmId) => {
          setCrossFarm(false);
          if (currentFarm?.id !== farmId) {
            const target = allFarms?.find((f) => f.id === farmId);
            void switchFarm(farmId);
            if (target) showToast(`Switched to ${target.name}`, 'success');
          }
        }}
        onSelectAllFarms={() => setCrossFarm(true)}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
        {messages.length === 0 ? (
          <EdenEmptyState
            ownerFirstName={(profile?.full_name || user?.email || 'there').split(/[\s@]/)[0]}
            farmId={currentFarm?.id ?? null}
            farmName={currentFarm?.name ?? null}
            farmType={currentFarm?.farm_type ?? farmSpecies.id ?? null}
            crossFarm={crossFarm}
            onChipClick={handleSuggestionClick}
            onCsvImport={() => csvInputRef.current?.click()}
          />
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-agri-brown-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <EdenAvatarAnimated size="sm" />
                      <span className="text-xs font-bold text-agri-brown-700 tracking-wide">Eden</span>
                    </div>
                  )}
                  {message.images && message.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {message.images.map((img, idx) => (
                        <img key={idx} src={img.preview} alt="attached" className="h-32 w-auto rounded-lg object-cover border border-white/20" />
                      ))}
                    </div>
                  )}
                  {message.attachedFile && (
                    <div className="flex items-center gap-2 mb-2 bg-white/10 rounded-lg px-3 py-2">
                      <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                      <span className="text-xs font-medium">{message.attachedFile.name}</span>
                      <span className="text-xs opacity-70">· {message.attachedFile.rowCount} rows</span>
                    </div>
                  )}
                  {message.content && (() => {
                    const stripped = message.content
                      .replace(/\[BULK_LOG\][\s\S]*?\[\/BULK_LOG\]/g, '')
                      .replace(/\[BULK_LOG\][\s\S]*/g, '')
                      .replace(/\[LOG\][\s\S]*?\[\/LOG\]/g, '')
                      .replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/g, '')
                      .replace(/\[CREATE_TASK\][\s\S]*?\[\/CREATE_TASK\]/g, '')
                      .replace(/\[CREATE_TASK\][\s\S]*/g, '')
                      .trim();
                    // Phase 2 PR 3: pull out the optional <eden:structured>
                    // block (renders as Key Finding / Next Steps / Data
                    // cards) from Eden's reply.
                    const { structured, cleanText } =
                      message.role === 'assistant'
                        ? parseStructuredResponse(stripped)
                        : { structured: null, cleanText: stripped };
                    return (
                      <>
                        {cleanText ? (
                          <div className={`prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-strong:font-semibold prose-hr:my-2 ${message.role === 'user' ? 'prose-invert' : ''}`}>
                            <ReactMarkdown>{cleanText}</ReactMarkdown>
                          </div>
                        ) : null}
                        {structured && <EdenStructuredResponse structured={structured} />}
                      </>
                    );
                  })()}

                  {/* Single log confirm — redesigned per Phase 2 PR 2:
                      slim species-colored stripe + white fill + big confirm. */}
                  {message.logAction && (() => {
                    const targetFarmId = message.logAction.target_farm_id;
                    const targetFarm = crossFarm && targetFarmId
                      ? allFarms.find(f => f.id === targetFarmId)
                      : null;
                    const destSpecies = targetFarm?.farm_type ?? currentFarm?.farm_type ?? farmSpecies.id;
                    const destName = targetFarm?.name ?? null;
                    const cardStatus: 'pending' | 'saving' | 'saved' | 'error' =
                      message.logConfirmed
                        ? 'saved'
                        : message.logSaving
                        ? 'saving'
                        : 'pending';
                    return (
                      <EdenLogActionCard
                        destinationSpecies={destSpecies}
                        destinationFarmName={destName}
                        crossFarm={crossFarm}
                        actionSummary={summariseLogAction(message.logAction)}
                        status={cardStatus}
                        errorMessage={message.logError ?? null}
                        onConfirm={() => confirmLog(message.id, message.logAction!)}
                        onCancel={() => {
                          setMessages(prev =>
                            prev.map(m => m.id === message.id ? { ...m, logAction: undefined } : m)
                          );
                          void persistedChat.setLogConfirmed(message.id, false);
                        }}
                      />
                    );
                  })()}

                  {/* Bulk log — auto-executes, shows progress then result */}
                  {message.bulkLogActions && message.bulkLogActions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.bulkLogProgress && !message.bulkLogResult ? (
                        <div>
                          <p className="text-xs text-blue-600 flex items-center gap-1 font-semibold mb-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Saving… {message.bulkLogProgress.done} of {message.bulkLogProgress.total}
                          </p>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-300"
                              style={{ width: `${(message.bulkLogProgress.done / message.bulkLogProgress.total) * 100}%` }}
                            />
                          </div>
                        </div>
                      ) : message.bulkLogResult ? (
                        <p className="text-xs text-green-600 flex items-center gap-1 font-semibold">
                          <CheckCircle className="w-3 h-3" />
                          {message.bulkLogResult.saved} of {message.bulkLogResult.total} records saved
                          {message.bulkLogResult.failed > 0 && ` (${message.bulkLogResult.failed} skipped)`}
                        </p>
                      ) : (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Recording {message.bulkLogActions.length} entries…
                        </p>
                      )}
                    </div>
                  )}

                  {/* Pay run confirm */}
                  {message.payRunAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.payRunConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Pay run saved successfully
                        </p>
                      ) : (
                        <div className="bg-amber-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-900">Confirm Pay Run</p>
                          <div className="text-xs text-amber-800 space-y-0.5">
                            <p><strong>Worker:</strong> {message.payRunAction.worker_name}</p>
                            <p><strong>Base pay:</strong> {message.payRunAction.currency} {(message.payRunAction.amount || 0).toLocaleString()}</p>
                            {(message.payRunAction.bonus || 0) > 0 && (
                              <p><strong>Bonus:</strong> {message.payRunAction.currency} {message.payRunAction.bonus!.toLocaleString()}</p>
                            )}
                            <p><strong>Total:</strong> {message.payRunAction.currency} {((message.payRunAction.amount || 0) + (message.payRunAction.bonus || 0)).toLocaleString()}</p>
                            <p><strong>Period:</strong> {message.payRunAction.pay_period_start || ' - '} to {message.payRunAction.pay_period_end || message.payRunAction.pay_date}</p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => confirmPayRun(message.id, message.payRunAction!)}
                              className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Confirm & Save
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, payRunAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs font-medium"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Save setup config confirm */}
                  {message.saveConfigAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.saveConfigConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Farm setup saved
                        </p>
                      ) : (
                        <div className="bg-green-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-green-900">{isFr ? 'Enregistrer dans la configuration de la ferme ?' : 'Save to Farm Setup?'}</p>
                          <div className="text-xs text-green-800 space-y-0.5">
                            {message.saveConfigAction.egg_prices && Object.keys(message.saveConfigAction.egg_prices).length > 0 && (
                              <p><strong>Egg prices:</strong> {Object.entries(message.saveConfigAction.egg_prices).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                            )}
                            {message.saveConfigAction.payout_account && (
                              <p><strong>Payout account:</strong> {message.saveConfigAction.payout_account}</p>
                            )}
                            {message.saveConfigAction.default_pay_day && (
                              <p><strong>Pay day:</strong> {message.saveConfigAction.default_pay_day}th of each month</p>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => confirmSaveConfig(message.id, message.saveConfigAction!)}
                              className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Save Setup
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, saveConfigAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs font-medium"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Update record confirm */}
                  {message.updateRecordAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.updateRecordConfirmed ? (
                        <p className="text-xs text-blue-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Record updated</p>
                      ) : (
                        <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-blue-900">Confirm Update</p>
                          <p className="text-xs text-blue-800">Table: <strong>{message.updateRecordAction.table}</strong></p>
                          <p className="text-xs text-blue-800">Match: {Object.entries(message.updateRecordAction.match).map(([k,v]) => `${k}="${v}"`).join(', ')}</p>
                          <p className="text-xs text-blue-800">Set: {Object.entries(message.updateRecordAction.update).map(([k,v]) => `${k}→${v}`).join(', ')}</p>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => confirmUpdateRecord(message.id, message.updateRecordAction!)} className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Confirm Update
                            </button>
                            <button onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, updateRecordAction: undefined } : m))} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Void record confirm */}
                  {message.voidRecordAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.voidRecordConfirmed ? (
                        <p className="text-xs text-red-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Record voided</p>
                      ) : (
                        <div className="bg-red-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-red-900">Confirm Delete / Void</p>
                          <p className="text-xs text-red-800">Table: <strong>{message.voidRecordAction.table}</strong></p>
                          <p className="text-xs text-red-800">Matching: {Object.entries(message.voidRecordAction.match).map(([k,v]) => `${k}="${v}"`).join(', ')}</p>
                          {message.voidRecordAction.reason && <p className="text-xs text-red-700">Reason: {message.voidRecordAction.reason}</p>}
                          <p className="text-xs text-red-600 font-medium">⚠️ This cannot be undone.</p>
                          <div className="flex gap-2 pt-1">
                            <button onClick={() => confirmVoidRecord(message.id, message.voidRecordAction!)} className="flex-1 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-xs font-medium flex items-center justify-center gap-1">
                              <CheckCircle className="w-3 h-3" /> Yes, Delete
                            </button>
                            <button onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, voidRecordAction: undefined } : m))} className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add worker confirm */}
                  {message.logWorkerAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.logWorkerConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Worker added successfully
                        </p>
                      ) : (
                        <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-indigo-900">{isFr ? "Ajouter un ouvrier à la ferme ?" : 'Add Worker to Farm?'}</p>
                          <div className="text-xs text-indigo-800 space-y-0.5">
                            <p><strong>Name:</strong> {message.logWorkerAction.name}</p>
                            <p><strong>Role:</strong> {message.logWorkerAction.role || 'worker'}</p>
                            {message.logWorkerAction.monthly_salary && (
                              <p><strong>Monthly salary:</strong> {message.logWorkerAction.currency || 'XAF'} {message.logWorkerAction.monthly_salary.toLocaleString()}</p>
                            )}
                            {message.logWorkerAction.hourly_rate && (
                              <p><strong>Hourly rate:</strong> {message.logWorkerAction.currency || 'XAF'} {message.logWorkerAction.hourly_rate}/hr</p>
                            )}
                            {message.logWorkerAction.phone && (
                              <p><strong>Phone:</strong> {message.logWorkerAction.phone}</p>
                            )}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => confirmLogWorker(message.id, message.logWorkerAction!)}
                              className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Yes, Add Worker
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, logWorkerAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs font-medium"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Update worker confirm */}
                  {message.updateWorkerAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.updateWorkerConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Worker updated
                        </p>
                      ) : (
                        <div className="bg-violet-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-violet-900">Update Worker?</p>
                          <p className="text-xs text-violet-800"><strong>Worker:</strong> {message.updateWorkerAction.match_name}</p>
                          <div className="text-xs text-violet-800 space-y-0.5">
                            {Object.entries(message.updateWorkerAction.update).map(([k, v]) => (
                              <p key={k}><strong>{k}:</strong> {String(v)}</p>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => confirmUpdateWorker(message.id, message.updateWorkerAction!)}
                              className="flex-1 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Confirm Update
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, updateWorkerAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Update team member role confirm */}
                  {message.updateTeamMemberAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.updateTeamMemberConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Role updated
                        </p>
                      ) : (
                        <div className="bg-teal-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs font-semibold text-teal-900">Change Team Member Role?</p>
                          <div className="text-xs text-teal-800 space-y-0.5">
                            <p><strong>Member:</strong> {message.updateTeamMemberAction.member_name}</p>
                            <p><strong>Current role:</strong> {message.updateTeamMemberAction.old_role}</p>
                            <p><strong>New role:</strong> <span className="font-semibold">{message.updateTeamMemberAction.new_role}</span></p>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => confirmUpdateTeamMember(message.id, message.updateTeamMemberAction!)}
                              className="flex-1 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-xs font-medium flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Confirm Change
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, updateTeamMemberAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {message.actions && message.actions.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <Navigation className="w-3 h-3" />
                        Quick Actions:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.actions.map((action, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleActionClick(action.href)}
                            className="px-3 py-1.5 bg-agri-gold-50 text-agri-brown-700 rounded-lg hover:bg-agri-gold-100 text-xs font-medium transition-colors"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-xs opacity-70 mt-2">
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <EdenAvatarAnimated size="sm" />
                    <span className="text-xs font-bold text-agri-brown-700">Eden</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-agri-brown-600 animate-spin" />
                    <span className="text-sm text-gray-500">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="max-w-4xl mx-auto space-y-2">
          {/* Image preview strip */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative">
                  <img src={img.preview} alt="pending" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                  <button
                    onClick={() => setPendingImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400 self-end pb-1">Eden will analyze {pendingImages.length === 1 ? 'this image' : 'these images'}</p>
            </div>
          )}

          {/* File attachment chip */}
          {pendingFile && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <FileSpreadsheet className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-xs font-medium text-green-800 flex-1">{pendingFile.name}</span>
              <span className="text-xs text-green-600">{pendingFile.rowCount} rows</span>
              <button
                onClick={() => setPendingFile(null)}
                className="text-green-600 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/*
            Eden input bar — May 2026 mobile rewrite.
            • Row uses flex-wrap as a defensive measure if anyone adds an
              element later that pushes the row past viewport width.
            • Language picker + mute toggle are hidden below 640px (`sm:`)
              and live in the attach menu instead, keeping the on-screen
              row to: [+] [mic] [textarea] [Send] on phones.
          */}
          <div className="flex gap-2 items-end flex-wrap sm:flex-nowrap">
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => addImages(e.target.files)}
            />
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ''; }}
            />

            {/* Attach menu: camera + file + voice language under one "+" button */}
            <div className="relative" ref={attachMenuRef}>
              <button
                onClick={() => setAttachMenuOpen(v => !v)}
                disabled={loading}
                title="Attach photo or file"
                className={`px-3 py-3 rounded-lg transition-colors flex items-center justify-center ${
                  attachMenuOpen
                    ? 'bg-agri-gold-100 text-agri-brown-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-agri-gold-50 hover:text-agri-brown-600'
                } disabled:opacity-40`}
              >
                <Plus className="w-5 h-5" />
              </button>

              {attachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden min-w-[200px] z-20">
                  <button
                    onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                    disabled={pendingImages.length >= 3}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-agri-gold-50 hover:text-agri-brown-700 disabled:opacity-40 transition-colors"
                  >
                    <Camera className="w-4 h-4 flex-shrink-0" />
                    Photo / Image
                  </button>
                  <button
                    onClick={() => { setAttachMenuOpen(false); csvInputRef.current?.click(); }}
                    disabled={!!pendingFile}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 hover:text-green-700 disabled:opacity-40 transition-colors border-t border-gray-100"
                  >
                    <Paperclip className="w-4 h-4 flex-shrink-0" />
                    CSV / Spreadsheet
                  </button>

                  {/* Voice language picker — surfaced here for mobile because
                      the inline <select> in the input row is hidden below 640px.
                      Desktop users see both; the duplicate is harmless because
                      both call the same setter. */}
                  <div className="border-t border-gray-100 px-4 pt-3 pb-1 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                    Voice language
                  </div>
                  <div className="grid grid-cols-3 gap-1 px-3 pb-3">
                    {(['en', 'fr', 'sw', 'yo', 'ha', 'pidgin'] as const).map(code => (
                      <button
                        key={code}
                        onClick={() => { handleVoiceLangChange(code as any); setAttachMenuOpen(false); }}
                        className={`px-2 py-1.5 text-xs rounded-md font-medium transition-colors ${
                          voiceLang === code
                            ? 'bg-agri-gold-100 text-agri-brown-700'
                            : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {code === 'pidgin' ? 'Pidgin' : code.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Mic button — records audio, ships to Whisper, drops text in input */}
            <button
              onClick={toggleVoice}
              disabled={loading || transcribing}
              title={listening ? 'Stop listening' : transcribing ? 'Transcribing…' : `Speak to Eden (${voiceLang.toUpperCase()})`}
              className={`px-3 py-3 rounded-lg transition-colors flex items-center justify-center ${
                listening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : transcribing
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-agri-gold-50 hover:text-agri-brown-600'
              } disabled:opacity-40`}
            >
              {transcribing
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Voice language picker — desktop only. Phones get the same
                picker inside the attach (+) menu above, so the input row
                stays compact at 360px viewports. */}
            <select
              value={voiceLang}
              onChange={e => handleVoiceLangChange(e.target.value as any)}
              disabled={loading || listening || transcribing}
              title="Voice language"
              className="hidden sm:block px-2 py-3 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium disabled:opacity-40 cursor-pointer focus:outline-none focus:ring-2 focus:ring-agri-gold-500"
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
              <option value="sw">SW</option>
              <option value="yo">YO</option>
              <option value="ha">HA</option>
              <option value="pidgin">Pidgin</option>
            </select>

            {/* TTS toggle — desktop only. Mobile users access mute via
                Settings → Eden AI tab if they need it; in practice TTS is
                rarely toggled, so the row real estate is better spent on
                the textarea. */}
            <button
              type="button"
              onClick={toggleTts}
              disabled={loading}
              title={ttsEnabled ? 'Mute Eden\'s replies' : 'Read Eden\'s replies aloud'}
              className={`hidden sm:flex px-3 py-3 rounded-lg transition-colors items-center justify-center ${
                ttsEnabled
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
              } disabled:opacity-40`}
            >
              {ttsEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* Auto-growing textarea — May 2026 mobile rewrite.
                Was a single-line <input> that scrolled horizontally on
                long messages, off-screen on phones. Now grows from 1 row
                to ~4 rows (max 160px), then internal scroll. Enter sends,
                Shift+Enter inserts a newline (handleKeyPress handles
                that). resize-none disables the manual drag handle. */}
            <textarea
              ref={inputRef}
              rows={1}
              inputMode="text"
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="on"
              spellCheck
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-grow: collapse first so the box can shrink, then
                // expand to scrollHeight (capped at 160px = ~4 rows).
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={handleKeyPress}
              placeholder={
                listening ? (isFr ? "Écoute en cours…" : 'Listening...')
                : pendingFile ? (isFr ? `Demandez à Eden d'importer ${pendingFile.name}…` : `Ask Eden to import ${pendingFile.name}…`)
                : pendingImages.length > 0 ? (isFr ? "Décrivez ce que vous voyez, ou cliquez sur Envoyer…" : 'Describe what you see, or just hit Send…')
                : (isFr ? "Posez une question, saisissez des données ou joignez un fichier…" : 'Ask anything, log data, or attach a file…')
              }
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-gold-500 focus:border-transparent outline-none resize-none leading-snug"
              style={{ minHeight: '48px', maxHeight: '160px' }}
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && pendingImages.length === 0 && !pendingFile)}
              className="px-6 py-3 bg-agri-brown-600 text-white rounded-lg hover:bg-agri-brown-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span className="hidden sm:inline">{isFr ? 'Envoyer' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
