/**
 * Inbound WhatsApp webhook — Phase G.
 *
 * The full conversation loop:
 *   farmer sends WhatsApp message (text OR voice note OR image)
 *      ↓
 *   Meta POSTs to this webhook
 *      ↓
 *   We verify the X-Hub-Signature-256 header against WHATSAPP_APP_SECRET
 *      ↓
 *   We look up the phone number in whatsapp_subscriptions to find the user/farm
 *      ↓
 *   For voice notes: download audio from Meta media API, send to Whisper
 *   For text: pass through
 *   For images: pass through to Claude vision (already supported)
 *      ↓
 *   Call our ai-chat edge function as if the user typed in-app
 *      ↓
 *   Send Eden's reply back via WhatsApp Cloud API
 *
 * Endpoints:
 *   GET  /  → Meta's webhook verify challenge. Returns hub.challenge if
 *             hub.verify_token matches WHATSAPP_VERIFY_TOKEN.
 *   POST /  → inbound message events from Meta.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (always)
 *   WHATSAPP_VERIFY_TOKEN                    (matches the one in Meta dashboard)
 *   WHATSAPP_APP_SECRET                      (for signature verification)
 *   WHATSAPP_ACCESS_TOKEN                    (for sending replies + downloading media)
 *   WHATSAPP_PHONE_NUMBER_ID                 (your business number's Meta ID)
 *   OPENAI_API_KEY                           (for Whisper voice transcription)
 *
 * Per Meta's WhatsApp Cloud API docs:
 *   - Free-form replies are allowed within 24h of the user's last message
 *     (so reply messages here use plain `type: text`, not templates).
 *   - Voice notes arrive as media_id; we download via the media API.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const WHATSAPP_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const META_BASE = "https://graph.facebook.com/v19.0";

// ─── Signature verification ────────────────────────────────────────────
/**
 * Meta signs every webhook payload with HMAC-SHA256(payload, app_secret).
 * The signature lives in the X-Hub-Signature-256 header as `sha256=<hex>`.
 * Without verification, anyone who knows our public webhook URL could fake
 * messages. With it, we cryptographically prove the request came from Meta.
 */
