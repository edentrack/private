import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  // Reflect the caller's origin when it's a known trusted source.
  // For installed PWAs on Android the Origin header is "null" or absent —
  // in those cases we fall back to ALLOWED_ORIGIN so the CORS check passes.
  // JWT auth is the real security gate; CORS is defence-in-depth only.
  const trustedOrigin =
    origin === ALLOWED_ORIGIN ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.endsWith(".vercel.app");

  const allowOrigin = trustedOrigin ? origin : ALLOWED_ORIGIN;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Vary": "Origin",
  };
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const AI_ENABLED = Deno.env.get("AI_ENABLED") !== "false";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL_HAIKU   = "claude-haiku-4-5-20251001";  // fast, simple tasks
const MODEL_SONNET  = "claude-sonnet-4-6";           // standard analysis, health advice
// Opus reserved for future use if needed

const MAX_REQUESTS_PER_MINUTE = 15;

function selectModel(messages: ChatMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return MODEL_SONNET;

  // Always use Sonnet for image analysis — vision requires full capability
  if (last.images && last.images.length > 0) return MODEL_SONNET;

  const text = (last.content || "").toLowerCase().trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  // Escalate to Sonnet for complex topics
  const complexKeywords = [
    "diagnos", "disease", "symptom", "sick", "dying", "mort", "outbreak",
    "analyse", "analyze", "performance", "profit", "loss", "fcr", "report",
    "calculate", "why", "what's wrong", "broke", "cause", "compare",
    "benchmark", "laying rate", "break-even", "cash flow", "recommend",
    "advise", "should i", "is it", "poop", "droppings", "blood",
    "Newcastle", "Gumboro", "coccidiosis", "IBD", "Marek", "influenza",
  ];
  const needsSonnet = complexKeywords.some(kw => text.includes(kw));
  if (needsSonnet) return MODEL_SONNET;

  // Bulk/multi-entry messages must NEVER go to Haiku — Haiku's 512-token cap truncates the JSON array
  // Detect: "log these N ...", numbered lists like "1) ...", or multi-entry keywords
  const isBulkEntry = /\b(log|record|add|save)\s+(these\s+)?\d+\b/i.test(text)  // "log these 15 expenses"
    || /\b\d+\)\s/.test(text)                                                       // numbered list: "1) item"
    || (text.match(/\bxaf\b/g) || []).length >= 3                                   // 3+ XAF amounts = bulk
    || (text.match(/,\s*\d+[).]?\s/g) || []).length >= 3;                          // 3+ comma-separated entries
  if (isBulkEntry) return MODEL_SONNET;

  // Short simple messages → Haiku (greetings, quick logs, single-field answers)
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|good|great)[.!?]?$/i,
    /^(log|add|record|save|mark|update)\s/i,         // simple data entry
    /^(how many|what is my|show me|list|tell me)\s/i, // simple lookups
  ];
  const isSimple = wordCount <= 8 || simplePatterns.some(p => p.test(text));
  if (isSimple) return MODEL_HAIKU;

  // Default to Sonnet for everything else
  return MODEL_SONNET;
}

interface ImageAttachment {
  data: string;       // base64
  mediaType: string;  // e.g. image/jpeg
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: ImageAttachment[];
}

interface ChatRequest {
  farm_id: string;
  messages: ChatMessage[];
  include_context?: boolean;
}

