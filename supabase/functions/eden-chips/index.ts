/**
 * eden-chips — generate 3 personalized suggestion chips for the Eden empty state.
 *
 * Why this is its own function (not part of ai-chat):
 *   - Cheap and fast: Haiku, no images, no tools, ≤200 output tokens.
 *   - Doesn't need the full 30+ table farm-context snapshot ai-chat fetches —
 *     just the lightest activity slice (active flock count, last mortality,
 *     last sale, last few tasks).
 *   - Cached 24h client-side, so realistic call rate is ~1 per farm per day.
 *
 * Cost target: ~$0.0003 per call.
 *
 * Per Phase 2 of CLAUDE_CODE_AUTONOMOUS_ROADMAP.md, decision #3.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL_HAIKU = "claude-haiku-4-5-20251001";

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const trusted =
    origin === ALLOWED_ORIGIN ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:") ||
    origin.endsWith(".vercel.app");
  return {
    "Access-Control-Allow-Origin": trusted ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

interface ChipsRequest {
  farm_id: string;
  /** ISO date the client thinks "today" is (for cache key alignment) — optional. */
  today?: string;
}

interface ChipsResponse {
  chips: Array<{ icon: string; label: string }>;
  /** Falls true when Haiku failed and we returned static fallback chips. */
  fallback: boolean;
}

// Hardcoded fallbacks per species — mirror the existing static suggestion lists.
function fallbackChipsForSpecies(farmType: string): ChipsResponse["chips"] {
  switch (farmType) {
    case "aquaculture":
      return [
        { icon: "📊", label: "What's my current FCR?" },
        { icon: "💧", label: "Should I worry about my water quality?" },
        { icon: "🎯", label: "When should I harvest?" },
      ];
    case "rabbits":
      return [
        { icon: "📊", label: "What's my mortality rate?" },
        { icon: "🐰", label: "Help me plan my next breeding" },
        { icon: "🎯", label: "When should I wean my litters?" },
      ];
    default:
      return [
        { icon: "📊", label: "Analyze my farm's performance this week" },
        { icon: "🥚", label: "What's my profit margin?" },
        { icon: "💉", label: "What vaccines do my birds need?" },
      ];
  }
}

async function fetchLightContext(supabase: any, farmId: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const [farmRes, flockRes, mortRes, salesRes, expRes, taskRes] = await Promise.all([
    supabase.from("farms").select("name, farm_type, location, currency, currency_code").eq("id", farmId).single(),
    supabase
      .from("flocks")
      .select("id, name, type, current_count, status, start_date")
      .eq("farm_id", farmId)
      .neq("status", "archived"),
    supabase
      .from("mortality_logs")
      .select("count, event_date, cause")
      .eq("farm_id", farmId)
      .gte("event_date", sevenDaysAgo)
      .order("event_date", { ascending: false }),
    supabase
      .from("sales_invoices")
      .select("total, invoice_date")
      .eq("farm_id", farmId)
      .gte("invoice_date", sevenDaysAgo)
      .neq("status", "cancelled"),
    supabase
      .from("expenses")
      .select("amount, category, incurred_on")
      .eq("farm_id", farmId)
      .gte("incurred_on", sevenDaysAgo),
    supabase
      .from("tasks")
      .select("title_override, status, scheduled_for, due_date")
      .eq("farm_id", farmId)
      .in("status", ["pending", "overdue"])
      .order("scheduled_for", { ascending: true })
      .limit(5),
  ]);

  return {
    farm: farmRes.data,
    flocks: flockRes.data ?? [],
    mortality: mortRes.data ?? [],
    sales: salesRes.data ?? [],
    expenses: expRes.data ?? [],
    pendingTasks: taskRes.data ?? [],
  };
}

