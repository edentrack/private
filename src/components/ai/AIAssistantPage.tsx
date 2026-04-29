import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Lightbulb, Navigation, CheckCircle, X, Mic, MicOff, Camera, Bot, Paperclip, FileSpreadsheet } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from 'react-i18next';
import { EdenAvatarAnimated } from './EdenAvatarAnimated';

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
  type: 'LOG_MORTALITY' | 'LOG_EGGS' | 'LOG_EXPENSE' | 'LOG_PURCHASE' | 'COMPLETE_TASK' | 'LOG_WEIGHT' | 'LOG_FEED_USAGE' | 'LOG_EGG_SALE' | 'LOG_BIRD_SALE';
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
  // Weight
  avg_weight_kg?: number;
  sample_size?: number;
  // Feed
  feed_type?: string;
  bags_used?: number;
  // Task
  task_title_hint?: string;
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

const SUGGESTIONS = [
  "Analyze my farm's performance this week",
  "My birds are sneezing and have runny eyes — what's wrong?",
  "Mortality spiked this week — what should I check?",
  "When should I sell my broilers?",
  "What vaccines do my birds need right now?",
  "My FCR seems high — what could be causing it?",
  "How can I reduce my feed costs?",
  "What's my profit margin?",
];


const STORAGE_KEY = 'eden_chat_messages';
const STORAGE_DATE_KEY = 'eden_chat_date';

function loadTodayMessages(): ChatMessage[] {
  try {
    const savedDate = localStorage.getItem(STORAGE_DATE_KEY);
    const today = new Date().toDateString();
    if (savedDate !== today) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_DATE_KEY, today);
      return [];
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
  } catch {
    return [];
  }
}

function saveTodayMessages(msgs: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    localStorage.setItem(STORAGE_DATE_KEY, new Date().toDateString());
  } catch {}
}

