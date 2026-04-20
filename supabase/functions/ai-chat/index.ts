import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const AI_ENABLED = Deno.env.get("AI_ENABLED") !== "false";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (userLimit.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }
  
  userLimit.count++;
  return true;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ChatRequest {
  farm_id: string;
  user_role: string;
  messages: ChatMessage[];
  include_context: boolean;
}

async function getFarmContext(supabase: any, farmId: string): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [flocksRes, tasksRes, feedRes, otherInvRes, expensesRes, salesRes, activityRes] = await Promise.all([
    supabase
      .from("flocks")
      .select("id, name, type, current_count, status")
      .eq("farm_id", farmId)
      .eq("status", "active"),
    supabase
      .from("tasks")
      .select("id, status, scheduled_for, title_override")
      .eq("farm_id", farmId)
      .eq("is_archived", false)
      .gte("scheduled_for", `${sevenDaysAgo}T00:00:00`)
      .lte("scheduled_for", `${today}T23:59:59`),
    supabase
      .from("feed_stock")
      .select("id, feed_type, current_stock_bags, unit")
      .eq("farm_id", farmId),
    supabase
      .from("other_inventory")
      .select("id, item_name, quantity, unit")
      .eq("farm_id", farmId),
    supabase
      .from("expenses")
      .select("amount, category")
      .eq("farm_id", farmId)
      .gte("date", sevenDaysAgo)
      .lte("date", today),
    supabase
      .from("sales_receipts")
      .select("total")
      .eq("farm_id", farmId)
      .gte("sale_date", sevenDaysAgo)
      .lte("sale_date", today),
    supabase
      .from("activity_logs")
      .select("action, created_at")
      .eq("farm_id", farmId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const flocks = flocksRes.data || [];
  const tasks = tasksRes.data || [];
  const feedStock = feedRes.data || [];
  const otherInventory = otherInvRes.data || [];
  const expenses = expensesRes.data || [];
  const sales = salesRes.data || [];
  const activities = activityRes.data || [];

  const todayTasks = tasks.filter((t: any) => t.scheduled_for?.startsWith(today));
  const pendingToday = todayTasks.filter((t: any) => t.status === "pending").length;
  const completedToday = todayTasks.filter((t: any) => t.status === "completed").length;
  const overdueTasks = tasks.filter((t: any) => {
    const taskDate = t.scheduled_for?.split("T")[0];
    return t.status === "pending" && taskDate < today;
  }).length;

  const totalExpenses7d = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const totalSales7d = sales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);

  const lowStockFeed = feedStock.filter((f: any) => f.current_stock_bags < 5);

  let context = `## Current Farm Context (as of ${today})\n\n`;
  
  context += `### Active Flocks (${flocks.length})\n`;
  if (flocks.length === 0) {
    context += "No active flocks.\n";
  } else {
    flocks.forEach((f: any) => {
      context += `- ${f.name}: ${f.type}, ${f.current_count} birds\n`;
    });
  }
  
  context += `\n### Today's Tasks\n`;
  context += `- Pending: ${pendingToday}\n`;
  context += `- Completed: ${completedToday}\n`;
  context += `- Overdue (from previous days): ${overdueTasks}\n`;
  
  context += `\n### Inventory Summary\n`;
  context += `Feed Stock Items: ${feedStock.length}\n`;
  if (lowStockFeed.length > 0) {
    context += `LOW STOCK ALERT: ${lowStockFeed.map((f: any) => f.feed_type).join(", ")}\n`;
  }
  context += `Other Inventory Items: ${otherInventory.length}\n`;
  
  context += `\n### Last 7 Days Financials\n`;
  context += `- Total Expenses: ${totalExpenses7d.toFixed(2)}\n`;
  context += `- Total Sales: ${totalSales7d.toFixed(2)}\n`;
  context += `- Net: ${(totalSales7d - totalExpenses7d).toFixed(2)}\n`;
  
  if (activities.length > 0) {
    context += `\n### Recent Activity (last 10)\n`;
    activities.forEach((a: any) => {
      context += `- ${a.action} (${new Date(a.created_at).toLocaleDateString()})\n`;
    });
  }

  return context;
}

const SYSTEM_PROMPT = `You are a helpful AI assistant for Ebenezer Farms, a poultry farm management application. Your role is to:

1. Help users understand how to use the app's features
2. Summarize farm data when asked (based on the context provided)
3. Suggest next actions for farm management
4. Answer questions about poultry farming best practices

IMPORTANT RULES:
- Be concise and direct in your responses
- NEVER invent or guess data - only use what's provided in the context
- If data is missing, suggest the user log it in the appropriate section
- Tie your answers to the app's features: Flocks, Tasks, Expenses, Inventory, Sales, Team, Payroll
- You can suggest navigation actions using a special format
- For write operations, always tell the user they need to do it manually or confirm the action

When suggesting actions, you can include an actions array in your response using this exact JSON format at the END of your message:

[ACTIONS]
{"actions": [{"type": "NAVIGATE", "label": "Open Expenses", "href": "/expenses"}, {"type": "NAVIGATE", "label": "View Tasks", "href": "/tasks"}]}
[/ACTIONS]

Available navigation actions:
- /dashboard - Main dashboard
- /flocks - Flock management
- /tasks - Task management
- /expenses - Expense tracking
- /inventory - Inventory management
- /sales - Sales management
- /team - Team management
- /payroll - Payroll
- /insights - Analytics & insights
- /forecast - Cost forecasting
- /settings - Settings

Only include actions when they're genuinely helpful for the user's request.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const configured = Boolean(OPENAI_API_KEY);
      const enabled = AI_ENABLED;
      return new Response(
        JSON.stringify({ 
          ok: true, 
          configured,
          enabled,
          model: configured ? OPENAI_MODEL : null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!AI_ENABLED) {
      return new Response(
        JSON.stringify({ error: "AI features are currently disabled." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: "AI features are not yet configured. Contact your farm administrator to enable AI features.",
          code: "AI_NOT_CONFIGURED"
        }),
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

    if (!checkRateLimit(user.id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please wait a moment before sending another message." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: ChatRequest = await req.json();
    const { farm_id, user_role, messages, include_context } = body;

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

    let contextPrompt = "";
    if (include_context !== false) {
      try {
        contextPrompt = await getFarmContext(supabaseClient, farm_id);
      } catch (e) {
        console.error("Error fetching farm context:", e);
        contextPrompt = "(Unable to fetch farm context)";
      }
    }

    const systemMessage = SYSTEM_PROMPT + (contextPrompt ? `\n\n${contextPrompt}` : "");

    const openaiMessages = [
      { role: "system", content: systemMessage },
      ...messages.slice(-10).map((m: ChatMessage) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: openaiMessages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      
      let errorMessage = "AI service temporarily unavailable. Please try again later.";
      if (openaiResponse.status === 401) {
        errorMessage = "Invalid OpenAI API key. Contact your farm administrator.";
      } else if (openaiResponse.status === 429) {
        errorMessage = "OpenAI rate limit reached. Please try again in a few minutes.";
      } else if (openaiResponse.status === 500) {
        errorMessage = "OpenAI service is experiencing issues. Please try again later.";
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices?.[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

    let responseContent = assistantMessage;
    let actions: any[] = [];

    const actionsMatch = assistantMessage.match(/\[ACTIONS\]\s*([\s\S]*?)\s*\[\/ACTIONS\]/);
    if (actionsMatch) {
      try {
        const actionsJson = JSON.parse(actionsMatch[1]);
        actions = actionsJson.actions || [];
        responseContent = assistantMessage.replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/, "").trim();
      } catch (e) {
        console.error("Error parsing actions:", e);
      }
    }

    return new Response(
      JSON.stringify({
        message: responseContent,
        actions,
      }),
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
