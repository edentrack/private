import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed =
    origin === ALLOWED_ORIGIN ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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

async function getFarmContext(supabase: any, farmId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [
    farmRes, flocksRes, tasksRes, feedRes, otherInvRes,
    expensesRes, salesRes, mortalityRes, weightRes,
    vaccinationsRes, eggRes, payrollRes,
  ] = await Promise.all([
    supabase.from("farms").select("name, currency, currency_code, location").eq("id", farmId).maybeSingle(),
    supabase.from("flocks").select("id, name, type, current_count, initial_count, status, start_date, target_weight, breed").eq("farm_id", farmId),
    supabase.from("tasks").select("id, status, scheduled_for, title_override, priority").eq("farm_id", farmId).eq("is_archived", false).gte("scheduled_for", `${thirtyDaysAgo}T00:00:00`),
    supabase.from("feed_stock").select("id, feed_type, current_stock_bags, unit, cost_per_bag").eq("farm_id", farmId),
    supabase.from("other_inventory").select("id, item_name, quantity, unit, minimum_quantity").eq("farm_id", farmId),
    supabase.from("expenses").select("amount, category, description, date, currency").eq("farm_id", farmId).gte("date", thirtyDaysAgo).order("date", { ascending: false }),
    supabase.from("sales_receipts").select("total, sale_date, buyer_name, sale_type").eq("farm_id", farmId).gte("sale_date", thirtyDaysAgo).order("sale_date", { ascending: false }),
    supabase.from("mortality_logs").select("count, cause, date, flock_id, notes").eq("farm_id", farmId).gte("date", thirtyDaysAgo).order("date", { ascending: false }),
    supabase.from("weight_records").select("avg_weight, record_date, flock_id, sample_size").eq("farm_id", farmId).gte("record_date", thirtyDaysAgo).order("record_date", { ascending: false }),
    supabase.from("vaccination_records").select("vaccine_name, date_administered, flock_id, notes").eq("farm_id", farmId).gte("date_administered", thirtyDaysAgo).order("date_administered", { ascending: false }),
    supabase.from("egg_collections").select("total_eggs, collection_date, flock_id, cracked_eggs").eq("farm_id", farmId).gte("collection_date", sevenDaysAgo).order("collection_date", { ascending: false }),
    supabase.from("payroll_records").select("amount, payment_date, employee_name").eq("farm_id", farmId).gte("payment_date", thirtyDaysAgo),
  ]);

  const farm = farmRes.data;
  const currency = farm?.currency_code || farm?.currency || "XAF";
  const flocks = flocksRes.data || [];
  const activeFlocks = flocks.filter((f: any) => f.status === "active");
  const tasks = tasksRes.data || [];
  const feedStock = feedRes.data || [];
  const otherInventory = otherInvRes.data || [];
  const expenses = expensesRes.data || [];
  const sales = salesRes.data || [];
  const mortality = mortalityRes.data || [];
  const weights = weightRes.data || [];
  const vaccinations = vaccinationsRes.data || [];
  const eggs = eggRes.data || [];
  const payroll = payrollRes.data || [];

  const overdueTasks = tasks.filter((t: any) => t.status === "pending" && t.scheduled_for?.split("T")[0] < today);
  const todayTasks = tasks.filter((t: any) => t.scheduled_for?.startsWith(today));
  const expenses7d = expenses.filter((e: any) => e.date >= sevenDaysAgo);
  const sales7d = sales.filter((s: any) => s.sale_date >= sevenDaysAgo);
  const mortality7d = mortality.filter((m: any) => m.date >= sevenDaysAgo);

  const totalExpenses30d = expenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const totalExpenses7d = expenses7d.reduce((s: number, e: any) => s + (e.amount || 0), 0);
  const totalSales30d = sales.reduce((s: number, e: any) => s + (e.total || 0), 0);
  const totalSales7d = sales7d.reduce((s: number, e: any) => s + (e.total || 0), 0);
  const totalMortality7d = mortality7d.reduce((s: number, m: any) => s + (m.count || 0), 0);
  const totalMortality30d = mortality.reduce((s: number, m: any) => s + (m.count || 0), 0);

  // Expense breakdown by category
  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + (e.amount || 0);
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
      const latestWeight = latest ? `${latest.avg_weight}kg avg (${latest.record_date})` : "no weight records";
      const latestEggs = eggs.filter((e: any) => e.flock_id === f.id).slice(0, 3);
      const layingRate = latestEggs.length && f.current_count
        ? `laying rate ~${((latestEggs.reduce((s: number, e: any) => s + e.total_eggs, 0) / latestEggs.length / f.current_count) * 100).toFixed(0)}%`
        : "";
      const startDate = f.start_date ? `started ${f.start_date}` : "";
      const dayAge = f.start_date ? `age ${Math.floor((Date.now() - new Date(f.start_date).getTime()) / 86400000)} days` : "";
      context += `- **${f.name}** [${f.status}]: ${f.type}, ${f.current_count}/${f.initial_count || "?"} birds, ${dayAge}, mortality 30d: ${fMortality} birds (${mortalityRate}%), weight: ${latestWeight}${layingRate ? ", " + layingRate : ""}${f.breed ? ", breed: " + f.breed : ""}\n`;
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
  const lowFeed = feedStock.filter((f: any) => f.current_stock_bags < 5);
  feedStock.forEach((f: any) => {
    const lowFlag = f.current_stock_bags < 5 ? " ⚠️ LOW" : "";
    context += `- ${f.feed_type}: ${f.current_stock_bags} bags${f.cost_per_bag ? ` @ ${currency} ${f.cost_per_bag}/bag` : ""}${lowFlag}\n`;
  });
  otherInventory.forEach((i: any) => {
    const lowFlag = i.minimum_quantity && i.quantity <= i.minimum_quantity ? " ⚠️ LOW" : "";
    context += `- ${i.item_name}: ${i.quantity} ${i.unit || "units"}${lowFlag}\n`;
  });

  context += `\n### Financials (30 days)\n`;
  context += `- Total expenses: ${currency} ${totalExpenses30d.toFixed(0)} | Last 7d: ${currency} ${totalExpenses7d.toFixed(0)}\n`;
  context += `- Total sales: ${currency} ${totalSales30d.toFixed(0)} | Last 7d: ${currency} ${totalSales7d.toFixed(0)}\n`;
  context += `- Net profit 30d: ${currency} ${(totalSales30d - totalExpenses30d).toFixed(0)}\n`;
  if (Object.keys(expenseByCategory).length > 0) {
    context += `- Expense breakdown: ${Object.entries(expenseByCategory).map(([k, v]) => `${k}: ${currency} ${(v as number).toFixed(0)}`).join(", ")}\n`;
  }
  if (payroll.length > 0) {
    const totalPayroll = payroll.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    context += `- Payroll 30d: ${currency} ${totalPayroll.toFixed(0)}\n`;
  }

  context += `\n### Mortality (30 days)\n`;
  context += `- Total deaths: ${totalMortality30d} birds | Last 7d: ${totalMortality7d} birds\n`;
  if (mortality.length > 0) {
    const recent = mortality.slice(0, 5);
    recent.forEach((m: any) => {
      const flockName = flocks.find((f: any) => f.id === m.flock_id)?.name || "unknown flock";
      context += `  · ${m.date}: ${m.count} birds in ${flockName}${m.cause ? " — cause: " + m.cause : ""}${m.notes ? " (" + m.notes + ")" : ""}\n`;
    });
  }

  if (vaccinations.length > 0) {
    context += `\n### Recent Vaccinations\n`;
    vaccinations.slice(0, 5).forEach((v: any) => {
      const flockName = flocks.find((f: any) => f.id === v.flock_id)?.name || "unknown";
      context += `- ${v.date_administered}: ${v.vaccine_name} — ${flockName}\n`;
    });
  }

  if (eggs.length > 0) {
    context += `\n### Egg Collections (last 7 days)\n`;
    const totalEggs7d = eggs.reduce((s: number, e: any) => s + (e.total_eggs || 0), 0);
    const crackedEggs = eggs.reduce((s: number, e: any) => s + (e.cracked_eggs || 0), 0);
    context += `- Total collected: ${totalEggs7d} eggs | Cracked: ${crackedEggs}\n`;
  }

  return context;
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

**Supported log types:**

mortality: { type: "LOG_MORTALITY", flock_name: string, count: number, cause?: string, notes?: string }

eggs (collection): { type: "LOG_EGGS", flock_name: string, small_eggs?: number, medium_eggs?: number, large_eggs?: number, jumbo_eggs?: number, damaged_eggs?: number, notes?: string }
- If user says "10 eggs small" → small_eggs: 10
- If user says "50 eggs collected" with no size → put 50 in medium_eggs (default)
- Always ask about damaged/cracked eggs if not mentioned
- total_eggs is auto-calculated (do NOT include it in the LOG block)

egg_sale: { type: "LOG_EGG_SALE", small_eggs_sold?: number, medium_eggs_sold?: number, large_eggs_sold?: number, jumbo_eggs_sold?: number, small_price?: number, medium_price?: number, large_price?: number, jumbo_price?: number, trays_sold?: number, customer_name?: string, customer_phone?: string, payment_status?: "paid"|"partial"|"pending", notes?: string, currency: string }
- Extract from receipt photo or conversation
- If only one size mentioned, put count in that size field
- If receipt shows tray price, set trays_sold and one price field

bird_sale: { type: "LOG_BIRD_SALE", flock_name: string, birds_sold: number, price_per_bird?: number, total_amount?: number, customer_name?: string, customer_phone?: string, payment_status?: "paid"|"partial"|"pending", notes?: string, currency: string }
- sale_method: "per_bird" if price_per_bird given, "lump_sum" if only total_amount

expense: { type: "LOG_EXPENSE", category: string, amount: number, description: string, currency: string }
- Categories: feed, medication, labor, equipment, utilities, chick_purchase, other

weight: { type: "LOG_WEIGHT", flock_name: string, avg_weight_kg: number, sample_size?: number }

task_complete: { type: "COMPLETE_TASK", task_title_hint: string }

feed_usage: { type: "LOG_FEED_USAGE", feed_type: string, bags_used: number, flock_name?: string }

**Receipt / photo logging:**
When the farmer sends a photo of a receipt or invoice and asks to log it:
1. Extract all visible fields: buyer name, amounts, quantities, date, items
2. Map to the correct log type (egg_sale or bird_sale)
3. Include LOG block with everything you can read from the image

Format — include at END of message only when data is complete and ready to save:
[LOG]
{"type": "LOG_EXPENSE", "category": "Feed", "amount": 15000, "description": "2 bags starter feed", "currency": "XAF"}
[/LOG]

**Never guess or invent data.** If the flock name or amount is unclear, ask. Precision is critical — a wrong log is worse than no log.

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
- Formatting: short paragraphs, bold for critical info, bullets for lists of 3+. No horizontal rules. No excessive headers.
- End all health responses with: "⚕️ For worsening symptoms or outbreak, call a licensed vet immediately."

## NAVIGATION
When relevant, include at END:
[ACTIONS]
{"actions": [{"type": "NAVIGATE", "label": "View Expenses", "href": "/expenses"}]}
[/ACTIONS]
Routes: /dashboard /flocks /tasks /expenses /inventory /sales /team /payroll /insights /forecast /settings /smart-upload`;

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
      return new Response(
        JSON.stringify({ error: "You don't have access to this farm." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Tier caps: { dailyMsgs, monthlyMsgs, photos, farmContext, dataLogging, voice }
    const TIERS: Record<string, { dailyMsgs: number; monthlyMsgs: number; photos: number; farmContext: boolean; dataLogging: boolean }> = {
      free:       { dailyMsgs: 5,   monthlyMsgs: 30,    photos: 0,   farmContext: false, dataLogging: false },
      pro:        { dailyMsgs: 999, monthlyMsgs: 50,    photos: 10,  farmContext: true,  dataLogging: true  },
      enterprise: { dailyMsgs: 999, monthlyMsgs: 200,   photos: 30,  farmContext: true,  dataLogging: true  },
      industry:   { dailyMsgs: 999, monthlyMsgs: 99999, photos: 999, farmContext: true,  dataLogging: true  },
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
        ? `You've used your ${countLimit} free messages for today. Upgrade to **Grower** for 50 messages/month with full farm data access, or **Farm Boss** for unlimited.`
        : `You've used all ${countLimit} messages for this month on the Grower plan. Upgrade to **Farm Boss** for unlimited messages.`;
      return new Response(
        JSON.stringify({ error: upgradeMsg, upgrade: true, code: "MSG_LIMIT" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log this message (fire-and-forget)
    supabaseClient.from("ai_message_counts").insert({ user_id: user.id, farm_id }).then(() => {});

    let contextPrompt = "";
    if (include_context !== false && caps.farmContext) {
      try {
        contextPrompt = await getFarmContext(supabaseClient, farm_id);
      } catch (e) {
        console.error("Error fetching farm context:", e);
      }
    }

    // Inject tier info into system prompt so Eden knows what to offer/restrict
    const tierNote = caps.farmContext
      ? ""
      : `\n\n## IMPORTANT: This user is on the FREE plan. You can answer general poultry questions but you do NOT have access to their farm data. When they ask about their specific farm (expenses, mortality, stock, etc.), tell them warmly that farm data access is available on the Grower plan ($15/3 months) and encourage them to upgrade. Never make up farm data.`;

    const systemMessage = SYSTEM_PROMPT + tierNote + (contextPrompt ? `\n\n---\n${contextPrompt}` : "");

    // Build Claude messages — support multimodal (images)
    const rawMessages = messages.filter(m => m.role === "user" || m.role === "assistant").slice(-12);
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

    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: chosenModel,
        max_tokens: chosenModel === MODEL_HAIKU ? 512 : 2048,
        system: systemMessage,
        messages: claudeMessages,
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errorText);
      let errorMessage = "AI service temporarily unavailable. Please try again.";
      if (claudeResponse.status === 401) errorMessage = "Invalid API key. Contact your farm administrator.";
      else if (claudeResponse.status === 429) errorMessage = "AI rate limit reached. Please wait a minute.";
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeResponse.json();
    const assistantMessage = claudeData.content?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    let responseContent = assistantMessage;
    let actions: any[] = [];
    let logAction: any = null;

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

    const logMatch = responseContent.match(/\[LOG\]\s*([\s\S]*?)\s*\[\/LOG\]/);
    if (logMatch) {
      try {
        logAction = JSON.parse(logMatch[1]);
        responseContent = responseContent.replace(/\[LOG\][\s\S]*?\[\/LOG\]/, "").trim();
      } catch (e) {
        console.error("Error parsing log action:", e);
      }
    }

    // Strip data logging from free tier
    if (!caps.dataLogging) logAction = null;

    return new Response(
      JSON.stringify({ message: responseContent, actions, logAction, tier, msgsUsed: (usedCount || 0) + 1, msgsCap: countLimit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