export function AIAssistantPage() {
  const { currentFarm, user } = useAuth();
  const { showToast } = useToast();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadTodayMessages());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([]);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [usageInfo, setUsageInfo] = useState<{ used: number; cap: number; tier: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveTodayMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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


  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Voice input not supported in this browser', 'error');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
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
      showToast('Could not read file — make sure it is a plain CSV or text file', 'error');
    }
  };

  const checkForDuplicate = async (logAction: LogAction, farmId: string): Promise<string | null> => {
    const today = new Date().toISOString().split('T')[0];
    try {
      if (logAction.type === 'LOG_EGG_SALE') {
        const saleDay = logAction.sale_date || logAction.log_date || today;
        if (logAction.customer_name) {
          const { data } = await supabase.from('egg_sales').select('id, total_eggs').eq('farm_id', farmId).eq('sale_date', saleDay).ilike('customer_name', `%${logAction.customer_name}%`).limit(1);
          if (data?.length) return `Egg sale to "${logAction.customer_name}" on ${saleDay} already exists (${data[0].total_eggs} eggs)`;
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
    const today = new Date().toISOString().split('T')[0];
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
      if (!mortData?.length) throw new Error('Mortality record not saved — possible permission issue. Check you are logged in.');

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
        // omit 'date' and 'trays_collected' — legacy columns with defaults set by migration; PostgREST schema cache issue
        collection_date: recordDate, collected_on: recordDate,
        small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo,
        damaged_eggs: damaged, broken: damaged,
        total_eggs: totalGood, trays,
        notes: logAction.notes || null, created_by: user?.id || null,
      }).select('id');
      if (collErr) throw new Error(`Egg collection save failed: ${collErr.message}`);
      if (!collData?.length) throw new Error('Collection not saved — possible permission issue. Check you are logged in.');
      const { data: inv } = await supabase.from('egg_inventory').select('*').eq('farm_id', farmId).maybeSingle();
      if (inv) {
        await supabase.from('egg_inventory').update({ small_eggs: (inv.small_eggs || 0) + small, medium_eggs: (inv.medium_eggs || 0) + medium, large_eggs: (inv.large_eggs || 0) + large, jumbo_eggs: (inv.jumbo_eggs || 0) + jumbo, last_updated: new Date().toISOString() }).eq('farm_id', farmId);
      } else {
        await supabase.from('egg_inventory').insert({ farm_id: farmId, small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo, last_updated: new Date().toISOString() });
      }

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
      // Mirror LogSaleModal's insert exactly — same columns, same order, no legacy fields
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
      if (!saleData?.length) throw new Error('Sale not saved — possible permission issue. Try logging out and back in.');
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
      if (!birdSaleData?.length) throw new Error('Bird sale not saved — possible permission issue.');

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
      if (!purchaseData?.length) throw new Error('Purchase not saved — possible permission issue.');
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

    } else if (logAction.type === 'LOG_EXPENSE') {
      const { data: expData, error: expErr } = await supabase.from('expenses').insert({
        user_id: user?.id || null,
        farm_id: farmId, category: logAction.category, amount: logAction.amount,
        description: logAction.description, currency, incurred_on: recordDate,
      }).select('id');
      if (expErr) throw new Error(`Expense save failed: ${expErr.message}`);
      if (!expData?.length) throw new Error('Expense not saved — possible permission issue.');

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
      if (!weightData?.length) throw new Error('Weight record not saved — possible permission issue.');

    } else if (logAction.type === 'LOG_FEED_USAGE') {
      const { data: stock } = await supabase.from('feed_stock').select('id,current_stock_bags').eq('farm_id', farmId).ilike('feed_type', `%${logAction.feed_type}%`).limit(1);
      if (stock?.[0]) {
        await supabase.from('feed_stock').update({ current_stock_bags: Math.max(0, (stock[0].current_stock_bags || 0) - (logAction.bags_used || 0)) }).eq('id', stock[0].id);
      }
    }
  };

  const confirmLog = async (messageId: string, logAction: LogAction) => {
    if (!currentFarm) return;

    // Duplicate detection for single logs
    const dupeMsg = await checkForDuplicate(logAction, currentFarm.id);
    if (dupeMsg) {
      const ok = window.confirm(`⚠️ Possible duplicate detected:\n${dupeMsg}\n\nSave anyway?`);
      if (!ok) return;
    }

    // Show saving spinner — do NOT set logConfirmed yet (only after DB write confirmed)
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logSaving: true, logError: undefined } : m));
    const currency = logAction.currency || 'XAF';

    try {
      await executeLogAction(logAction, currentFarm.id, currency);

      // Only set logConfirmed AFTER the insert actually succeeded
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logSaving: false, logConfirmed: true } : m));

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

    const selectedActions = actions.filter((_, i) => selected[i]);
    if (selectedActions.length === 0) return;

    // Pre-check for duplicates
    const dupeMessages: string[] = [];
    for (const action of selectedActions) {
      const dupe = await checkForDuplicate(action, currentFarm.id);
      if (dupe) dupeMessages.push(dupe);
    }
    if (dupeMessages.length > 0) {
      const ok = window.confirm(`⚠️ ${dupeMessages.length} possible duplicate(s) detected:\n\n${dupeMessages.slice(0, 5).join('\n')}${dupeMessages.length > 5 ? `\n...and ${dupeMessages.length - 5} more` : ''}\n\nImport anyway (duplicates will be skipped)?`);
      if (!ok) return;
    }

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
      'the relevant section';

    if (successCount > 0) {
      showToast(`Saved ${successCount} of ${selectedActions.length} record${selectedActions.length !== 1 ? 's' : ''}${errors.length ? ` (${errors.length} skipped)` : ''}`, 'success');
      const skipped = errors.filter(e => e.startsWith('Skipped:')).length;
      const failed = errors.length - skipped;
      const lines: string[] = [`✅ **${successCount} of ${selectedActions.length}** records saved.`];
      if (skipped > 0) lines.push(`⚠️ **${skipped}** skipped — already in the system.`);
      if (failed > 0) lines.push(`❌ **${failed}** failed to save — please retry those individually.`);
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
        content: `❌ None of the ${selectedActions.length} records could be saved — ${errors[0] || 'unknown error'}.\n\nTry again or paste a smaller batch and I'll log them for you.`,
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

      showToast(`Pay run saved — ${action.worker_name} paid ${(action.currency || 'XAF')} ${totalAmount.toLocaleString()}`, 'success');
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

    if (!currentFarm) {
      showToast('Please select a farm first', 'error');
      return;
    }

    const imgs = [...pendingImages];
    const fileAttachment = pendingFile;

    // Append CSV content to the text message
    const fileBlock = fileAttachment
      ? `\n\n--- Attached File: ${fileAttachment.name} (${fileAttachment.rowCount} data rows) ---\n${fileAttachment.content}\n---`
      : '';
    const fullText = (text || '') + fileBlock;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text || (fileAttachment ? `Please import ${fileAttachment.name}` : ''),
      images: imgs.length > 0 ? imgs : undefined,
      attachedFile: fileAttachment ? { name: fileAttachment.name, rowCount: fileAttachment.rowCount } : undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setPendingImages([]);
    setPendingFile(null);
    setLoading(true);

    try {
      let { data: { session } } = await supabase.auth.getSession();
      // Refresh if token is expired or within 60 seconds of expiry
      if (!session || (session.expires_at && session.expires_at * 1000 - Date.now() < 60_000)) {
        const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || !refreshed.session) {
          throw new Error('Your session expired — please reload the page and try again.');
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

      const body = JSON.stringify({ farm_id: currentFarm.id, messages: allMessages, include_context: true });

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
            ? 'Request timed out — Eden AI is slow to start. Try again in a moment.'
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
            : `Server error ${response.status} — please try again.`
        );
      }
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Server error ${response.status}`);
      }
      if (data.msgsUsed && data.msgsCap) {
        setUsageInfo({ used: data.msgsUsed, cap: data.msgsCap, tier: data.tier || 'free' });
      }

      const bulkActions: LogAction[] = data.bulkLogActions || [];
      const msgId = (Date.now() + 1).toString();

      const assistantMessage: ChatMessage = {
        id: msgId,
        role: 'assistant',
        content: data.message || 'I apologize, but I could not generate a response.',
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
    if (a.type === 'LOG_MORTALITY') return `${a.count} death(s) in "${a.flock_name}"${a.cause ? ` — ${a.cause}` : ''}${dateLabel}`;
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
    <div className="flex flex-col h-full min-h-[600px] bg-gray-50">
      {/* Header */}
      <div data-tour="ai-header" className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <EdenAvatarAnimated size="md" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-agri-brown-700">Eden</h1>
            <p className="text-sm text-gray-500">Farm performance · Flock health · Diagnostics · Data import</p>
          </div>
          <div className="flex items-center gap-2">
            {usageInfo && (
              <div className={`text-xs px-2 py-1 rounded-full font-medium ${
                usageInfo.used >= usageInfo.cap
                  ? 'bg-red-100 text-red-700'
                  : usageInfo.used >= usageInfo.cap * 0.8
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-500'
              }`}>
                {usageInfo.tier === 'free' ? `${usageInfo.used}/${usageInfo.cap} today` : `${usageInfo.used}/${usageInfo.cap === 99999 ? '∞' : usageInfo.cap} this month`}
              </div>
            )}
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Clear Chat
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="mb-4">
              <EdenAvatarAnimated size="lg" expanded />
            </div>
            <h2 className="text-xl font-bold text-agri-brown-700 mb-1">Hey, I'm Eden!</h2>
            <p className="text-gray-600 mb-6 max-w-md text-sm">
              Your farm advisor. Ask about flock health, performance, expenses — or attach a CSV file and I'll import your historical data.
            </p>

            <div className="w-full max-w-2xl">
              <p className="text-sm font-medium text-gray-700 mb-3">Try asking:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-agri-gold-400 hover:bg-agri-gold-50 transition-colors text-sm text-gray-700"
                  >
                    <Lightbulb className="w-4 h-4 inline mr-2 text-agri-gold-500" />
                    {suggestion}
                  </button>
                ))}
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="text-left px-4 py-3 bg-white border border-gray-200 rounded-lg hover:border-agri-gold-400 hover:bg-agri-gold-50 transition-colors text-sm text-gray-700"
                >
                  <FileSpreadsheet className="w-4 h-4 inline mr-2 text-green-600" />
                  Import historical data from a CSV file
                </button>
              </div>
            </div>
          </div>
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
                    const clean = message.content
                      .replace(/\[BULK_LOG\][\s\S]*?\[\/BULK_LOG\]/g, '')
                      .replace(/\[BULK_LOG\][\s\S]*/g, '')
                      .replace(/\[LOG\][\s\S]*?\[\/LOG\]/g, '')
                      .replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/g, '')
                      .trim();
                    return clean ? (
                      <div className={`prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-strong:font-semibold prose-hr:my-2 ${message.role === 'user' ? 'prose-invert' : ''}`}>
                        <ReactMarkdown>{clean}</ReactMarkdown>
                      </div>
                    ) : null;
                  })()}

                  {/* Single log confirm */}
                  {message.logAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.logConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Saved to your farm records
                        </p>
                      ) : message.logSaving ? (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                        </p>
                      ) : (
                        <div>
                          {message.logError && (
                            <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-2 break-all">
                              Save failed: {message.logError}
                            </p>
                          )}
                          <p className="text-xs font-medium text-gray-700 mb-1">Save this to your records?</p>
                          <p className="text-xs text-gray-500 mb-2 bg-gray-50 rounded px-2 py-1">{summariseLogAction(message.logAction)}</p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmLog(message.id, message.logAction!)}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-medium flex items-center gap-1"
                            >
                              <CheckCircle className="w-3 h-3" /> Yes, save it
                            </button>
                            <button
                              onClick={() => setMessages(prev => prev.map(m => m.id === message.id ? { ...m, logAction: undefined } : m))}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 text-xs font-medium flex items-center gap-1"
                            >
                              <X className="w-3 h-3" /> No thanks
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                            <p><strong>Period:</strong> {message.payRunAction.pay_period_start || '—'} to {message.payRunAction.pay_period_end || message.payRunAction.pay_date}</p>
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
                          <p className="text-xs font-semibold text-green-900">Save to Farm Setup?</p>
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
                          <p className="text-xs font-semibold text-indigo-900">Add Worker to Farm?</p>
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
      <div className="flex-shrink-0 bg-white border-t border-gray-200 p-4">
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

          <div className="flex gap-2">
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

            {/* Camera/photo button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || pendingImages.length >= 3}
              title="Attach photo (bird, droppings, lesion, receipt)"
              className="px-3 py-3 rounded-lg bg-gray-100 text-gray-500 hover:bg-agri-gold-50 hover:text-agri-brown-600 disabled:opacity-40 transition-colors flex items-center justify-center"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* CSV/file import button */}
            <button
              onClick={() => csvInputRef.current?.click()}
              disabled={loading || !!pendingFile}
              title="Attach CSV/spreadsheet for bulk import"
              className="px-3 py-3 rounded-lg bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700 disabled:opacity-40 transition-colors flex items-center justify-center"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Mic button */}
            <button
              onClick={toggleVoice}
              disabled={loading}
              title={listening ? 'Stop listening' : 'Speak to Eden'}
              className={`px-3 py-3 rounded-lg transition-colors flex items-center justify-center ${
                listening
                  ? 'bg-red-100 text-red-600 animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-agri-gold-50 hover:text-agri-brown-600'
              } disabled:opacity-40`}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                listening ? 'Listening...'
                : pendingFile ? `Ask Eden to import ${pendingFile.name}…`
                : pendingImages.length > 0 ? 'Describe what you see, or just hit Send…'
                : 'Ask anything, log data, or attach a file…'
              }
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-gold-500 focus:border-transparent outline-none"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && pendingImages.length === 0 && !pendingFile)}
              className="px-6 py-3 bg-agri-brown-600 text-white rounded-lg hover:bg-agri-brown-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
