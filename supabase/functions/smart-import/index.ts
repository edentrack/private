import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace("/smart-import", "");

  try {
    if (path === "/health" || path === "") {
      return new Response(
        JSON.stringify({
          ok: true,
          aiConfigured: !!OPENAI_API_KEY,
        }),
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

    if (path === "/analyze" && req.method === "POST") {
      return await handleAnalyze(req, user.id);
    }

    if (path === "/commit" && req.method === "POST") {
      return await handleCommit(req, user.id);
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

async function handleAnalyze(req: Request, userId: string): Promise<Response> {
  const body = await req.json();
  const { import_id, file_ids, scope, target_flock_id, use_ai } = body;

  if (!import_id) {
    return new Response(
      JSON.stringify({ error: "Missing import_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: importRecord, error: importError } = await supabaseAdmin
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

  const { data: membership } = await supabaseAdmin
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

  const files = importRecord.import_files || [];
  let extractedText = "";

  for (const file of files) {
    if (file.mime_type === "text/csv" || file.file_name.endsWith(".csv")) {
      const { data: fileData } = await supabaseAdmin.storage
        .from("imports")
        .download(file.storage_path);
      
      if (fileData) {
        const text = await fileData.text();
        extractedText += `\n\n=== ${file.file_name} ===\n${text}`;
        
        await supabaseAdmin
          .from("import_files")
          .update({ extracted_text: text })
          .eq("id", file.id);
      }
    } else if (file.mime_type === "application/pdf") {
      extractedText += `\n\n=== ${file.file_name} ===\n[PDF content extraction requires AI]`;
    } else if (file.mime_type?.startsWith("image/")) {
      extractedText += `\n\n=== ${file.file_name} ===\n[Image analysis requires AI]`;
    }
  }

  if (!use_ai || !OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({
        success: true,
        import_id,
        message: "Files uploaded. AI features not configured. Use CSV mapping for structured imports.",
        items_count: 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: flocks } = await supabaseAdmin
    .from("flocks")
    .select("id, name, purpose")
    .eq("farm_id", importRecord.farm_id)
    .eq("is_archived", false);

  const flockContext = flocks?.length
    ? `Existing flocks: ${flocks.map(f => `${f.name} (${f.purpose})`).join(", ")}`
    : "No existing flocks";

  // Get user's preferred language for AI prompts
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('preferred_language')
    .eq('id', userId)
    .single();
  
  const userLanguage = profile?.preferred_language || 'en';
  const isFrench = userLanguage === 'fr';

  const systemPrompt = isFrench 
    ? `Vous êtes un assistant d'extraction de données agricoles. Extrayez des données structurées à partir de documents de ferme.

Règles:
1. Sortez UNIQUEMENT du JSON valide correspondant au schéma ImportBundle
2. Les dates doivent être au format YYYY-MM-DD
3. La devise doit être XAF par défaut si non spécifiée
4. La confiance est 0.0-1.0 basée sur votre certitude
5. source_excerpt doit être l'extrait de texte pertinent
6. Pour les dépenses, catégorisez comme: Aliments, Médicaments, Équipement, Main-d'œuvre, Services publics, Transport, Autre
7. Pour les journaux de production, utilisez les types: mortalité, poids, nombre_œufs, utilisation_aliments, consommation_eau, notes
8. Pour l'inventaire, utilisez les types: aliments, autre
9. Si la portée est existing_flock, liez les éléments à ce troupeau
10. Ajoutez des avertissements pour toute donnée ambiguë ou potentiellement incorrecte
11. Pour les troupeaux détectés, extrayez: nom, type (Broiler ou Layer), nombre d'oiseaux, date de début
12. Remplissez intelligemment tous les champs disponibles dans le schéma
13. Si une information est manquante ou incertaine, marquez-la avec une confiance faible et ajoutez un avertissement

${flockContext}
Portée cible: ${scope}
${target_flock_id ? `ID du troupeau cible: ${target_flock_id}` : ''}`
    : `You are a farm data extraction assistant. Extract structured data from farm documents.

Rules:
1. Output ONLY valid JSON matching the ImportBundle schema
2. Dates must be YYYY-MM-DD format
3. Currency should default to XAF if not specified
4. Confidence is 0.0-1.0 based on how certain you are
5. source_excerpt should be the relevant text snippet
6. For expenses, categorize as: Feed, Medication, Equipment, Labor, Utilities, Transport, Other
7. For production logs, use types: mortality, weight, egg_count, feed_usage, water_intake, notes
8. For inventory, use types: feed, other
9. If scope is existing_flock, link items to that flock
10. Add warnings for any ambiguous or potentially incorrect data
11. For detected flocks, extract: name, type (Broiler or Layer), bird count, start date
12. Intelligently fill all available fields in the schema
13. If information is missing or uncertain, mark it with low confidence and add a warning

${flockContext}
Target scope: ${scope}
${target_flock_id ? `Target flock ID: ${target_flock_id}` : ''}`;

  const userPrompt = isFrench
    ? `Extrayez toutes les données de ferme de ce document:\n${extractedText}\n\nRetournez du JSON correspondant au schéma ImportBundle. Pour chaque élément extrait, incluez des questions de vérification dans le champ "verification_questions" si la confiance est inférieure à 0.9.`
    : `Extract all farm data from this document:\n${extractedText}\n\nReturn JSON matching ImportBundle schema. For each extracted item, include verification questions in the "verification_questions" field if confidence is below 0.9.`;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`OpenAI API error: ${aiResponse.statusText}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("No content from AI");
    }

    const bundle: ImportBundle = JSON.parse(content);
    const importItems: any[] = [];

    for (const flock of bundle.detected_flocks || []) {
      importItems.push({
        import_id,
        farm_id: importRecord.farm_id,
        entity_type: "flock",
        payload: {
          ...flock,
          verification_questions: flock.verification_questions || (flock.confidence < 0.9 ? [
            `Is the flock name "${flock.name}" correct?`,
            `Is the type "${flock.type}" correct?`,
            `Is the bird count ${flock.bird_count} accurate?`,
            `Is the start date ${flock.start_date} correct?`
          ] : [])
        },
        confidence: flock.confidence,
        needs_review: flock.confidence < 0.8 || (flock.verification_questions && flock.verification_questions.length > 0),
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
          verification_questions: expense.verification_questions || (expense.confidence < 0.9 ? [
            `Is the amount ${expense.amount} ${expense.currency} correct?`,
            `Is the category "${expense.category}" appropriate?`,
            `Is the date ${expense.incurred_on} accurate?`
          ] : [])
        },
        confidence: expense.confidence,
        needs_review: expense.confidence < 0.8 || (expense.verification_questions && expense.verification_questions.length > 0),
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
      await supabaseAdmin.from("import_items").insert(importItems);
    }

    if (bundle.warnings?.length) {
      await supabaseAdmin
        .from("import_items")
        .insert({
          import_id,
          farm_id: importRecord.farm_id,
          entity_type: "expense",
          payload: { warnings: bundle.warnings },
          confidence: 1,
          needs_review: false,
          status: "proposed",
        });
    }

    await supabaseAdmin
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

async function handleCommit(req: Request, userId: string): Promise<Response> {
  const body = await req.json();
  const { import_id, selected_item_ids } = body;

  if (!import_id) {
    return new Response(
      JSON.stringify({ error: "Missing import_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: importRecord, error: importError } = await supabaseAdmin
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

  const { data: membership } = await supabaseAdmin
    .from("farm_members")
    .select("role")
    .eq("farm_id", importRecord.farm_id)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership || !['owner', 'manager'].includes(membership.role)) {
    return new Response(
      JSON.stringify({ error: "Only owners and managers can commit imports" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let itemsQuery = supabaseAdmin
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

  const { data: flocks } = await supabaseAdmin
    .from("flocks")
    .select("id, name, purpose")
    .eq("farm_id", importRecord.farm_id)
    .eq("is_archived", false);

  const broilerOnly = flocks?.every(f => f.purpose?.toLowerCase() === 'broiler');
  const layerOnly = flocks?.every(f => f.purpose?.toLowerCase() === 'layer');

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
        const { error } = await supabaseAdmin.from("flocks").insert({
          farm_id: importRecord.farm_id,
          name: payload.name,
          purpose: payload.type?.toLowerCase() === 'layer' ? 'Layer' : 'Broiler',
          initial_count: payload.bird_count,
          current_count: payload.bird_count,
          arrival_date: payload.start_date,
        });
        if (error) throw error;
        results.flocks++;
      }

      if (item.entity_type === "expense") {
        const { error } = await supabaseAdmin.from("expenses").insert({
          farm_id: importRecord.farm_id,
          flock_id: item.linked_flock_id,
          category: payload.category || 'Other',
          amount: payload.amount,
          currency: payload.currency || 'XAF',
          description: payload.description,
          vendor: payload.vendor,
          incurred_on: payload.incurred_on,
        });
        if (error) throw error;
        results.expenses++;
      }

      if (item.entity_type === "inventory") {
        if (payload.inventory_type === "feed") {
          const { error } = await supabaseAdmin.from("feed_stock").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            feed_type: payload.item_name,
            quantity_kg: payload.unit === 'bags' ? payload.quantity * 50 : payload.quantity,
            purchase_date: payload.purchased_on,
            cost_per_kg: payload.cost ? payload.cost / (payload.unit === 'bags' ? payload.quantity * 50 : payload.quantity) : null,
          });
          if (error) throw error;
        } else {
          const { error } = await supabaseAdmin.from("other_inventory").insert({
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
        if (broilerOnly && payload.log_type === 'egg_count') {
          results.errors.push(`Skipped egg_count log - farm has only broiler flocks`);
          await supabaseAdmin
            .from("import_items")
            .update({ status: "failed", error_message: "Farm has only broiler flocks" })
            .eq("id", item.id);
          continue;
        }

        if (payload.log_type === "mortality") {
          await supabaseAdmin.from("mortality_logs").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            count: payload.value,
            cause: payload.notes || 'Imported',
            logged_at: payload.logged_on,
          });
        } else if (payload.log_type === "weight") {
          await supabaseAdmin.from("weight_logs").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            average_weight: payload.value,
            sample_size: 1,
            logged_at: payload.logged_on,
          });
        } else if (payload.log_type === "egg_count") {
          await supabaseAdmin.from("egg_collections").insert({
            farm_id: importRecord.farm_id,
            flock_id: item.linked_flock_id,
            quantity: payload.value,
            collection_date: payload.logged_on,
          });
        }
        results.production++;
      }

      if (item.entity_type === "task_template") {
        if (broilerOnly && payload.flock_type === 'layer') {
          results.errors.push(`Skipped layer task template - farm has only broiler flocks`);
          continue;
        }
        if (layerOnly && payload.flock_type === 'broiler') {
          results.errors.push(`Skipped broiler task template - farm has only layer flocks`);
          continue;
        }

        const { error } = await supabaseAdmin.from("task_templates").insert({
          farm_id: importRecord.farm_id,
          name: payload.title,
          category: payload.category || 'General',
          frequency: payload.kind || 'daily',
          default_time: payload.default_time || '08:00',
          completion_window_minutes: payload.completion_window_minutes || 120,
          flock_type_scope: payload.flock_type || 'general',
          input_fields: payload.input_fields || [],
          is_active: true,
          scope: 'flock',
        });
        if (error) throw error;
        results.tasks++;
      }

      await supabaseAdmin
        .from("import_items")
        .update({ status: "imported" })
        .eq("id", item.id);

    } catch (err) {
      console.error(`Error processing item ${item.id}:`, err);
      results.errors.push(`Failed to import ${item.entity_type}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      await supabaseAdmin
        .from("import_items")
        .update({ status: "failed", error_message: err instanceof Error ? err.message : 'Unknown error' })
        .eq("id", item.id);
    }
  }

  await supabaseAdmin
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
    JSON.stringify({
      success: true,
      import_id,
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
