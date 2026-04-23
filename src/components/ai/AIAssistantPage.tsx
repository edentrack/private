import { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Lightbulb, Navigation, CheckCircle, X, Mic, MicOff, Camera, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from 'react-i18next';;

interface ImageAttachment {
  data: string;       // base64 (no prefix)
  mediaType: string;
  preview: string;    // data URL for display
}

interface LogAction {
  type: 'LOG_MORTALITY' | 'LOG_EGGS' | 'LOG_EXPENSE' | 'COMPLETE_TASK' | 'LOG_WEIGHT' | 'LOG_FEED_USAGE' | 'LOG_EGG_SALE' | 'LOG_BIRD_SALE';
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
  actions?: Array<{ type: string; label: string; href: string }>;
  logAction?: LogAction;
  logConfirmed?: boolean;
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

function EdenAvatar({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 48 : size === 'md' ? 32 : 20;
  return (
    <svg width={dim} height={dim} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="20" cy="24" rx="12" ry="11" fill="#5C3D2E"/>
      {/* Head */}
      <circle cx="20" cy="14" r="10" fill="#8C7560"/>
      {/* Beak */}
      <path d="M17 16 L20 20 L23 16 Z" fill="#F5A623"/>
      {/* Eyes */}
      <circle cx="16" cy="12" r="2.5" fill="white"/>
      <circle cx="24" cy="12" r="2.5" fill="white"/>
      <circle cx="17" cy="12" r="1.2" fill="#2B1C14"/>
      <circle cx="25" cy="12" r="1.2" fill="#2B1C14"/>
      {/* Eye shine */}
      <circle cx="17.5" cy="11.3" r="0.5" fill="white"/>
      <circle cx="25.5" cy="11.3" r="0.5" fill="white"/>
      {/* Comb */}
      <path d="M17 5 Q18 2 19 5 Q20 2 21 5 Q22 2 23 5" stroke="#F5A623" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      {/* Wings */}
      <ellipse cx="9" cy="26" rx="4" ry="6" fill="#4A3124" transform="rotate(-15 9 26)"/>
      <ellipse cx="31" cy="26" rx="4" ry="6" fill="#4A3124" transform="rotate(15 31 26)"/>
      {/* Feet */}
      <path d="M15 35 L13 38 M15 35 L15 38 M15 35 L17 38" stroke="#F5A623" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M25 35 L23 38 M25 35 L25 38 M25 35 L27 38" stroke="#F5A623" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

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
  const [usageInfo, setUsageInfo] = useState<{ used: number; cap: number; tier: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveTodayMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if ((!text && pendingImages.length === 0) || loading) return;

    if (!currentFarm) {
      showToast('Please select a farm first', 'error');
      return;
    }

    const imgs = [...pendingImages];
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '',
      images: imgs.length > 0 ? imgs : undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setPendingImages([]);
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const allMessages = [
        ...messages.slice(-9).map(m => ({
          role: m.role,
          content: m.content,
          images: m.images?.map(img => ({ data: img.data, mediaType: img.mediaType })),
        })),
        {
          role: 'user' as const,
          content: text || '',
          images: imgs.length > 0 ? imgs.map(img => ({ data: img.data, mediaType: img.mediaType })) : undefined,
        },
      ];

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const fnUrl = `${supabaseUrl}/functions/v1/ai-chat`;

      const doFetch = () => fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ farm_id: currentFarm.id, messages: allMessages, include_context: true }),
      });

      let response: Response;
      try {
        response = await doFetch();
      } catch (fetchErr: any) {
        console.error('AI fetch error (attempt 1):', fetchErr?.message, fetchErr);
        await new Promise(r => setTimeout(r, 2000));
        try {
          response = await doFetch();
        } catch (fetchErr2: any) {
          console.error('AI fetch error (attempt 2):', fetchErr2?.message, fetchErr2);
          throw new Error(`Network error: ${fetchErr2?.message || 'Could not reach AI service. Check your connection.'}`);
        }
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Server error ${response.status}`);
      }
      if (data.msgsUsed && data.msgsCap) {
        setUsageInfo({ used: data.msgsUsed, cap: data.msgsCap, tier: data.tier || 'free' });
      }

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message || 'I apologize, but I could not generate a response.',
        actions: data.actions || [],
        logAction: data.logAction || null,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
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

  const confirmLog = async (messageId: string, logAction: LogAction) => {
    if (!currentFarm) return;
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logConfirmed: true } : m));
    const today = new Date().toISOString().split('T')[0];
    const currency = logAction.currency || 'XAF';

    const findFlock = async (name?: string) => {
      if (!name) return null;
      const { data } = await supabase.from('flocks').select('id,name,current_count').eq('farm_id', currentFarm.id).ilike('name', `%${name}%`).limit(1);
      return data?.[0] || null;
    };

    try {
      if (logAction.type === 'LOG_MORTALITY') {
        const flock = await findFlock(logAction.flock_name);
        if (!flock) { showToast(`Flock "${logAction.flock_name}" not found`, 'error'); return; }
        await supabase.from('mortality_logs').insert({ farm_id: currentFarm.id, flock_id: flock.id, count: logAction.count, cause: logAction.cause || 'unknown', notes: logAction.notes || '', date: today });
        showToast(`Logged ${logAction.count} deaths in ${flock.name}`, 'success');

      } else if (logAction.type === 'LOG_EGGS') {
        const flock = await findFlock(logAction.flock_name);
        if (!flock) { showToast(`Flock "${logAction.flock_name}" not found`, 'error'); return; }
        const small = logAction.small_eggs || 0;
        const medium = logAction.medium_eggs || 0;
        const large = logAction.large_eggs || 0;
        const jumbo = logAction.jumbo_eggs || 0;
        const damaged = logAction.damaged_eggs || logAction.cracked || 0;
        const totalGood = small + medium + large + jumbo;
        const eggsPerTray = 30;
        const trays = Math.floor(totalGood / eggsPerTray);
        await supabase.from('egg_collections').insert({
          farm_id: currentFarm.id, flock_id: flock.id,
          collection_date: today, collected_on: today,
          small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo,
          damaged_eggs: damaged, broken: damaged,
          total_eggs: totalGood, trays,
          notes: logAction.notes || null, created_by: user?.id,
        });
        // Sync egg_inventory
        const { data: inv } = await supabase.from('egg_inventory').select('*').eq('farm_id', currentFarm.id).maybeSingle();
        if (inv) {
          await supabase.from('egg_inventory').update({ small_eggs: (inv.small_eggs || 0) + small, medium_eggs: (inv.medium_eggs || 0) + medium, large_eggs: (inv.large_eggs || 0) + large, jumbo_eggs: (inv.jumbo_eggs || 0) + jumbo, last_updated: new Date().toISOString() }).eq('farm_id', currentFarm.id);
        } else {
          await supabase.from('egg_inventory').insert({ farm_id: currentFarm.id, small_eggs: small, medium_eggs: medium, large_eggs: large, jumbo_eggs: jumbo, last_updated: new Date().toISOString() });
        }
        showToast(`Logged ${totalGood} eggs from ${flock.name}${damaged ? ` (${damaged} damaged)` : ''}`, 'success');

      } else if (logAction.type === 'LOG_EGG_SALE') {
        const smallSold = logAction.small_eggs_sold || 0;
        const mediumSold = logAction.medium_eggs_sold || 0;
        const largeSold = logAction.large_eggs_sold || 0;
        const jumboSold = logAction.jumbo_eggs_sold || 0;
        const totalSold = smallSold + mediumSold + largeSold + jumboSold;
        const totalAmount = logAction.total_amount ||
          (smallSold * (logAction.small_price || 0)) + (mediumSold * (logAction.medium_price || 0)) +
          (largeSold * (logAction.large_price || 0)) + (jumboSold * (logAction.jumbo_price || 0));
        await supabase.from('egg_sales').insert({
          farm_id: currentFarm.id, sold_on: today, sale_date: today,
          trays: logAction.trays_sold || Math.floor(totalSold / 30),
          unit_price: logAction.small_price || logAction.medium_price || logAction.large_price || logAction.jumbo_price || 0,
          customer_name: logAction.customer_name || null, customer_phone: logAction.customer_phone || null,
          small_eggs_sold: smallSold, medium_eggs_sold: mediumSold, large_eggs_sold: largeSold, jumbo_eggs_sold: jumboSold,
          small_price: logAction.small_price || 0, medium_price: logAction.medium_price || 0,
          large_price: logAction.large_price || 0, jumbo_price: logAction.jumbo_price || 0,
          payment_status: logAction.payment_status || 'paid', notes: logAction.notes || null,
        });
        // Deduct from egg_inventory
        const { data: inv } = await supabase.from('egg_inventory').select('*').eq('farm_id', currentFarm.id).maybeSingle();
        if (inv) {
          await supabase.from('egg_inventory').update({
            small_eggs: Math.max(0, (inv.small_eggs || 0) - smallSold),
            medium_eggs: Math.max(0, (inv.medium_eggs || 0) - mediumSold),
            large_eggs: Math.max(0, (inv.large_eggs || 0) - largeSold),
            jumbo_eggs: Math.max(0, (inv.jumbo_eggs || 0) - jumboSold),
            last_updated: new Date().toISOString(),
          }).eq('farm_id', currentFarm.id);
        }
        // Record revenue
        if (totalAmount > 0) {
          await supabase.from('revenues').insert({ farm_id: currentFarm.id, source_type: 'egg_sale', amount: totalAmount, currency, description: logAction.customer_name ? `Egg sale to ${logAction.customer_name} — ${totalSold} eggs` : `Egg sale — ${totalSold} eggs`, revenue_date: today });
        }
        showToast(`Logged sale of ${totalSold} eggs${totalAmount ? ` for ${totalAmount.toLocaleString()} ${currency}` : ''}`, 'success');

      } else if (logAction.type === 'LOG_BIRD_SALE') {
        const flock = await findFlock(logAction.flock_name);
        if (!flock) { showToast(`Flock "${logAction.flock_name}" not found`, 'error'); return; }
        const birdsSold = logAction.birds_sold || 0;
        const pricePerBird = logAction.price_per_bird || 0;
        const totalAmount = logAction.total_amount || (birdsSold * pricePerBird);
        const saleMethod = pricePerBird > 0 ? 'per_bird' : 'lump_sum';
        await supabase.from('bird_sales').insert({
          farm_id: currentFarm.id, flock_id: flock.id, sale_date: today,
          birds_sold: birdsSold, price_per_bird: pricePerBird || null, total_amount: totalAmount,
          sale_method: saleMethod, sale_type: 'sale',
          customer_name: logAction.customer_name || null, customer_phone: logAction.customer_phone || null,
          payment_status: logAction.payment_status || 'paid',
          amount_paid: logAction.payment_status === 'pending' ? 0 : totalAmount,
          amount_pending: logAction.payment_status === 'pending' ? totalAmount : 0,
          notes: logAction.notes || null, recorded_by: user?.id,
        });
        showToast(`Logged sale of ${birdsSold} birds from ${flock.name}${totalAmount ? ` — ${totalAmount.toLocaleString()} ${currency}` : ''}`, 'success');

      } else if (logAction.type === 'LOG_EXPENSE') {
        await supabase.from('expenses').insert({ farm_id: currentFarm.id, category: logAction.category, amount: logAction.amount, description: logAction.description, currency, date: today });
        showToast(`Logged expense: ${logAction.description}`, 'success');

      } else if (logAction.type === 'LOG_WEIGHT') {
        const flock = await findFlock(logAction.flock_name);
        if (!flock) { showToast(`Flock "${logAction.flock_name}" not found`, 'error'); return; }
        await supabase.from('weight_records').insert({ farm_id: currentFarm.id, flock_id: flock.id, avg_weight: logAction.avg_weight_kg, sample_size: logAction.sample_size || 10, record_date: today });
        showToast(`Logged weight for ${flock.name}`, 'success');

      } else if (logAction.type === 'LOG_FEED_USAGE') {
        const { data: stock } = await supabase.from('feed_stock').select('id,current_stock_bags').eq('farm_id', currentFarm.id).ilike('feed_type', `%${logAction.feed_type}%`).limit(1);
        if (stock?.[0]) {
          await supabase.from('feed_stock').update({ current_stock_bags: Math.max(0, (stock[0].current_stock_bags || 0) - (logAction.bags_used || 0)) }).eq('id', stock[0].id);
          showToast(`Recorded ${logAction.bags_used} bag(s) of ${logAction.feed_type} used`, 'success');
        }
      }
    } catch (err: any) {
      showToast('Failed to save: ' + err.message, 'error');
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, logConfirmed: false } : m));
    }
  };

  const summariseLogAction = (a: LogAction): string => {
    const cur = a.currency || '';
    if (a.type === 'LOG_MORTALITY') return `${a.count} death(s) in "${a.flock_name}"${a.cause ? ` — cause: ${a.cause}` : ''}`;
    if (a.type === 'LOG_EGGS') {
      const parts = [];
      if (a.small_eggs) parts.push(`${a.small_eggs} small`);
      if (a.medium_eggs) parts.push(`${a.medium_eggs} medium`);
      if (a.large_eggs) parts.push(`${a.large_eggs} large`);
      if (a.jumbo_eggs) parts.push(`${a.jumbo_eggs} jumbo`);
      const total = (a.small_eggs||0)+(a.medium_eggs||0)+(a.large_eggs||0)+(a.jumbo_eggs||0);
      return `Collect ${total} eggs (${parts.join(', ') || 'ungraded'}) from "${a.flock_name}"${(a.damaged_eggs||a.cracked) ? ` · ${a.damaged_eggs||a.cracked} damaged` : ''}`;
    }
    if (a.type === 'LOG_EGG_SALE') {
      const total = (a.small_eggs_sold||0)+(a.medium_eggs_sold||0)+(a.large_eggs_sold||0)+(a.jumbo_eggs_sold||0);
      const amount = a.total_amount || ((a.small_eggs_sold||0)*(a.small_price||0)+(a.medium_eggs_sold||0)*(a.medium_price||0)+(a.large_eggs_sold||0)*(a.large_price||0)+(a.jumbo_eggs_sold||0)*(a.jumbo_price||0));
      return `Sell ${total} eggs${amount ? ` for ${amount.toLocaleString()} ${cur}` : ''}${a.customer_name ? ` → ${a.customer_name}` : ''}`;
    }
    if (a.type === 'LOG_BIRD_SALE') {
      const total = a.total_amount || ((a.birds_sold||0)*(a.price_per_bird||0));
      return `Sell ${a.birds_sold} bird(s) from "${a.flock_name}"${total ? ` for ${total.toLocaleString()} ${cur}` : ''}${a.customer_name ? ` → ${a.customer_name}` : ''}`;
    }
    if (a.type === 'LOG_EXPENSE') return `${a.description} — ${(a.amount||0).toLocaleString()} ${cur}`;
    if (a.type === 'LOG_WEIGHT') return `Weight for "${a.flock_name}": ${a.avg_weight_kg} kg avg`;
    if (a.type === 'LOG_FEED_USAGE') return `${a.bags_used} bag(s) of ${a.feed_type} used`;
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
          <p className="text-gray-500">Please select a farm to use the AI Assistant</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-[600px] bg-gray-50">
      {/* Header */}
      <div data-tour="ai-header" className="flex-shrink-0 bg-white border-b border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <EdenAvatar size="md" />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-agri-brown-700">Eden</h1>
            <p className="text-sm text-gray-500">Farm performance · Flock health · Diagnostics</p>
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
            <div className="mb-3">
              <EdenAvatar size="lg" />
            </div>
            <h2 className="text-xl font-bold text-agri-brown-700 mb-1">Hey, I'm Eden!</h2>
            <p className="text-gray-600 mb-6 max-w-md text-sm">
              Your farm advisor. Ask about flock health, performance, expenses, or just tell me what happened today and I'll log it for you.
            </p>
            
            {/* Suggestions */}
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
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-agri-brown-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-900'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <EdenAvatar size="sm" />
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
                  {message.content && (
                    <div className={`prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-strong:font-semibold prose-hr:my-2 ${message.role === 'user' ? 'prose-invert' : ''}`}>
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                  {message.logAction && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      {message.logConfirmed ? (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Saved to your farm records
                        </p>
                      ) : (
                        <div>
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
                    <EdenAvatar size="sm" />
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
          <div className="flex gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => addImages(e.target.files)}
            />
            {/* Camera/photo button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || pendingImages.length >= 3}
              title="Attach photo (bird, droppings, lesion)"
              className="px-3 py-3 rounded-lg bg-gray-100 text-gray-500 hover:bg-agri-gold-50 hover:text-agri-brown-600 disabled:opacity-40 transition-colors flex items-center justify-center"
            >
              <Camera className="w-5 h-5" />
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
              placeholder={listening ? 'Listening...' : pendingImages.length > 0 ? 'Describe what you see, or just hit Send...' : 'Ask anything, log data, or send a photo...'}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-agri-gold-500 focus:border-transparent outline-none"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim() && pendingImages.length === 0)}
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
