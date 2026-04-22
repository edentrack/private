import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://edentrack.app";

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed =
    origin === ALLOWED_ORIGIN ||
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_IMPORT_MODEL") || "claude-sonnet-4-6";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// Admin client: ONLY for auth.getUser(), storage downloads, and audit_log writes
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ImportBundle {
  document_summary: string;
  detected_flocks: Array<{
    name: string;
    type: string;
    bird_count: number;
    start_date: string;
    confidence: number;
    source_excerpt: string;
    verification_questions?: string[];
  }>;
  expenses: Array<{
    incurred_on: string;
    category: string;
    amount: number;
    currency: string;
    description: string;
    vendor: string;
    linked_flock_hint: string;
    confidence: number;
    source_excerpt: string;
    verification_questions?: string[];
  }>;
  inventory: Array<{
    inventory_type: string;
    item_name: string;
    quantity: number;
    unit: string;
    purchased_on: string;
    cost: number;
    currency: string;
    linked_flock_hint: string;
    confidence: number;
    source_excerpt: string;
    verification_questions?: string[];
  }>;
  production_logs: Array<{
    log_type: string;
    logged_on: string;
    value: number;
    unit: string;
    notes: string;
    linked_flock_hint: string;
    confidence: number;
    source_excerpt: string;
    verification_questions?: string[];
  }>;
  task_templates: Array<{
    title: string;
    kind: string;
    category: string;
    flock_type: string;
    default_time: string;
    completion_window_minutes: number;
    input_fields: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      unit?: string;
      options?: string[];
    }>;
    confidence: number;
    source_excerpt: string;
  }>;
  warnings: string[];
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/smart-import", "");

  try {
    if (path === "/health" || path === "") {
      return new Response(
        JSON.stringify({ ok: true, aiConfigured: !!ANTHROPIC_API_KEY }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // User-scoped client — all DB operations go through RLS as the authenticated user
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    if (path === "/analyze" && req.method === "POST") {
      return await handleAnalyze(req, user.id, userClient);
    }

    if (path === "/commit" && req.method === "POST") {
      return await handleCommit(req, user.id, userClient);
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleAnalyze(req: Request, userId: string, userClient: ReturnType<typeof createClient>): Promise<Response> {
  const body = await req.json();
  const { import_id, scope, target_flock_id, use_ai } = body;

  if (!import_id) {
    return new Response(
      JSON.stringify({ error: "Missing import_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // RLS enforces that the user can only see imports belonging to their farm
  const { data: importRecord, error: importError } = await userClient
    .from("imports")
    .select("*, import_files(*)")
    .eq("id", import_id)
    .single();

  if (importError || !importRecord) {
    return new Response(
      JSON.stringify({ error: "Import not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Explicit membership check on top of RLS — confirms write-level access
  const { data: membership } = await userClient
    .from("farm_members")
    .select("role")
    .eq("farm_id", importRecord.farm_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) {
    return new Response(
      JSON.stringify({ error: "Access denied" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!use_ai || !ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        success: true,
        import_id,
        message: "Files uploaded. Use CSV mapping for structured imports.",
        items_count: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const files = importRecord.import_files || [];

  // Build Claude message content — text + images side by side
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

  const contentBlocks: ContentBlock[] = [];
  let hasContent = false;

  for (const file of files) {
    const isCSV =
      file.mime_type === "text/csv" ||
      file.file_name.endsWith(".csv") ||
      file.file_name.endsWith(".xlsx") ||
      file.mime_type?.includes("spreadsheet");
    const isImage = file.mime_type?.startsWith("image/");

    if (isCSV) {
      const { data: fileData } = await supabaseAdmin.storage
        .from("imports")
        .download(file.storage_path);
      if (fileData) {
        const text = await fileData.text();
        contentBlocks.push({
          type: "text",
          text: `\n=== ${file.file_name} ===\n${text}`,
        });
        await userClient
          .from("import_files")
          .update({ extracted_text: text })
          .eq("id", file.id);
        hasContent = true;
      }
    } else if (isImage) {
      // Send image directly to Claude Vision
      const { data: fileData } = await supabaseAdmin.storage
        .from("imports")
        .download(file.storage_path);
      if (fileData) {
        const buffer = await fileData.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.mime_type as string,
            data: base64,
          },
        });
        contentBlocks.push({
          type: "text",
          text: `(Image file: ${file.file_name})`,
        });
        hasContent = true;
      }
    } else if (file.mime_type === "application/pdf") {
      contentBlocks.push({
        type: "text",
        text: `\n=== ${file.file_name} ===\n[PDF detected — please extract key data visible on the document if any text context is available]`,
      });
    }
  }

  if (!hasContent && contentBlocks.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No readable content found in uploaded files" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: flocks } = await userClient
    .from("flocks")
    .select("id, name, purpose")
    .eq("farm_id", importRecord.farm_id)
    .eq("is_archived", false);

  const { data: profile } = await userClient
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .single();

  const isFrench = profile?.preferred_language === "fr";
  const flockContext = flocks?.length
    ? `Existing flocks: ${flocks.map((f) => `${f.name} (${f.purpose})`).join(", ")}`
    : "No existing flocks";

  const systemPrompt = isFrench
    ? `Vous êtes un assistant d'extraction de données agricoles pour des fermes africaines. Extrayez des données structurées à partir de documents (reçus, factures, photos, tableurs).

Règles:
1. Sortez UNIQUEMENT du JSON valide correspondant au schéma ImportBundle
2. Dates au format YYYY-MM-DD
3. Devise par défaut XAF si non spécifiée
4. Confiance 0.0–1.0
5. Pour les dépenses: Aliments, Médicaments, Équipement, Main-d'œuvre, Services, Transport, Autre
6. Pour les journaux: mortalité, poids, nombre_œufs, utilisation_aliments, eau, notes
7. Pour l'inventaire: aliments, autre
8. Ajoutez des avertissements pour données ambiguës
9. Remplissez intelligemment tous les champs disponibles

${flockContext}
Portée: ${scope}${target_flock_id ? ` | Troupeau cible: ${target_flock_id}` : ""}`
    : `You are a farm data extraction assistant for African poultry farms. Extract structured data from documents (receipts, invoices, photos, spreadsheets).

Rules:
1. Output ONLY valid JSON matching the ImportBundle schema
2. Dates must be YYYY-MM-DD
3. Default currency XAF if not specified
4. Confidence is 0.0–1.0
5. Expenses categories: Feed, Medication, Equipment, Labor, Utilities, Transport, Other
6. Production log types: mortality, weight, egg_count, feed_usage, water_intake, notes
7. Inventory types: feed, other
8. Add warnings for ambiguous data
9. Fill all available fields intelligently — even from partial information

${flockContext}
Scope: ${scope}${target_flock_id ? ` | Target flock: ${target_flock_id}` : ""}`;

  const userTextPrompt = isFrench
    ? "Extrayez toutes les données agricoles de ce document et retournez du JSON ImportBundle. Incluez des verification_questions pour tout élément avec confiance < 0.9."
    : "Extract all farm data from this document and return ImportBundle JSON. Include verification_questions for any item with confidence < 0.9.";

  // Final content: instruction text last
  contentBlocks.push({ type: "text", text: userTextPrompt });

  try {
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`Claude API error: ${aiResponse.statusText}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text;
    if (!content) throw new Error("No content from AI");

    // Extract JSON even if Claude wraps it in markdown
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
      content.match(/```\s*([\s\S]*?)\s*```/) ||
      [null, content];
    const bundle: ImportBundle = JSON.parse(jsonMatch[1] || content);

    const importItems: any[] = [];

    for (const flock of bundle.detected_flocks || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "flock",
        payload: {
          ...flock,
          verification_questions:
            flock.verification_questions ||
            (flock.confidence < 0.9
              ? [
                  `Is the flock name "${flock.name}" correct?`,
                  `Is the type "${flock.type}" correct?`,
                  `Is the bird count ${flock.bird_count} accurate?`,
                  `Is the start date ${flock.start_date} correct?`,
                ]
              : []),
        },
        confidence: flock.confidence,
        needs_review:
          flock.confidence < 0.8 ||
          (flock.verification_questions && flock.verification_questions.length > 0),
        source_excerpt: flock.source_excerpt,
        status: "proposed",
      });
    }

    for (const expense of bundle.expenses || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "expense",
        payload: {
          ...expense,
          verification_questions:
            expense.verification_questions ||
            (expense.confidence < 0.9
              ? [
                  `Is the amount ${expense.amount} ${expense.currency} correct?`,
                  `Is the category "${expense.category}" appropriate?`,
                  `Is the date ${expense.incurred_on} accurate?`,
                ]
              : []),
        },
        confidence: expense.confidence,
        needs_review:
          expense.confidence < 0.8 ||
          (expense.verification_questions && expense.verification_questions.length > 0),
        source_excerpt: expense.source_excerpt,
        status: "proposed",
        linked_flock_id: target_flock_id || null,
      });
    }

    for (const inv of bundle.inventory || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "inventory",
        payload: inv,
        confidence: inv.confidence,
        needs_review: inv.confidence < 0.8,
        source_excerpt: inv.source_excerpt,
        status: "proposed",
        linked_flock_id: target_flock_id || null,
      });
    }

    for (const log of bundle.production_logs || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "production",
        payload: log,
        confidence: log.confidence,
        needs_review: log.confidence < 0.8,
        source_excerpt: log.source_excerpt,
        status: "proposed",
        linked_flock_id: target_flock_id || null,
      });
    }

    for (const task of bundle.task_templates || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "task_template",
        payload: task,
        confidence: task.confidence,
        needs_review: task.confidence < 0.8,
        source_excerpt: task.source_excerpt,
        status: "proposed",
      });
    }

    if (importItems.length > 0) {
      await userClient.from("import_items").insert(importItems);
    }

    await userClient
      .from("imports")
      .update({ status: "ready" })
      .eq("id", import_id);

    return new Response(
      JSON.stringify({
        success: true,
        import_id,
        summary: bundle.document_summary,
        counts: {
          flocks: bundle.detected_flocks?.length || 0,
          expenses: bundle.expenses?.length || 0,
          inventory: bundle.inventory?.length || 0,
          production: bundle.production_logs?.length || 0,
          tasks: bundle.task_templates?.length || 0,
        },
        warnings: bundle.warnings || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("AI extraction error:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "AI extraction failed",
        import_id,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function handleCommit(req: Request, userId: string, userClient: ReturnType<typeof createClient>): Promise<Response> {
  const body = await req.json();
  const { import_id, selected_item_ids } = body;

  if (!import_id) {
    return new Response(
      JSON.stringify({ error: "Missing import_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // RLS enforces farm ownership — user can only fetch their own imports
  const { data: importRecord, error: importError } = await userClient
    .from("imports")
    .select("*")
    .eq("id", import_id)
    .single();

  if (importError || !importRecord) {
    return new Response(
      JSON.stringify({ error: "Import not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: membership } = await userClient
    .from("farm_members")
    .select("role")
    .eq("farm_id", importRecord.farm_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return new Response(
      JSON.stringify({ error: "Only owners and managers can commit imports" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let itemsQuery = userClient
    .from("import_items")
    .select("*")
    .eq("import_id", import_id)
    .in("status", ["proposed", "edited"]);

  if (selected_item_ids?.length) {
    itemsQuery = itemsQuery.in("id", selected_item_ids);
  }

  const { data: items, error: itemsError } = await itemsQuery;
  if (itemsError || !items) {
    return new Response(
      JSON.stringify({ error: "Failed to load items" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: flocks } = await userClient
    .from("flocks")
    .select("id, name, purpose")
    .eq("farm_id", importRecord.farm_id)
    .eq("is_archived", false);

  const broilerOnly = flocks?.every((f) => f.purpose?.toLowerCase() === "broiler");
  const layerOnly = flocks?.every((f) => f.purpose?.toLowerCase() === "layer");

  const results = {
    flocks: 0,
    expenses: 0,
    inventory: 0,
    production: 0,
    tasks: 0,
    errors: [] as string[],
  };

  for (const item of items) {
    try {
      const payload = item.payload;

      if (item.entity_type === "flock") {
        const { error } = await userClient.from("flocks").insert({
          farm_id: importRecord.farm_id,
          name: payload.name,
          purpose: payload.type?.toLowerCase() === "layer" ? "Layer" : "Broiler",
          initial_count: payload.bird_count,
          current_count: payload.bird_count,
          arrival_date: payload.start_date,
        });
        if (error) throw error;
        results.flocks++;
      }

      if (item.entity_type === "expense") {
        const { error } = await userClient.from("expenses").insert({
          farm_id: importRecord.farm_id,
          flock_id: item.linked_flock_id,
          category: payload.category || "Other",
          amount: payload.amount,
          currency: payload.currency || "XAF",
          description: payload.description,
          vendor: payload.vendor,
          incurred_on: payload.incurred_on,
        });
        if (error) throw error;
        results.expenses++;
      }

      if (item.entity_type === "inventory") {
        if (payload.inventory_type === "feed") {
          const { error } = await userClient.from("feed_stock").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            feed_type: payload.item_name,
            quantity_kg:
              payload.unit === "bags" ? payload.quantity * 50 : payload.quantity,
            purchase_date: payload.purchased_on,
            cost_per_kg: payload.cost
              ? payload.cost /
                (payload.unit === "bags" ? payload.quantity * 50 : payload.quantity)
              : null,
          });
          if (error) throw error;
        } else {
          const { error } = await userClient.from("other_inventory").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            item_name: payload.item_name,
            quantity: payload.quantity,
            unit: payload.unit,
            purchase_date: payload.purchased_on,
            cost: payload.cost,
          });
          if (error) throw error;
        }
        results.inventory++;
      }

      if (item.entity_type === "production") {
        if (broilerOnly && payload.log_type === "egg_count") {
          results.errors.push("Skipped egg_count log — farm has only broiler flocks");
          await userClient
            .from("import_items")
            .update({ status: "failed", error_message: "Farm has only broiler flocks" })
            .eq("id", item.id);
          continue;
        }

        if (payload.log_type === "mortality") {
          await userClient.from("mortality_logs").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            count: payload.value,
            cause: payload.notes || "Imported",
            logged_at: payload.logged_on,
          });
        } else if (payload.log_type === "weight") {
          await userClient.from("weight_logs").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            average_weight: payload.value,
            sample_size: 1,
            logged_at: payload.logged_on,
          });
        } else if (payload.log_type === "egg_count") {
          await userClient.from("egg_collections").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            quantity: payload.value,
            collection_date: payload.logged_on,
          });
        }
        results.production++;
      }

      if (item.entity_type === "task_template") {
        if (broilerOnly && payload.flock_type === "layer") {
          results.errors.push("Skipped layer task template — farm has only broiler flocks");
          continue;
        }
        if (layerOnly && payload.flock_type === "broiler") {
          results.errors.push("Skipped broiler task template — farm has only layer flocks");
          continue;
        }
        const { error } = await userClient.from("task_templates").insert({
          farm_id: importRecord.farm_id,
          name: payload.title,
          category: payload.category || "General",
          frequency: payload.kind || "daily",
          default_time: payload.default_time || "08:00",
          completion_window_minutes: payload.completion_window_minutes || 120,
          flock_type_scope: payload.flock_type || "general",
          input_fields: payload.input_fields || [],
          is_active: true,
          scope: "flock",
        });
        if (error) throw error;
        results.tasks++;
      }

      await userClient
        .from("import_items")
        .update({ status: "imported" })
        .eq("id", item.id);
    } catch (err) {
      console.error(`Error processing item ${item.id}:`, err);
      const msg = `Failed to import ${item.entity_type}: ${err instanceof Error ? err.message : "Unknown error"}`;
      results.errors.push(msg);
      await userClient
        .from("import_items")
        .update({ status: "failed", error_message: msg })
        .eq("id", item.id);
    }
  }

  await userClient
    .from("imports")
    .update({ status: "committed" })
    .eq("id", import_id);

  await supabaseAdmin.from("audit_log").insert({
    farm_id: importRecord.farm_id,
    actor_id: userId,
    action: "import.commit",
    entity_type: "import",
    entity_id: import_id,
    details: results,
  });

  return new Response(
    JSON.stringify({ success: true, import_id, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
