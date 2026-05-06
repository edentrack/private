/**
 * Audio transcription via Whisper — Phase G voice support.
 *
 * Accepts a multipart/form-data POST with:
 *   file:     audio file (webm, ogg, m4a, wav, mp3, etc — Whisper handles all)
 *   language: optional ISO-639-1 hint ('en', 'fr', 'sw', 'yo', 'ha', or 'pidgin')
 *
 * Returns { text, detectedLang, durationSec }.
 *
 * Pidgin note: Whisper does not have a Pidgin model. We pass language='en'
 * for Pidgin and let Whisper transcribe it as casual English — works well
 * for Nigerian Pidgin, less so for Cameroonian.
 *
 * Required env: OPENAI_API_KEY.
 *
 * Rate-limited per user: 30 transcriptions per minute (a normal user
 * would never hit this; a leaked auth token might).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // OpenAI Whisper limit
const MAX_REQUESTS_PER_MINUTE = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestCounts = new Map<string, { count: number; window: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Math.floor(Date.now() / 60_000);
  const record = requestCounts.get(userId);
  if (!record || record.window !== now) {
    requestCounts.set(userId, { count: 1, window: now });
    return true;
  }
  if (record.count >= MAX_REQUESTS_PER_MINUTE) return false;
  record.count += 1;
  return true;
}

function mapLanguageHint(input: string | null): string | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  // Whisper accepts ISO-639-1. Pidgin → 'en' (best fallback). Hausa, Yoruba,
  // Swahili have ISO codes Whisper recognises.
  const map: Record<string, string> = {
    en: "en",
    "en-us": "en",
    "en-gb": "en",
    fr: "fr",
    "fr-fr": "fr",
    sw: "sw",
    yo: "yo",
    ha: "ha",
    pidgin: "en",
    "pcm": "en", // ISO-639-3 for Pidgin → fall back to en
  };
  return map[lower] || lower.slice(0, 2);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Voice transcription not configured. Ask the admin to set OPENAI_API_KEY." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Auth check — we want a real user behind every transcribe call.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData?.user?.id) {
    return new Response(JSON.stringify({ error: "Invalid auth" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  if (!checkRateLimit(userId)) {
    return new Response(
      JSON.stringify({ error: "Rate limit: max 30 transcriptions per minute" }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Bad form data" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const file = formData.get("file");
  if (!(file instanceof File) && !(file instanceof Blob)) {
    return new Response(JSON.stringify({ error: "Missing audio file" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return new Response(
      JSON.stringify({ error: `Audio too large — max ${MAX_AUDIO_BYTES / 1024 / 1024} MB` }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const language = mapLanguageHint(formData.get("language") as string | null);

  // Forward to Whisper.
  const whisperForm = new FormData();
  // Whisper requires a filename with a recognised extension. The browser
  // MediaRecorder produces 'audio/webm' by default; .webm is fine for Whisper.
  const fileName =
    (file as File).name && (file as File).name.includes(".")
      ? (file as File).name
      : "audio.webm";
  whisperForm.append("file", file, fileName);
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "verbose_json");
  if (language) whisperForm.append("language", language);

  let whisperRes: Response;
  try {
    whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: whisperForm,
    });
  } catch (err) {
    console.error("Whisper network error", err);
    return new Response(
      JSON.stringify({ error: "Could not reach the transcription service. Try again." }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text().catch(() => "");
    console.error("Whisper failed", whisperRes.status, errText.slice(0, 200));
    return new Response(
      JSON.stringify({ error: `Transcription failed (${whisperRes.status})` }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const data = await whisperRes.json();
  const text = (data.text || "").trim();
  return new Response(
    JSON.stringify({
      text,
      detectedLang: data.language || null,
      durationSec: data.duration ?? null,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