async function verifySignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  if (!WHATSAPP_APP_SECRET) {
    console.warn("WHATSAPP_APP_SECRET not set — rejecting all inbound webhooks");
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (actualHex.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actualHex.length; i++) {
    mismatch |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── Whisper transcription ─────────────────────────────────────────────
/**
 * Download a voice note from Meta's media API, then send to OpenAI Whisper.
 * Whisper auto-detects language but we pass a hint when we can.
 *
 * Meta voice notes are .ogg (opus codec). Whisper handles ogg natively.
 *
 * Returns transcribed text or null if transcription failed.
 */
async function transcribeVoiceNote(
  mediaId: string,
  languageHint?: string,
): Promise<{ text: string | null; detectedLang?: string }> {
  if (!OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY not set — cannot transcribe voice");
    return { text: null };
  }
  if (!WHATSAPP_ACCESS_TOKEN) return { text: null };

  // Step 1 — get the media URL from Meta (signed, expires in ~5 min)
  const mediaInfoRes = await fetch(`${META_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!mediaInfoRes.ok) {
    console.error("Failed to fetch media info from Meta", mediaInfoRes.status);
    return { text: null };
  }
  const mediaInfo = await mediaInfoRes.json();
  if (!mediaInfo.url) return { text: null };

  // Step 2 — download the actual audio bytes (Meta requires the bearer token here too)
  const audioRes = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });
  if (!audioRes.ok) {
    console.error("Failed to download audio from Meta CDN", audioRes.status);
    return { text: null };
  }
  const audioBlob = await audioRes.blob();

  // Step 3 — POST to OpenAI Whisper
  const formData = new FormData();
  formData.append("file", audioBlob, "voice.ogg");
  formData.append("model", "whisper-1");
  if (languageHint) {
    // Whisper accepts ISO-639-1 codes. Pidgin doesn't have one — Whisper
    // transcribes Pidgin reasonably well as 'en' so we pass that.
    const languageMap: Record<string, string> = {
      en: "en",
      fr: "fr",
      sw: "sw", // Swahili
      yo: "yo", // Yoruba — limited Whisper support but worth trying
      ha: "ha", // Hausa — limited Whisper support
      pidgin: "en", // Pidgin → fall back to English mode
    };
    const code = languageMap[languageHint] || languageHint.slice(0, 2);
    formData.append("language", code);
  }
  formData.append("response_format", "verbose_json");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: formData,
  });
  if (!whisperRes.ok) {
    const errText = await whisperRes.text().catch(() => "");
    console.error("Whisper failed", whisperRes.status, errText.slice(0, 200));
    return { text: null };
  }
  const whisperJson = await whisperRes.json();
  return { text: (whisperJson.text || "").trim() || null, detectedLang: whisperJson.language };
}

// ─── WhatsApp send (free-form, within 24h window) ──────────────────────
async function sendWhatsappText(toE164: string, text: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;
  const to = toE164.replace(/^\+/, "");
  const res = await fetch(`${META_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("WhatsApp send failed", res.status, err.slice(0, 200));
  }
}

// ─── Mark a Meta message as read (best-effort) ─────────────────────────
async function markRead(messageId: string): Promise<void> {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;
  try {
    await fetch(`${META_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  } catch { /* swallow */ }
}

// ─── User lookup from phone ────────────────────────────────────────────
interface FarmContext {
  user_id: string;
  farm_id: string;
}

/**
 * Look up the (user, farm) pair from the inbound phone number. We use the
 * whatsapp_subscriptions table — opting in for daily reports also opts you
 * in for inbound conversational replies. If a phone is enrolled on multiple
 * farms, we pick the most recently active one.
 */
async function lookupUserFromPhone(
  supabase: SupabaseClient,
  phoneE164: string,
): Promise<FarmContext | null> {
  const { data } = await supabase
    .from("whatsapp_subscriptions")
    .select("user_id, farm_id, last_sent_at, created_at")
    .eq("phone_e164", phoneE164)
    .order("last_sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { user_id: data.user_id, farm_id: data.farm_id };
}

// ─── Call our existing ai-chat edge function ───────────────────────────
async function callEdenAI(
  ctx: FarmContext,
  userText: string,
  fnAuthHeader: string,
): Promise<string> {
  const url = `${SUPABASE_URL}/functions/v1/ai-chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: fnAuthHeader,
    },
    body: JSON.stringify({
      farm_id: ctx.farm_id,
      messages: [
        {
          role: "user",
          content: userText,
        },
      ],
      include_context: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("ai-chat call failed", res.status, err.slice(0, 300));
    return "Sorry — I couldn't process that right now. Please try again in a moment.";
  }
  const data = await res.json();
  const reply = (data?.reply as string) || (data?.content as string) || "";
  return reply || "Got it.";
}

// ─── Webhook handler ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  // GET /  → Meta verify challenge. Used once during initial webhook
  // registration in the Meta dashboard.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Read the body once as text so we can both verify the signature and
  // parse it. Reading req.json() first would consume the stream.
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-hub-signature-256") || "";
  const isValid = await verifySignature(rawBody, signatureHeader);
  if (!isValid) {
    console.warn("Inbound webhook signature invalid — rejecting");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Always ack quickly. Meta retries aggressively (3+ times within 5
  // minutes) if we 500 or take too long. Process inline ONLY if we can
  // finish in <10s; otherwise we'd want a queue. For voice + Whisper +
  // Eden, ~5–8s is realistic so we stay synchronous for now.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const fnAuthHeader = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;

  try {
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];

        for (const message of messages) {
          const fromRaw = message.from as string | undefined;       // E.164 without leading +
          const messageId = message.id as string | undefined;
          if (!fromRaw || !messageId) continue;
          const fromE164 = `+${fromRaw}`;

          // Acknowledge so the sender sees the double-blue-tick
          if (messageId) markRead(messageId);

          const ctx = await lookupUserFromPhone(supabase, fromE164);
          if (!ctx) {
            // Unknown phone — politely turn them away.
            await sendWhatsappText(
              fromE164,
              "Hi! This number is not enrolled with EdenTrack. Please open the app, go to Settings → WhatsApp daily report, and add your phone number to start chatting with me here.",
            );
            continue;
          }

          // Resolve the user message to plain text.
          let userText: string | null = null;
          if (message.type === "text") {
            userText = (message.text?.body || "").trim() || null;
          } else if (message.type === "audio" || message.type === "voice") {
            const mediaId = message.audio?.id || message.voice?.id;
            if (mediaId) {
              const { text } = await transcribeVoiceNote(mediaId);
              userText = text;
            }
            if (!userText) {
              await sendWhatsappText(
                fromE164,
                "I couldn't hear that voice note clearly. Please try again or send a text message.",
              );
              continue;
            }
          } else if (message.type === "image") {
            // Image-based questions could be wired through Claude vision in
            // the next iteration. For now, ack and direct to the app.
            await sendWhatsappText(
              fromE164,
              "Photo received! Eden's photo diagnosis is in the app for now. Open EdenTrack → Fish Health → Diagnose from photo. I can answer typed or voice questions about your farm here.",
            );
            continue;
          } else {
            // unsupported message type
            await sendWhatsappText(
              fromE164,
              "I can only handle text and voice notes right now. Please try a typed message.",
            );
            continue;
          }

          if (!userText) continue;

          // Log inbound for the audit trail (optional — only if the table
          // exists; fail soft).
          try {
            await supabase.from("whatsapp_messages_log").insert({
              farm_id: ctx.farm_id,
              user_id: ctx.user_id,
              direction: "inbound",
              text: userText,
              raw_message_id: messageId,
            });
          } catch { /* table may not exist yet */ }

          // Hand off to Eden AI
          const reply = await callEdenAI(ctx, userText, fnAuthHeader);

          // Send the reply
          await sendWhatsappText(fromE164, reply);

          // Log outbound
          try {
            await supabase.from("whatsapp_messages_log").insert({
              farm_id: ctx.farm_id,
              user_id: ctx.user_id,
              direction: "outbound",
              text: reply,
            });
          } catch { /* swallow */ }
        }
      }
    }
  } catch (err) {
    // We must still 200 to Meta even on internal failure, otherwise we'll
    // get re-delivered the same payload up to 3 more times.
    console.error("Webhook processing error", err);
  }

  return new Response("OK", { status: 200 });
});