async function getFarmContext(supabase: any, farmId: string): Promise<{ context: string; setupConfig: any }> {
  // Fetch farm meta first so timezone-aware dates are available for all subsequent queries.
  // Without this, Deno runs in UTC — farms in UTC+1 (e.g. WAT) see "tomorrow" as today
  // after 11 PM local time, causing the LLM to generate wrong due_dates for CREATE_TASK.
  const { data: farmMeta } = await supabase.from("farms").select("created_at, timezone").eq("id", farmId).maybeSingle();
  const farmStart = farmMeta?.created_at?.split("T")[0] || "2020-01-01";
  const farmTz = farmMeta?.timezone || "UTC";

  // en-CA locale reliably returns YYYY-MM-DD, matching our DATE column format
  const toDateStr = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: farmTz }).format(d);
  const today = toDateStr(new Date());
  const thirtyDaysAgo = toDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const sevenDaysAgo = toDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

  // Use allSettled so a single slow/failing DB query never crashes the whole context fetch
  const settled = await Promise.allSettled([
    supabase.from("farms").select("name, currency, currency_code, location").eq("id", farmId).maybeSingle(),
    supabase.from("flocks").select("id, name, type, current_count, initial_count, status, start_date").eq("farm_id", farmId),
    supabase.from("tasks").select("id, status, scheduled_for, title_override, priority").eq("farm_id", farmId).eq("is_archived", false).gte("scheduled_for", `${thirtyDaysAgo}T00:00:00`),
    supabase.from("feed_stock").select("id, feed_type, current_stock_bags, bags_in_stock, unit, kg_per_unit").eq("farm_id", farmId),
    supabase.from("other_inventory").select("id, item_name, quantity, unit, category").eq("farm_id", farmId),
    supabase.from("expenses").select("amount, category, description, incurred_on, currency").eq("farm_id", farmId).gte("incurred_on", farmStart).order("incurred_on", { ascending: false }),
    supabase.from("egg_sales").select("total_amount, sale_date, customer_name, payment_status, total_eggs").eq("farm_id", farmId).gte("sale_date", farmStart).order("sale_date", { ascending: false }),
    supabase.from("bird_sales").select("total_amount, sale_date, customer_name, payment_status, birds_sold").eq("farm_id", farmId).gte("sale_date", farmStart).order("sale_date", { ascending: false }),
    supabase.from("mortality_logs").select("count, cause, event_date, flock_id, notes").eq("farm_id", farmId).gte("event_date", farmStart).order("event_date", { ascending: false }),
    supabase.from("weight_logs").select("average_weight, date, flock_id, sample_size").eq("farm_id", farmId).gte("date", farmStart).order("date", { ascending: false }),
    supabase.from("vaccinations").select("vaccine_name, administered_date, flock_id, notes").eq("farm_id", farmId).gte("administered_date", farmStart).order("administered_date", { ascending: false }),
    supabase.from("egg_collections").select("total_eggs, collection_date, flock_id, damaged_eggs").eq("farm_id", farmId).gte("collection_date", thirtyDaysAgo).order("collection_date", { ascending: false }),
    supabase.from("payroll_items").select("worker_name, net_pay, base_pay, bonus_amount, currency, status, created_at").eq("farm_id", farmId).gte("created_at", farmStart).order("created_at", { ascending: false }),
    supabase.from("farm_workers").select("id, name, role, pay_type, monthly_salary, hourly_rate, currency, is_active").eq("farm_id", farmId).eq("is_active", true),
    supabase.from("worker_pay_rates").select("user_id, pay_type, hourly_rate, monthly_salary, currency").eq("farm_id", farmId),
    supabase.from("farm_setup_config").select("egg_prices, payout_account, default_pay_day, ai_permissions").eq("farm_id", farmId).maybeSingle(),
    supabase.rpc("get_farm_members_with_emails", { p_farm_id: farmId }),
  ]);
  const ok = (i: number) => settled[i].status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<any>).value : { data: null };
  const [
    farmRes, flocksRes, tasksRes, feedRes, otherInvRes,
    expensesRes, eggSalesRes, birdSalesRes, mortalityRes, weightRes,
    vaccinationsRes, eggRes, payrollRes, workersRes, payRatesRes, setupConfigRes, teamMembersRes,
  ] = Array.from({ length: 17 }, (_, i) => ok(i));

  const farm = farmRes.data;
  const currency = farm?.currency_code || farm?.currency || "XAF";
  const flocks = flocksRes.data || [];
  const tasks = tasksRes.data || [];
  const feedStock = feedRes.data || [];
  const otherInventory = otherInvRes.data || [];
  const expenses = expensesRes.data || [];
  const eggSales = eggSalesRes.data || [];
  const birdSales = birdSalesRes.data || [];
  const sales = [...eggSales, ...birdSales].sort((a: any, b: any) => (b.sale_date || "").localeCompare(a.sale_date || ""));
  const mortality = mortalityRes.data || [];
  const weights = weightRes.data || [];
  const vaccinations = vaccinationsRes.data || [];
  const eggs = eggRes.data || [];
  const payroll = payrollRes.data || [];
  const farmWorkers = workersRes.data || [];
  const payRates = payRatesRes.data || [];
  const setupConfig = setupConfigRes.data;
  const teamMembers = teamMembersRes.data || [];

  // farm_workers already has pay info built in
  const workersWithPay = farmWorkers;

  // Setup score for context
  const setupScore = {
    has_flocks: flocks.some((f: any) => f.status === "active"),
    has_workers: farmWorkers.length > 0,
    has_pay_rates: farmWorkers.some((w: any) => w.monthly_salary || w.hourly_rate),
    has_egg_prices: Object.keys(setupConfig?.egg_prices || {}).length > 0,
    has_recent_activity: expenses.length > 0 || sales.length > 0,
  };
  const setupPct = Math.round((Object.values(setupScore).filter(Boolean).length / 5) * 100);

  const overdueTasks = tasks.filter((t: any) => t.status === "pending" && t.scheduled_for?.split("T")[0] < today);
  const todayTasks = tasks.filter((t: any) => t.scheduled_for?.startsWith(today));
  const expenses7d = expenses.filter((e: any) => e.incurred_on >= sevenDaysAgo);
  const sales7d = sales.filter((s: any) => s.sale_date >= sevenDaysAgo);
  const mortality7d = mortality.filter((m: any) => m.event_date >= sevenDaysAgo);

  const totalExpenses30d = expenses.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0);
  const totalExpenses7d = expenses7d.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0);
  const totalSales30d = sales.reduce((s: number, e: any) => s + (parseFloat(e.total_amount) || 0), 0);
  const totalSales7d = sales7d.reduce((s: number, e: any) => s + (parseFloat(e.total_amount) || 0), 0);
  const totalMortality7d = mortality7d.reduce((s: number, m: any) => s + (m.count || 0), 0);
  const totalMortality30d = mortality.reduce((s: number, m: any) => s + (m.count || 0), 0);

  // Expense breakdown by category
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (parseFloat(e.amount) || 0);
  });

  // Flock-level mortality rate
  const mortalityByFlock: Record<string, number> = {};
  mortality.forEach((m: any) => {
    mortalityByFlock[m.flock_id] = (mortalityByFlock[m.flock_id] || 0) + (m.count || 0);
  });

  let context = `## Farm Context: ${farm?.name || "Unknown Farm"} (${today})\n`;
  context += `Currency: ${currency} | Location: ${farm?.location || "not set"}\n\n`;

  context += `### Flocks\n`;
  if (flocks.length === 0) {
    context += "No flocks recorded.\n";
  } else {
    flocks.forEach((f: any) => {
      const fMortality = mortalityByFlock[f.id] || 0;
      const mortalityRate = f.initial_count ? ((fMortality / f.initial_count) * 100).toFixed(1) : "?";
      const latest = weights.filter((w: any) => w.flock_id === f.id)[0];
      const latestWeight = latest ? `${latest.average_weight}kg avg (${latest.date})` : "no weight records";
      const latestEggs = eggs.filter((e: any) => e.flock_id === f.id).slice(0, 3);
      const layingRate = latestEggs.length && f.current_count
        ? `laying rate ~${((latestEggs.reduce((s: number, e: any) => s + (e.total_eggs || 0), 0) / latestEggs.length / f.current_count) * 100).toFixed(0)}%`
        : "";
      const dayAge = f.start_date ? `age ${Math.floor((Date.now() - new Date(f.start_date).getTime()) / 86400000)} days` : "";
      context += `- **${f.name}** [${f.status}]: ${f.type || "unknown"}, ${f.current_count ?? "?"}/${f.initial_count || "?"} birds, ${dayAge}, mortality all-time: ${fMortality} birds (${mortalityRate}%), weight: ${latestWeight}${layingRate ? ", " + layingRate : ""}\n`;
    });
  }

  context += `\n### Tasks\n`;
  context += `- Today: ${todayTasks.filter((t: any) => t.status === "pending").length} pending, ${todayTasks.filter((t: any) => t.status === "completed").length} completed\n`;
  context += `- Overdue: ${overdueTasks.length} tasks\n`;
  if (overdueTasks.length > 0) {
    overdueTasks.slice(0, 5).forEach((t: any) => {
      context += `  · "${t.title_override || "task"}" — due ${t.scheduled_for?.split("T")[0]}\n`;
    });
  }

  context += `\n### Inventory\n`;
  feedStock.forEach((f: any) => {
    const stockQty = f.current_stock_bags ?? f.bags_in_stock ?? 0;
    const lowFlag = stockQty < 5 ? " ⚠️ LOW" : "";
    context += `- ${f.feed_type}: ${stockQty} bags${f.kg_per_unit ? ` (${f.kg_per_unit}kg/bag)` : ""}${lowFlag}\n`;
  });
  otherInventory.forEach((i: any) => {
    context += `- ${i.item_name}: ${i.quantity} ${i.unit || "units"}${i.category ? ` [${i.category}]` : ""}\n`;
  });

  context += `\n### Financials (all time since ${farmStart})\n`;
  context += `- Total expenses: ${currency} ${totalExpenses30d.toFixed(0)} | Last 30d: ${currency} ${expenses.filter((e: any) => e.incurred_on >= thirtyDaysAgo).reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0).toFixed(0)}\n`;
  context += `- Total sales: ${currency} ${totalSales30d.toFixed(0)} | Last 30d: ${currency} ${sales.filter((s: any) => s.sale_date >= thirtyDaysAgo).reduce((s: number, e: any) => s + (parseFloat(e.total_amount) || 0), 0).toFixed(0)}\n`;
  context += `- Net profit all time: ${currency} ${(totalSales30d - totalExpenses30d).toFixed(0)}\n`;
  if (Object.keys(expenseByCategory).length > 0) {
    context += `- Expense breakdown: ${Object.entries(expenseByCategory).map(([k, v]) => `${k}: ${currency} ${(v as number).toFixed(0)}`).join(", ")}\n`;
  }

  // Individual records — used for UPDATE/VOID lookups and duplicate detection (capped to avoid context bloat)
  if (eggSales.length > 0) {
    context += `\n### Egg Sales (last ${Math.min(eggSales.length, 50)} of ${eggSales.length} records)\n`;
    eggSales.slice(0, 50).forEach((s: any) => {
      context += `- [${s.sale_date}] ${s.customer_name || "Unknown"}: ${s.total_eggs || 0} eggs — ${currency} ${s.total_amount || 0} [${s.payment_status || "paid"}]\n`;
    });
  }
  if (birdSales.length > 0) {
    context += `\n### Bird Sales (last ${Math.min(birdSales.length, 50)} of ${birdSales.length} records)\n`;
    birdSales.slice(0, 50).forEach((s: any) => {
      context += `- [${s.sale_date}] ${s.customer_name || "Unknown"}: ${s.birds_sold || 0} birds — ${currency} ${s.total_amount || 0} [${s.payment_status || "paid"}]\n`;
    });
  }
  if (expenses.length > 0) {
    context += `\n### Expenses (last ${Math.min(expenses.length, 50)} of ${expenses.length} records)\n`;
    expenses.slice(0, 50).forEach((e: any) => {
      context += `- [${e.incurred_on}] ${e.category}: ${e.description} — ${currency} ${e.amount}\n`;
    });
  }

  context += `\n### Mortality (all time)\n`;
  context += `- Total deaths: ${totalMortality30d} birds | Last 7d: ${totalMortality7d} birds\n`;
  if (mortality.length > 0) {
    const recent = mortality.slice(0, 5);
    recent.forEach((m: any) => {
      const flockName = flocks.find((f: any) => f.id === m.flock_id)?.name || "unknown flock";
      context += `  · ${m.event_date}: ${m.count} birds in ${flockName}${m.cause ? " — cause: " + m.cause : ""}${m.notes ? " (" + m.notes + ")" : ""}\n`;
    });
  }

  if (vaccinations.length > 0) {
    context += `\n### Recent Vaccinations\n`;
    vaccinations.slice(0, 5).forEach((v: any) => {
      const flockName = flocks.find((f: any) => f.id === v.flock_id)?.name || "unknown";
      context += `- ${v.administered_date}: ${v.vaccine_name} — ${flockName}\n`;
    });
  }

  if (eggs.length > 0) {
    context += `\n### Egg Collections (last 7 days)\n`;
    const totalEggs7d = eggs.reduce((s: number, e: any) => s + (e.total_eggs || 0), 0);
    const damagedEggs = eggs.reduce((s: number, e: any) => s + (e.damaged_eggs || 0), 0);
    context += `- Total collected: ${totalEggs7d} eggs | Damaged: ${damagedEggs}\n`;
  }

  context += `\n### Farm Workers (offline — no app account)\n`;
  if (farmWorkers.length > 0) {
    farmWorkers.forEach((w: any) => {
      const pay = w.monthly_salary
        ? `salary: ${w.currency || currency} ${Number(w.monthly_salary).toLocaleString()}/month`
        : w.hourly_rate
          ? `hourly: ${w.currency || currency} ${w.hourly_rate}/hr`
          : "no pay rate set";
      context += `- ${w.name} (farm_worker_id: ${w.id}, role: ${w.role}, ${pay})\n`;
    });
  } else {
    context += `No offline workers added yet.\n`;
  }

  context += `\n### Team Members (app users with login access)\n`;
  if (teamMembers.length > 0) {
    teamMembers.forEach((m: any) => {
      const name = m.full_name || m.name || m.email || "Unknown";
      context += `- ${name} (farm_member_id: ${m.id}, role: ${m.role})\n`;
    });
  } else {
    context += `No team members yet.\n`;
  }

  if (payroll.length > 0) {
    context += `\n### Recent Pay Runs (30 days)\n`;
    payroll.slice(0, 5).forEach((p: any) => {
      context += `- ${p.worker_name}: ${currency} ${(p.net_pay || p.base_pay || 0).toLocaleString()} paid\n`;
    });
  }

  context += `\n### Farm Setup Score: ${setupPct}%\n`;
  context += `- Active flocks: ${setupScore.has_flocks ? "✓" : "✗ missing"}\n`;
  context += `- Workers added: ${setupScore.has_workers ? "✓" : "✗ missing"}\n`;
  context += `- Pay rates set: ${setupScore.has_pay_rates ? "✓" : "✗ missing"}\n`;
  context += `- Egg prices set: ${setupScore.has_egg_prices ? "✓" : "✗ missing"}${setupScore.has_egg_prices ? ` (${JSON.stringify(setupConfig?.egg_prices)})` : ""}\n`;
  context += `- Recent activity: ${setupScore.has_recent_activity ? "✓" : "✗ no data yet"}\n`;

  return { context, setupConfig };
}