function buildPrompt(ctx: Awaited<ReturnType<typeof fetchLightContext>>, ownerFirstName: string): string {
  const farmType = ctx.farm?.farm_type ?? "poultry";
  const flocksLine = ctx.flocks.length
    ? ctx.flocks
        .map((f: any) => `${f.name} (${f.type}, ${f.current_count} animals)`)
        .join("; ")
    : "no active flocks/ponds";
  const mortalitySum = ctx.mortality.reduce((s: number, m: any) => s + (m.count ?? 0), 0);
  const revenueSum = ctx.sales.reduce((s: number, x: any) => s + (x.total ?? 0), 0);
  const expensesSum = ctx.expenses.reduce((s: number, x: any) => s + (x.amount ?? 0), 0);
  const overdueCount = ctx.pendingTasks.filter(
    (t: any) => t.status === "overdue" || (t.due_date && new Date(t.due_date) < new Date())
  ).length;

  // BUG-021: chips were defaulting to "$219.5K expenses" even when the farm
  // currency was CFA. Pass the farm's currency code through so Haiku doesn't
  // emit the dollar glyph.
  const currencyCode = (ctx.farm as any)?.currency_code || (ctx.farm as any)?.currency || "USD";

  return `You are Eden, an AI farm advisor. Generate exactly 3 short suggestion chips for ${ownerFirstName}'s empty-state screen.

Farm: ${ctx.farm?.name ?? "(unnamed)"} — ${farmType}
Currency: ${currencyCode} (always use this exact currency code in any monetary chip — NEVER "$" or "USD" unless that is the farm currency)
Active units: ${flocksLine}
Last 7 days: ${mortalitySum} losses, ${revenueSum} ${currencyCode} revenue, ${expensesSum} ${currencyCode} expenses
Pending tasks: ${ctx.pendingTasks.length} (${overdueCount} overdue)

Return ONLY a JSON array of 3 objects with shape { "icon": "<single emoji>", "label": "<≤8 words, ends with ? or imperative>" }. The chips should:
1. Reference what's actually going on at the farm (don't be generic).
2. Lead with the most pressing issue if there is one (overdue tasks, recent mortality, etc.).
3. Be phrased as something the user might tap (questions or actions).

Output JUST the JSON array, no prose, no markdown fences. Example for a fish farm with no recent sales:
[{"icon":"💧","label":"Why is DO low in Pond 1?"},{"icon":"📊","label":"Forecast my next harvest"},{"icon":"🎯","label":"Plan a partial water change"}]`;
}

async function callHaiku(prompt: string): Promise<ChipsResponse["chips"] | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL_HAIKU,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = (data.content?.[0]?.text || "").trim();
    // Strip optional ```json fences if Haiku adds them despite instructions.
    const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    return parsed
      .map((p: { icon?: string; label?: string }) => ({
        icon: typeof p.icon === "string" ? p.icon.slice(0, 6) : "💡",
        label: typeof p.label === "string" ? p.label.slice(0, 80) : "",
      }))
      .filter((p) => p.label.length > 0);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  // Auth — extract user from JWT
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer /, "");
  if (!jwt)
    return new Response(JSON.stringify({ error: "missing auth" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user)
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  let body: ChipsRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!body.farm_id) {
    return new Response(JSON.stringify({ error: "farm_id required" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Verify the user belongs to that farm — service-role client lets us check.
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: member } = await adminClient
    .from("farm_members")
    .select("farm_id")
    .eq("user_id", userData.user.id)
    .eq("farm_id", body.farm_id)
    .maybeSingle();
  if (!member) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ctx = await fetchLightContext(adminClient, body.farm_id);
  const ownerFirst = (userData.user.user_metadata?.full_name || userData.user.email || "there")
    .split(/[\s@]/)[0];
  const prompt = buildPrompt(ctx, ownerFirst);
  const chips = await callHaiku(prompt);
  if (!chips || chips.length === 0) {
    const result: ChipsResponse = {
      chips: fallbackChipsForSpecies(ctx.farm?.farm_type ?? "poultry"),
      fallback: true,
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const result: ChipsResponse = { chips, fallback: false };
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