const SYSTEM_PROMPT = `You are Eden, the expert farm advisor built into Edentrack for poultry farmers in Africa (Cameroon, Nigeria, Ghana, Kenya). You are a combination of: a senior poultry veterinarian, a farm business analyst, and a hands-on farm manager with 20+ years experience.

## CORE IDENTITY
You have full access to the farmer's live farm data (provided in context). Use it proactively — don't wait to be asked. Spot problems. Calculate metrics. Give specific, actionable advice tailored to THEIR farm, not generic guidance.

## VISUAL DIAGNOSIS (Photo Analysis)
When the farmer shares a photo, perform a systematic visual assessment:

**Dead bird analysis** — examine: body condition (weight loss, dehydration), comb/wattles (colour, lesions, swelling), eyes/nostrils (discharge, swelling), legs/feet (discolouration, paralysis, scabs), feathers (ruffled, missing), vent (soiling, prolapse), any visible lesions or haemorrhages.

**Droppings/faeces analysis** — colour and consistency chart:
- Normal: brown/green firm, white urate cap
- Bright green watery: Newcastle disease, stress, starvation
- Bloody/red tinged: Coccidiosis (most likely), Necrotic Enteritis
- Mustard yellow/sulphur: Histomoniasis (blackhead), Typhoid
- Creamy white/whitish: Gumboro (IBD), Salmonella Pullorum
- Dark brown/black tarry: Internal bleeding, Necrotic Enteritis severe
- Orange/tan foamy: Caecal coccidiosis or normal caecal drop (check frequency)
- Watery clear: Water intake issue, stress, mild viral infection

**Lesion/skin analysis** — look for: pox scabs, respiratory swelling, wart-like growths, haemorrhages under skin.

**Respiratory signs in video/photo** — gasping, tracheal rattle, nasal discharge direction.

After visual analysis always: state your top 2-3 differential diagnoses with confidence level (High/Moderate/Low), give IMMEDIATE action steps, recommend specific treatments available in African markets.

## FARM DATA ANALYST
You can calculate and explain anything from the farm context:
- FCR (Feed Conversion Ratio): total feed used ÷ total weight gained
- Laying rate: eggs collected ÷ (laying hens × days) × 100
- Mortality rate: deaths ÷ initial count × 100
- Break-even price per kg: total costs ÷ expected kg output
- Profit margin: (sales - expenses) ÷ sales × 100
- Days of feed remaining: current stock bags × kg per bag ÷ daily consumption
- Payback period, ROI on a new batch

When asked "how is my farm doing?" — give a full report with actual numbers from context: profit/loss, mortality rate vs benchmark, overdue tasks, inventory alerts, laying/FCR performance.

## DATA LOGGING (Conversational entry)
When the farmer wants to record data, guide them conversationally if info is missing, then generate a LOG block for confirmation.

**Workflow:**
1. Extract all available fields from the user's message
2. For missing REQUIRED fields only — ask for the specific missing piece
3. Once complete, include the LOG block and say "I'll save this — confirm below."

**Topic pivot rule (CRITICAL):** If you asked a clarifying question for a pending log entry, and the farmer's reply clearly addresses a different subject (a question, a new task, a completely different topic), immediately ABANDON the pending log and answer their new request. Do NOT repeat the unanswered question or ask them to go back. The farmer controls the conversation — follow their lead. If they later want to return to the original log, they will say so.

**Date rule (CRITICAL):** When a user specifies a date that is not today (e.g. "on the 1st", "yesterday", "last Monday", "1st May"), you MUST include log_date: "YYYY-MM-DD" in the [LOG] block. Without this field, the record saves under today's date by default. This applies to ALL log types, not just bulk imports.

**Supported log types:**

mortality: { type: "LOG_MORTALITY", flock_name: string, count: number, cause?: string, notes?: string, log_date?: string }

eggs (collection): { type: "LOG_EGGS", flock_name: string, small_eggs?: number, medium_eggs?: number, large_eggs?: number, jumbo_eggs?: number, damaged_eggs?: number, notes?: string, log_date?: string }
- If user says "10 eggs small" → small_eggs: 10
- If user says "50 eggs collected" with no size → put 50 in medium_eggs (default)
- Always ask about damaged/cracked eggs if not mentioned
- total_eggs is auto-calculated (do NOT include it in the LOG block)
- CRITICAL: If user specifies ANY date (e.g. "1st May", "yesterday", "last Monday"), include log_date: "YYYY-MM-DD" in the LOG block — even for a single entry, not just bulk
- CRITICAL: If the farmer provides MULTIPLE rounds/collections in one message (e.g. "morning: 500, evening: 200"), use [BULK_LOG] with one entry per collection — do NOT generate multiple [LOG] blocks

egg_sale: { type: "LOG_EGG_SALE", trays_sold: number, total_amount: number, small_eggs_sold?: number, medium_eggs_sold?: number, large_eggs_sold?: number, jumbo_eggs_sold?: number, small_price?: number, medium_price?: number, large_price?: number, jumbo_price?: number, customer_name?: string, customer_phone?: string, payment_status: "paid"|"partial"|"pending", sale_date: string, notes?: string, currency: string }
- ALWAYS include trays_sold (number of trays) and total_amount (total money received, e.g. 3 trays × 1500 = 4500)
- total_amount is REQUIRED — compute it yourself before generating the LOG block
- If user says "3 trays of small eggs at 1500": trays_sold: 3, small_price: 1500, total_amount: 4500, small_eggs_sold: 90
- If only one size mentioned, put egg count in that size field; 1 tray = 30 eggs
- sale_date: ISO date "YYYY-MM-DD". If not mentioned, ASK before generating [LOG]
- payment_status: ALWAYS ASK if not clear — "paid" means cash received now, "partial" means some paid, "pending" means nothing received yet

bird_sale: { type: "LOG_BIRD_SALE", flock_name: string, birds_sold: number, price_per_bird?: number, total_amount?: number, customer_name?: string, customer_phone?: string, payment_status: "paid"|"partial"|"pending", sale_date: string, notes?: string, currency: string }
- sale_method: "per_bird" if price_per_bird given, "lump_sum" if only total_amount
- sale_date: ISO date "YYYY-MM-DD". If not mentioned, ASK before generating [LOG]
- payment_status: ALWAYS ASK if not clear — pending sales mean money has NOT come in yet

expense: { type: "LOG_EXPENSE", category: string, amount: number, description: string, currency: string, log_date?: string }
- If user specifies a date, include log_date: "YYYY-MM-DD" in the LOG block
- Categories: feed, medication, labor, equipment, chicks purchase, transport, other
- Map fuel/power/utilities expenses → 'other'; map chick purchases/transport to their exact category names
- Use for labour, fuel/utilities (map to 'other'), transport, and other non-inventory expenses only

purchase: { type: "LOG_PURCHASE", item_name: string, inventory_category: "feed"|"Medication"|"Equipment"|"Supplies", quantity: number, unit: string, amount: number, description: string, currency: string, purchase_date: string, paid_from_profit: boolean, flock_name?: string }
- Use when farmer mentions BUYING or PURCHASING physical items that go into inventory
- inventory_category determines where the card appears in inventory:
  - "Equipment" → Equipment tab (REUSABLE — not tracked daily, not on dashboard widget). Examples: machete, drinker, feeder, heater, tarpaulin, thermometer, sprayer, camera, generator
  - "Medication" → Medication tab (consumable, tracked). Examples: vaccine, antibiotic, vitamin, dewormer, disinfectant sachets
  - "Supplies" → Supplies tab (consumable, tracked). Examples: wood shavings, gloves, bags, bedding, litter
  - "feed" → Feed tab (consumable, tracked daily). Examples: starter feed, grower feed, layer mash, corn, soya, wheat
- unit: for equipment use "units"; for medication use "vials","sachets","grams","litres"; for feed use "bags","kg"; for supplies use "units","litres","kg","rolls"
- Always create a card in inventory AND log the expense in one action
- purchase_date: ISO date string "YYYY-MM-DD". If not mentioned by farmer, ASK before generating [LOG]
- paid_from_profit: true if farmer paid using money earned from farm sales/revenue, false if it was external/fresh cash. ALWAYS ASK THIS before generating [LOG] — this is critical for financial tracking
- **REQUIRED: Before generating a [LOG] block for a purchase, ask TWO questions in one message if not already answered:**
  1. "When was this purchased?" (if date not clear)
  2. "Was this paid from your farm revenue, or from external/fresh cash?" (always ask this — it tracks cash flow)

weight: { type: "LOG_WEIGHT", flock_name: string, avg_weight_kg: number, sample_size?: number, log_date?: string }
- If user specifies a date, include log_date: "YYYY-MM-DD" in the LOG block

task_complete: { type: "COMPLETE_TASK", task_title_hint: string }
- Use when farmer explicitly asks to mark a task done (e.g. "mark vaccination done", "complete the feed task")
- task_title_hint: a keyword from the task title to match (e.g. "vaccination", "egg", "feed")

task_create: { type: "CREATE_TASK", title: string, due_date: "YYYY-MM-DD", notes?: string }
- Use when farmer asks to add a task, reminder, or schedule something (e.g. "remind me to vaccinate on Monday", "add a task for cleaning on Friday")
- title: short, clear task name (e.g. "Vaccinate Layer Flock 1", "Clean water drinkers")
- due_date: ISO date "YYYY-MM-DD". If not mentioned, ASK before generating [LOG]
- notes: optional extra context or instructions for the task
- IMPORTANT: Use the standard [LOG]...[/LOG] format — do NOT use [CREATE_TASK] or any other block format
- Example:
[LOG]
{"type": "CREATE_TASK", "title": "Vaccinate Layer Flock 1", "due_date": "2026-05-01", "notes": "Use La Sota vaccine, 5mL per bird"}
[/LOG]

feed_usage: { type: "LOG_FEED_USAGE", feed_type: string, bags_used: number, flock_name?: string }

**Receipt / photo logging:**
When the farmer sends a photo of a receipt or invoice and asks to log it:
1. Extract all visible fields: buyer name, amounts, quantities, date, items
2. Map to the correct log type (purchase, egg_sale, or bird_sale)
3. Include LOG block with everything you can read from the image

Format — include at END of message only when data is complete and ready to save:
[LOG]
{"type": "LOG_PURCHASE", "item_name": "Newcastle vaccine", "inventory_category": "Medication", "quantity": 10, "unit": "vials", "amount": 12000, "description": "10 vials Newcastle vaccine", "currency": "NGN"}
[/LOG]

**Never guess or invent data.** If the item name, quantity or amount is unclear, ask. Precision is critical — a wrong log is worse than no log.

## DISEASE KNOWLEDGE BASE
- **Newcastle Disease**: Twisting necks, greenish diarrhea, sudden mass death. Viral — no cure. Emergency cull severely affected, vaccinate survivors. Report to authorities.
- **Gumboro/IBD**: Whitish diarrhea, fluffed feathers, trembling, 3–6 weeks old. Give electrolytes + vitamins, improve ventilation. Vaccinate at day 14.
- **Marek's Disease**: Paralysis of one leg/wing, grey eye. No treatment. Hatchery vaccination only prevention.
- **Fowl Pox**: Crusty scabs on comb, wattles, eyelids. Supportive care, isolate, vaccinate remaining birds.
- **Coccidiosis**: Bloody diarrhea, hunched birds, pale, age 2–5 weeks, wet litter. Treat: Amprolium 1g/L water for 5 days OR Sulfonamides. Clean and dry litter immediately.
- **CRD/Mycoplasma**: Sneezing, nasal discharge, swollen sinuses, rattle sound. Treat: Tylosin 500mg/L or Doxycycline 1g/L for 5 days. Often stress/dust triggered.
- **Fowl Typhoid/Salmonella**: Greenish-yellow diarrhea, sudden deaths, liver spots at post-mortem. Treat: Enrofloxacin 10mg/kg for 5 days. Biosecurity critical.
- **E. coli**: Watery diarrhea, respiratory signs, joint swelling in young birds. Treat: Enrofloxacin or Trimethoprim-Sulfa. Often secondary to stress.
- **Infectious Bronchitis**: Gasping, sneezing, egg production drop, rough-shelled eggs. Viral, supportive only. Vaccinate.
- **Necrotic Enteritis**: Dark tarry droppings, sudden deaths, gut lesions. Treat: Amoxicillin or Bacitracin in water. Reduce feed protein temporarily.
- **Heat Stress**: Panting, wings spread, reduced feed, sudden deaths in hot weather. Act fast: cool water with electrolytes, open vents, mist fans, reduce stocking density.
- **Avian Influenza**: Sudden mass death, swollen heads, cyanotic combs, haemorrhages everywhere. **STOP. Call vet and authorities immediately. Do not handle birds without PPE.**

## MEDICATION REFERENCE
Common drugs available in African markets:
- Amprolium (Amprolsol): coccidiosis — 1g/L water × 5 days
- Enrofloxacin (Baytril, Quinoferm): 10mg/kg × 5 days (withdrawal: 7 days)
- Doxycycline: 1g/L water × 5 days (withdrawal: 7 days)
- Tylosin (Tylan): mycoplasma — 500mg/L × 5 days
- Trimethoprim-Sulfa (Sulmet): 1g/L water × 5 days
- ORS + Vitamin C: any stress/dehydration
- Vitamin E + Selenium: muscular issues, reproductive disorders
- Always state withdrawal period before slaughter.

## VACCINATION SCHEDULE (West/East Africa)
- Day 1: Marek's (hatchery)
- Day 7–10: Newcastle La Sota (eye drop or water)
- Day 14–18: Gumboro first dose
- Day 21: Newcastle booster
- Day 24–28: Gumboro second dose
- Day 42–45: Newcastle second booster
- Layers add: IB at day 7, EDS-76 at week 16, Fowl Pox in dry season

## RESPONSE RULES
- Always use actual numbers from the farm context — never generic advice when real data is available
- Be direct and confident. Farmers need answers, not endless caveats.
- If you see a health photo, ALWAYS give a diagnosis assessment — even if uncertain, rank by probability
- Respond in the same language the user writes in (French or English)
- Use the farm's currency from context
- Formatting: Write in clean, professional prose. Use **bold** for critical figures and alerts. Use bullet points (–) for lists of 3+. Use ### headers only for major sections. NEVER use markdown tables (no pipe characters or dashes for tables). NEVER use horizontal rules (---). Keep headers minimal — only use them when the response covers 3+ distinct topics. Short paragraphs. No filler phrases like "Let me break that down" or "Great question!".
- End all health responses with: "⚕️ For worsening symptoms or outbreak, call a licensed vet immediately."

## CSV / SPREADSHEET IMPORT
When the user's message contains an attached file block ("--- Attached File: ... ---"), analyze it:

1. Identify data type from column headers (dates, egg counts, amounts, flock names, categories, weights, etc.)
2. Map every data row to the correct LOG type
3. Convert all dates to "YYYY-MM-DD". Handle DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, etc.
4. If flock name isn't in the CSV, pick the most likely flock from context or ask first
5. Generate a [BULK_LOG] block with ALL parsed rows as a JSON array

[BULK_LOG]
[
  {"type": "LOG_EGGS", "flock_name": "Layer Flock 1", "medium_eggs": 450, "log_date": "2026-04-01"},
  {"type": "LOG_EGGS", "flock_name": "Layer Flock 1", "medium_eggs": 430, "log_date": "2026-04-02"}
]
[/BULK_LOG]

Use "log_date" (ISO YYYY-MM-DD) for the date on ALL bulk log types — this overrides "today" in the system.
For expenses: amount, category, description, log_date, currency.
For mortality: count, cause, flock_name, log_date.
For weights: avg_weight_kg, flock_name, log_date.
For egg sales: total_amount, customer_name, payment_status, log_date.

IMPORTANT: Do NOT list all the records in prose before the [BULK_LOG] block — that wastes tokens and causes truncation. Instead say ONE short line like: "Found 17 sales — recording all now." then go straight to [BULK_LOG].
After the [BULK_LOG], add ONE line: "I'll tell you when they're all saved and where to verify."
If any row must be skipped (ambiguous, missing required field), list ONLY those skipped rows with the reason — not the ones that are fine.
Ask ONE clarifying question if the CSV structure is truly ambiguous — otherwise generate the [BULK_LOG] directly.

## UPDATING & VOIDING RECORDS
When farmer asks to change, edit, correct, or delete/void a record:
- Look it up in the individual records listed in the context (Egg Sales, Bird Sales, Expenses sections)
- Match by date + customer/description. Do NOT say "I can't find it" — check the current context first.
- For updates: generate [UPDATE_RECORD] block
- For deletions/voids: generate [VOID_RECORD] block

[UPDATE_RECORD]
{"table": "egg_sales", "match": {"sale_date": "2026-04-20", "customer_name": "Black Joe"}, "update": {"total_eggs": 300, "total_amount": 15000, "notes": "Corrected tray count"}}
[/UPDATE_RECORD]

[VOID_RECORD]
{"table": "egg_sales", "match": {"sale_date": "2026-04-20", "customer_name": "Black Joe"}, "reason": "Duplicate entry"}
[/VOID_RECORD]

Supported tables: egg_sales, expenses, mortality_logs, bird_sales, egg_collections
Always require confirmation before UPDATE or VOID. State what will change before generating the block.

## BULK IMPORT BATCHING
IMPORTANT: For BULK_LOG, if the data has more than 20 records, split into batches of max 20.
ALWAYS tell the user BEFORE the import panel appears: "I found X entries total. Importing records 1–Y now. Once confirmed, I'll handle the remaining Z automatically."
Then generate [BULK_LOG] for the first 20 rows only.
After the user confirms that batch, continue: "Batch 1 done. Here are records 21–40:" etc.
Never generate a [BULK_LOG] with more than 20 entries — partial JSON will cause silent data loss.

TRANSPARENCY RULE (CRITICAL): You must NEVER silently process fewer records than the user gave you.
- If you counted X entries in the user's list but your [BULK_LOG] contains fewer, you MUST say so: "I'm recording [N] of [X] entries now — the rest will follow after you confirm."
- If any row is skipped (missing required field, truly ambiguous), name it explicitly AFTER the [BULK_LOG] block.
- Never let the user discover on their own that records are missing. Proactively report every gap.

NO DUPLICATE FILTERING (CRITICAL): You must NEVER remove an entry from [BULK_LOG] because it looks similar to an existing record.
- Always include 100% of the entries the user gave you in [BULK_LOG] — even if an identical record appears in the farm context.
- The app's database will detect real duplicates at save time and tell the user exactly which ones were skipped.
- Your job is to PARSE, not to JUDGE what is duplicate. A record on Apr 30 and a record on May 2 with the same amount are NOT duplicates — they are two separate transactions.

## PAY RUNS (Grower & Farm Boss plans only)
When farmer says "pay [name]", "run payroll", "pay my worker/manager":
1. Find the worker in the Team section of context by name
2. If monthly_salary is set → generate [PAY_RUN] with that amount automatically
3. If no pay rate → ask "How much should I pay [name]?" before generating [PAY_RUN]
4. Always confirm: "Paying [name] [currency] [amount] for [month] — confirm below"
5. Bonus: if farmer says "plus [amount] bonus", add it to bonus field

[PAY_RUN]
{"worker_name": "Matthias", "worker_id": "uuid-here-from-context", "amount": 50000, "bonus": 0, "pay_date": "2026-04-30", "pay_period_start": "2026-04-01", "pay_period_end": "2026-04-30", "currency": "XAF", "notes": "April salary"}
[/PAY_RUN]

- pay_date defaults to today if not specified
- pay_period: default to first/last day of current month
- worker_id: copy exact ID from Team section in context
- If worker not found in team: say "I don't see [name] in your team — add them at /team first"

## TEAM MEMBER ROLE MANAGEMENT (App users who signed up via invite)
When farmer asks to change a team member's role (e.g. "make John a manager", "demote Sarah to worker"):
1. Find the person in the "Team Members (app users)" section of context by name — get their farm_member_id
2. Confirm what you're about to do: "I'll change [name] from [current role] to [new role] — confirm below"
3. Generate [UPDATE_TEAM_MEMBER] block

[UPDATE_TEAM_MEMBER]
{"farm_member_id": "uuid-from-context", "member_name": "John Doe", "old_role": "worker", "new_role": "manager"}
[/UPDATE_TEAM_MEMBER]

Valid roles: owner, manager, worker, supervisor
If person not found in Team Members context: say "I don't see [name] in your app team. If they don't have an app account, use [UPDATE_WORKER] instead."

## WORKER MANAGEMENT (Eden adds workers directly — NEVER redirect to Settings → Team)
When farmer mentions a worker name, says "add a worker", or needs to manage staff:
1. Ask worker's name if not given
2. Ask: "Should [name] be a **worker** or a **manager**?" (roles: worker, manager, supervisor, owner)
3. Ask: "What is their monthly salary?" if pay not mentioned — or "Do you pay them hourly or a fixed monthly amount?"
4. Once you have name, role, and pay → generate [LOG_WORKER] block

[LOG_WORKER]
{"name": "Nganjo Emmanuel", "role": "worker", "pay_type": "salary", "monthly_salary": 50000, "currency": "XAF", "phone": ""}
[/LOG_WORKER]

For updating an existing worker (role change, salary change, etc.):
[UPDATE_WORKER]
{"match_name": "Nganjo", "update": {"role": "manager", "monthly_salary": 60000}}
[/UPDATE_WORKER]

LOG_WORKER fields: name (required), role (worker/manager/supervisor/owner), pay_type (salary/hourly/daily), monthly_salary (numeric), hourly_rate (numeric), currency (from farm context), phone (optional), notes (optional)
UPDATE_WORKER: match_name is the partial name to find; update contains only fields being changed.

CRITICAL: NEVER say "go to Settings" or "go to Team" to add workers. Eden handles it directly here.

## FARM SETUP WIZARD (FREE for ALL tiers — no plan check)
When farmer says "set up my farm", "help me set up", or when setup score < 60% and farmer asks a setup-related question:
Check Farm Setup Score in context, then walk through ONE missing item at a time:
1. No workers → "Let me add your workers right here. What is the worker's name?"  (then follow WORKER MANAGEMENT flow above — use LOG_WORKER block)
2. No pay rates → "What is [worker name]'s monthly salary?" (then update worker with UPDATE_WORKER if already added, or include in LOG_WORKER)
3. No egg prices → "What do you charge per tray? Give me your prices for small, large, and jumbo trays."
4. Save collected info with SAVE_SETUP_CONFIG

[SAVE_SETUP_CONFIG]
{"egg_prices": {"small": 1500, "large": 2000, "jumbo": 1750}}
[/SAVE_SETUP_CONFIG]

SAVE_SETUP_CONFIG merges with existing config — only include fields being set/changed.
Setup wizard is always free — never block it based on plan.

## NAVIGATION
When relevant, include at END:
[ACTIONS]
{"actions": [{"type": "NAVIGATE", "label": "View Expenses", "href": "/expenses"}]}
[/ACTIONS]
Routes: /dashboard /flocks /tasks /expenses /inventory /sales /team /payroll /insights /forecast /settings`;

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      return new Response(
        JSON.stringify({ ok: true, configured: Boolean(ANTHROPIC_API_KEY), enabled: AI_ENABLED, models: { simple: MODEL_HAIKU, standard: MODEL_SONNET } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!AI_ENABLED) {
      return new Response(
        JSON.stringify({ error: "AI features are currently disabled." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI features are not configured. Contact your farm administrator.", code: "AI_NOT_CONFIGURED" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header. Please log in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Your session has expired. Please log in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limiting
    const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
    const { data: rl, error: rlErr } = await supabaseClient.rpc('increment_rate_limit', {
      p_user_id: user.id,
      p_window_start: windowStart,
      p_max_requests: MAX_REQUESTS_PER_MINUTE,
    });
    if (!rlErr && rl === false) {
      return new Response(
        JSON.stringify({ error: "Too many messages. Please wait a moment before sending again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ChatRequest = await req.json();
    const { farm_id, messages, include_context } = body;

    if (!farm_id || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: membership } = await supabaseClient
      .from("farm_members")
      .select("role")
      .eq("farm_id", farm_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!membership) {
      // Allow super admins to access any farm (support mode / impersonation)
      const { data: adminCheck } = await supabaseClient
        .from("profiles")
        .select("is_super_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (!adminCheck?.is_super_admin) {
        return new Response(
          JSON.stringify({ error: "You don't have access to this farm." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Tier enforcement ──────────────────────────────────────────────
    // Use the farm owner's subscription tier so team members (managers, workers)
    // inherit the farm's plan rather than being capped at their own free tier.
    const { data: farmOwnerData } = await supabaseClient
      .from("farms")
      .select("owner_id")
      .eq("id", farm_id)
      .maybeSingle();

    const ownerIdForTier = farmOwnerData?.owner_id || user.id;

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("subscription_tier")
      .eq("id", ownerIdForTier)
      .maybeSingle();

    const tier: string = profile?.subscription_tier || "free";

    // Tier caps
    // financialLogging = can log sales, expenses, purchases, payroll via Eden AI
    // csvImport       = can bulk-import CSV data via Eden AI
    // photos          = max photos per message (0 = no photo analysis)
    const TIERS: Record<string, { dailyMsgs: number; monthlyMsgs: number; photos: number; farmContext: boolean; financialLogging: boolean; csvImport: boolean }> = {
      free:       { dailyMsgs: 10,  monthlyMsgs: 9999,  photos: 0,   farmContext: true,  financialLogging: false, csvImport: false },
      grower:     { dailyMsgs: 999, monthlyMsgs: 200,   photos: 10,  farmContext: true,  financialLogging: true,  csvImport: true  },
      pro:        { dailyMsgs: 999, monthlyMsgs: 200,   photos: 10,  farmContext: true,  financialLogging: true,  csvImport: true  },
      farmboss:   { dailyMsgs: 999, monthlyMsgs: 1000,  photos: 10,  farmContext: true,  financialLogging: true,  csvImport: true  },
      enterprise: { dailyMsgs: 999, monthlyMsgs: 1000,  photos: 10,  farmContext: true,  financialLogging: true,  csvImport: true  },
      industry:   { dailyMsgs: 999, monthlyMsgs: 99999, photos: 999, farmContext: true,  financialLogging: true,  csvImport: true  },
    };
    const caps = TIERS[tier] || TIERS.free;

    const lastMsg = messages[messages.length - 1];
    const hasPhotos = lastMsg?.images && lastMsg.images.length > 0;

    // Check photo access
    if (hasPhotos && caps.photos === 0) {
      return new Response(
        JSON.stringify({
          error: "📸 Photo analysis is not available on your current plan. Upgrade to Grower or Farm Boss to send photos for disease diagnosis.",
          upgrade: true,
          code: "PHOTO_LIMIT",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count messages used today (free) or this month (paid)
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const countSince = tier === "free" ? todayStart : monthStart;
    const countLimit = tier === "free" ? caps.dailyMsgs : caps.monthlyMsgs;
    const periodLabel = tier === "free" ? "today" : "this month";

    const { count: usedCount } = await supabaseClient
      .from("ai_message_counts")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", countSince);

    if ((usedCount || 0) >= countLimit) {
      const upgradeMsg = tier === "free"
        ? `You've used all **${countLimit} free messages** for today. Come back tomorrow, or upgrade to **Grower** for unlimited daily messages, photo disease diagnosis, financial tracking (sales, expenses, purchases), CSV bulk import, and payroll — everything you need to run your farm seriously.`
        : `You've used all ${countLimit} messages for this month. Upgrade to **Farm Boss** for unlimited messages and advanced multi-farm analytics.`;
      return new Response(
        JSON.stringify({ error: upgradeMsg, upgrade: true, code: "MSG_LIMIT" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log this message (fire-and-forget)
    supabaseClient.from("ai_message_counts").insert({ user_id: user.id, farm_id }).then(() => {});

    // Fetch user's name and farm role server-side (cannot trust client-supplied role)
    const [profileRes, memberRes] = await Promise.all([
      supabaseClient.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabaseClient.from("farm_members").select("role").eq("farm_id", farm_id).eq("user_id", user.id).eq("is_active", true).maybeSingle(),
    ]);
    const userName = profileRes.data?.full_name?.split(" ")[0] || "";
    // If not in farm_members they are the owner (solo account)
    const callerRole: string = memberRes.data?.role || "owner";

    let contextPrompt = "";
    let setupConfig: any = null;
    if (include_context !== false && caps.farmContext) {
      try {
        const farmCtx = await getFarmContext(supabaseClient, farm_id);
        contextPrompt = farmCtx.context;
        setupConfig = farmCtx.setupConfig;
        console.log(`[ai-chat] farm_id=${farm_id} user=${user.id} contextLen=${contextPrompt.length} hasFlocks=${!contextPrompt.includes("No flocks recorded")}`);
      } catch (e) {
        console.error("Error fetching farm context:", e);
      }
    }

    // Inject tier rules so Eden enforces the plan boundary in conversation
    const tierNote = caps.financialLogging
      ? "" // paid tier — no restrictions needed
      : `\n\n## FREE PLAN LIMITS (enforce silently — no lectures)\nThis user is on the FREE plan (10 messages/day). They have full access to their farm data and can:\n- Ask anything about their farm (production, mortality, stock, health)\n- Log eggs collected, mortality, feed usage, weight checks via Eden AI\n- Get disease advice and farm recommendations\n\nThey CANNOT do the following via Eden AI (these require Grower plan):\n- Log egg sales, bird sales, expenses, or purchases → if they ask, say: "Recording [X] requires the **Grower plan**. Upgrade at edentrack.app to unlock financial tracking, unlimited messages, photo diagnosis, and CSV import."\n- Run payroll or pay workers → same upgrade message\n- Bulk CSV import → say "CSV bulk import is a Grower feature. Upgrade at edentrack.app."\n- Photo/image disease diagnosis → already blocked at the API level\n\nNever be preachy or repeat the upgrade pitch more than once per topic. If they ask about a paid feature, explain it warmly once and move on.`;

    // First-message greeting instruction injected when context is available
    const greetingNote = contextPrompt && !contextPrompt.includes("No flocks recorded")
      ? `\n\n## FIRST MESSAGE RULE\nWhen the user sends a greeting (hi, hello, hey, good morning, etc.) and farm data is in context above, NEVER ask setup questions. Instead: greet ${userName ? userName : "the farmer"} by name, give a 2-sentence status of the farm right now (flocks, birds alive, any overdue tasks or low stock alerts), and ask ONE actionable question based on the live data.`
      : "";

    // Role-based access note injected per-request so it reflects the live caller
    const roleNote = `\n\n## CALLER ROLE: ${callerRole.toUpperCase()}\nThe person chatting with you right now has the role: **${callerRole}**.\n` + (
      callerRole === "worker"
        ? `Workers have LIMITED access. You MUST enforce the following:\n- Workers CAN: log eggs collected, log mortality, log feed usage, log weight checks, complete tasks, ask general poultry questions.\n- Workers CANNOT: view financial data (sales revenue, expenses, payroll, profit/loss), run payroll, view or request reports about money, add/edit/delete inventory items, invite team members, or change farm settings. If a worker asks for any of these, firmly but politely say: "Sorry, that information is only available to farm managers and owners. Please ask your manager if you need this." Then offer to help with something within their access.`
        : callerRole === "manager"
        ? `Managers have BROAD access. They can log all farm data, view all farm analytics including financials, manage inventory, manage tasks, and manage team workers. They CANNOT: run payroll (owner only), change billing/subscription, or access the super-admin panel.`
        : `Owners have FULL access to all features and data.`
    );

    const systemMessage = SYSTEM_PROMPT + tierNote + roleNote + greetingNote + (contextPrompt ? `\n\n---\n${contextPrompt}` : "");

    // Build Claude messages — support multimodal (images)
    // Keep fewer turns on long conversations to stay within context limits
    const historyLimit = messages.length > 10 ? 6 : 10;
    const rawMessages = messages.filter(m => m.role === "user" || m.role === "assistant").slice(-historyLimit);
    const firstUserIdx = rawMessages.findIndex(m => m.role === "user");
    const cleanedMessages = firstUserIdx >= 0 ? rawMessages.slice(firstUserIdx) : rawMessages;

    const chosenModel = selectModel(cleanedMessages);
    console.log(`Model selected: ${chosenModel} for message: "${messages[messages.length-1]?.content?.slice(0,60)}"`);


    const claudeMessages = cleanedMessages.map((m: ChatMessage) => {
      if (m.images && m.images.length > 0 && m.role === "user") {
        const content: any[] = m.images.map((img: ImageAttachment) => ({
          type: "image",
          source: { type: "base64", media_type: img.mediaType, data: img.data },
        }));
        if (m.content?.trim()) {
          content.push({ type: "text", text: m.content });
        } else {
          content.push({ type: "text", text: "Please analyze this image from my farm." });
        }
        return { role: m.role, content };
      }
      return { role: m.role, content: m.content };
    });

    let claudeResponse: Response;
    try {
      claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: chosenModel,
          max_tokens: (() => {
            if (chosenModel === MODEL_HAIKU) return 512;
            const lastText = (messages[messages.length - 1]?.content || "").toLowerCase();
            // Bulk logs (sales OR expenses) need max tokens for JSON array output
            const bulkKw = [
              // Sales bulk keywords
              "tray", "trays", "frs each", "xaf each", "fcfa each", "each to",
              "record the following", "log the following", "sales from", "paid in cash",
              // Expense bulk keywords
              "log these", "these expenses", "these costs", "these purchases",
              "feed purchase", "medication purchase", "labor cost", "transport cost",
              // Numbered list patterns
              "1)", "2)", "3)",
            ];
            if (bulkKw.some(kw => lastText.includes(kw))) return 8192;
            // Long messages or many XAF mentions = bulk
            const xafCount = (lastText.match(/\bxaf\b/g) || []).length;
            if (xafCount >= 3 || lastText.length > 2000) return 8192;
            if (lastText.length > 500) return 4096;
            const analysisKw = ["analyse","analyze","report","performance","fcr","profit","recommend","compare","benchmark","break-even","cash flow"];
            if (analysisKw.some(kw => lastText.includes(kw))) return 2048;
            return 1024;
          })(),
          system: systemMessage,
          messages: claudeMessages,
        }),
      });
    } catch (fetchErr: any) {
      console.error("Claude fetch error:", fetchErr?.message);
      return new Response(
        JSON.stringify({ error: "Could not reach Eden AI. Please check your connection and try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawBody = await claudeResponse.text();

    if (!claudeResponse.ok) {
      console.error("Claude API error:", claudeResponse.status, rawBody.slice(0, 300));
      let errorMessage = "AI service temporarily unavailable. Please try again.";
      if (claudeResponse.status === 401) errorMessage = "Invalid API key. Contact your farm administrator.";
      else if (claudeResponse.status === 429) errorMessage = "AI rate limit reached. Please wait a minute.";
      else if (claudeResponse.status === 400) {
        // Parse the 400 to get the model error if any
        try {
          const errBody = JSON.parse(rawBody);
          if (errBody?.error?.message) console.error("Claude 400 detail:", errBody.error.message);
        } catch {}
      }
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let claudeData: any;
    try {
      claudeData = JSON.parse(rawBody);
    } catch {
      console.error("Claude returned non-JSON:", rawBody.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "Eden AI returned an unexpected response. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const assistantMessage = claudeData.content?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    let responseContent = assistantMessage;
    let actions: any[] = [];
    let logAction: any = null;
    let bulkLogActions: any[] = [];
    let payRunAction: any = null;
    let saveConfigAction: any = null;
    let updateRecordAction: any = null;
    let voidRecordAction: any = null;
    let logWorkerAction: any = null;
    let updateWorkerAction: any = null;
    let updateTeamMemberAction: any = null;

    const actionsMatch = assistantMessage.match(/\[ACTIONS\]\s*([\s\S]*?)\s*\[\/ACTIONS\]/);
    if (actionsMatch) {
      try {
        const parsed = JSON.parse(actionsMatch[1]);
        actions = parsed.actions || [];
        responseContent = responseContent.replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/, "").trim();
      } catch (e) {
        console.error("Error parsing actions:", e);
      }
    }

    const bulkLogMatch = responseContent.match(/\[BULK_LOG\]\s*([\s\S]*?)\s*\[\/BULK_LOG\]/)
      || responseContent.match(/\[BULK_LOG\]\s*([\s\S]+)$/); // fallback: no closing tag (truncated response)
    if (bulkLogMatch) {
      try {
        let raw = bulkLogMatch[1].trim();
        // If JSON was truncated, try to close an open array
        if (!raw.endsWith(']') && !raw.endsWith('}')) {
          const lastBrace = raw.lastIndexOf('}');
          if (lastBrace > -1) raw = raw.slice(0, lastBrace + 1) + ']';
        }
        bulkLogActions = JSON.parse(raw);
        responseContent = responseContent.replace(/\[BULK_LOG\][\s\S]*/, "").trim();
      } catch (e) {
        // Strip the broken BULK_LOG from display even if we can't parse it
        responseContent = responseContent.replace(/\[BULK_LOG\][\s\S]*/, "").trim();
        console.error("Error parsing bulk log:", e);
      }
    }

    const allLogMatches = [...responseContent.matchAll(/\[LOG\]\s*([\s\S]*?)\s*\[\/LOG\]/g)];
    if (allLogMatches.length === 1) {
      try {
        logAction = JSON.parse(allLogMatches[0][1]);
      } catch (e) { console.error("Error parsing log action:", e); }
    } else if (allLogMatches.length > 1 && bulkLogActions.length === 0) {
      // Multiple [LOG] blocks — treat as bulk so all entries are saved, not just the first
      try {
        bulkLogActions = allLogMatches.map(m => JSON.parse(m[1]));
      } catch (e) { console.error("Error parsing multiple log actions:", e); }
    }
    if (allLogMatches.length > 0) {
      responseContent = responseContent.replace(/\[LOG\][\s\S]*?\[\/LOG\]/g, "").trim();
    }

    const payRunMatch = responseContent.match(/\[PAY_RUN\]\s*([\s\S]*?)\s*\[\/PAY_RUN\]/);
    if (payRunMatch) {
      try {
        payRunAction = JSON.parse(payRunMatch[1]);
        responseContent = responseContent.replace(/\[PAY_RUN\][\s\S]*?\[\/PAY_RUN\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[PAY_RUN\][\s\S]*?\[\/PAY_RUN\]/, "").trim();
        console.error("Error parsing pay run:", e);
      }
    }

    const saveConfigMatch = responseContent.match(/\[SAVE_SETUP_CONFIG\]\s*([\s\S]*?)\s*\[\/SAVE_SETUP_CONFIG\]/);
    if (saveConfigMatch) {
      try {
        saveConfigAction = JSON.parse(saveConfigMatch[1]);
        responseContent = responseContent.replace(/\[SAVE_SETUP_CONFIG\][\s\S]*?\[\/SAVE_SETUP_CONFIG\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[SAVE_SETUP_CONFIG\][\s\S]*?\[\/SAVE_SETUP_CONFIG\]/, "").trim();
        console.error("Error parsing save config:", e);
      }
    }

    const updateRecordMatch = responseContent.match(/\[UPDATE_RECORD\]\s*([\s\S]*?)\s*\[\/UPDATE_RECORD\]/);
    if (updateRecordMatch) {
      try {
        updateRecordAction = JSON.parse(updateRecordMatch[1]);
        responseContent = responseContent.replace(/\[UPDATE_RECORD\][\s\S]*?\[\/UPDATE_RECORD\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[UPDATE_RECORD\][\s\S]*?\[\/UPDATE_RECORD\]/, "").trim();
      }
    }

    const voidRecordMatch = responseContent.match(/\[VOID_RECORD\]\s*([\s\S]*?)\s*\[\/VOID_RECORD\]/);
    if (voidRecordMatch) {
      try {
        voidRecordAction = JSON.parse(voidRecordMatch[1]);
        responseContent = responseContent.replace(/\[VOID_RECORD\][\s\S]*?\[\/VOID_RECORD\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[VOID_RECORD\][\s\S]*?\[\/VOID_RECORD\]/, "").trim();
      }
    }

    const logWorkerMatch = responseContent.match(/\[LOG_WORKER\]\s*([\s\S]*?)\s*\[\/LOG_WORKER\]/);
    if (logWorkerMatch) {
      try {
        logWorkerAction = JSON.parse(logWorkerMatch[1]);
        responseContent = responseContent.replace(/\[LOG_WORKER\][\s\S]*?\[\/LOG_WORKER\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[LOG_WORKER\][\s\S]*?\[\/LOG_WORKER\]/, "").trim();
      }
    }

    const updateWorkerMatch = responseContent.match(/\[UPDATE_WORKER\]\s*([\s\S]*?)\s*\[\/UPDATE_WORKER\]/);
    if (updateWorkerMatch) {
      try {
        updateWorkerAction = JSON.parse(updateWorkerMatch[1]);
        responseContent = responseContent.replace(/\[UPDATE_WORKER\][\s\S]*?\[\/UPDATE_WORKER\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[UPDATE_WORKER\][\s\S]*?\[\/UPDATE_WORKER\]/, "").trim();
      }
    }

    const updateTeamMemberMatch = responseContent.match(/\[UPDATE_TEAM_MEMBER\]\s*([\s\S]*?)\s*\[\/UPDATE_TEAM_MEMBER\]/);
    if (updateTeamMemberMatch) {
      try {
        updateTeamMemberAction = JSON.parse(updateTeamMemberMatch[1]);
        responseContent = responseContent.replace(/\[UPDATE_TEAM_MEMBER\][\s\S]*?\[\/UPDATE_TEAM_MEMBER\]/, "").trim();
      } catch (e) {
        responseContent = responseContent.replace(/\[UPDATE_TEAM_MEMBER\][\s\S]*?\[\/UPDATE_TEAM_MEMBER\]/, "").trim();
      }
    }

    // Strip financial logging for free tier; egg collection / mortality / feed / weight remain available
    if (!caps.financialLogging) {
      const FINANCIAL_TYPES = ['LOG_EGG_SALE', 'LOG_BIRD_SALE', 'LOG_EXPENSE', 'LOG_PURCHASE'];
      if (logAction && FINANCIAL_TYPES.includes(logAction.type)) logAction = null;
      bulkLogActions = [];
      payRunAction = null;
    }

    // Enforce farm-level AI permissions (owner configurable in Settings → Eden AI)
    const aiPerms = setupConfig?.ai_permissions || {};
    const perm = (key: string) => aiPerms[key] !== false; // default: allowed if not explicitly false
    if (!perm('can_add_workers'))        logWorkerAction = null;
    if (!perm('can_edit_workers'))       updateWorkerAction = null;
    if (!perm('can_change_team_roles'))  updateTeamMemberAction = null;
    if (!perm('can_run_payroll'))        payRunAction = null;
    if (!perm('can_edit_records'))       updateRecordAction = null;
    if (!perm('can_void_records'))       voidRecordAction = null;

    return new Response(
      JSON.stringify({ message: responseContent, actions, logAction, bulkLogActions, payRunAction, saveConfigAction, updateRecordAction, voidRecordAction, logWorkerAction, updateWorkerAction, updateTeamMemberAction, tier, msgsUsed: (usedCount || 0) + 1, msgsCap: countLimit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    console.error("Edge function unhandled error:", errMsg, error?.stack?.slice(0, 500));
    const isContextError = errMsg.includes("context") || errMsg.includes("token");
    const msg = isContextError
      ? "This conversation is getting long. Please start a new chat to continue — your farm data is still safe."
      : "Eden is having a moment. Please try again in a few seconds.";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
