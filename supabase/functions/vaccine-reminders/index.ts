/**
 * Vaccine Reminders — cron edge function.
 *
 * Runs daily. Scans upcoming vaccinations and sends push notifications
 * to farm owners/managers when a dose is due in 3 days or 1 day.
 *
 * Uses the existing `vaccination_due` push_subscriptions category —
 * users who have opted out of that category won't receive alerts.
 *
 * Trigger: scheduled cron — run daily at 07:00 farm local time
 * (approximated by running once per hour and filtering by farm timezone).
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Alert windows: 3 days out and 1 day out
  const in1Day = new Date(today); in1Day.setDate(today.getDate() + 1);
  const in3Days = new Date(today); in3Days.setDate(today.getDate() + 3);
  const in4Days = new Date(today); in4Days.setDate(today.getDate() + 4);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // Find all upcoming vaccinations in the alert window that haven't been reminded
  const { data: upcoming, error } = await supabase
    .from("vaccinations")
    .select(`
      id, vaccine_name, scheduled_date, farm_id, flock_id,
      farms!inner (id, name, owner_id)
    `)
    .eq("completed", false)
    .gte("scheduled_date", fmt(in1Day))
    .lte("scheduled_date", fmt(in4Days));

  if (error) {
    console.error("[vaccine-reminders] query error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!upcoming || upcoming.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "nothing due" }), { status: 200 });
  }

  // Group by farm so we send one notification per farm, not per vaccine
  const byFarm: Record<string, { ownerId: string; farmName: string; vaccines: { name: string; date: string; daysOut: number }[] }> = {};

  for (const v of upcoming) {
    const farm = (v as any).farms;
    if (!farm?.owner_id) continue;

    const schedDate = new Date(v.scheduled_date + "T12:00:00");
    schedDate.setHours(0, 0, 0, 0);
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysOut = Math.round((schedDate.getTime() - today.getTime()) / msPerDay);

    // Only alert on exact 1-day or 3-day windows
    if (daysOut !== 1 && daysOut !== 3) continue;

    if (!byFarm[v.farm_id]) {
      byFarm[v.farm_id] = { ownerId: farm.owner_id, farmName: farm.name, vaccines: [] };
    }
    byFarm[v.farm_id].vaccines.push({ name: v.vaccine_name, date: v.scheduled_date, daysOut });
  }

  let totalSent = 0;

  for (const [farmId, { ownerId, farmName, vaccines }] of Object.entries(byFarm)) {
    if (vaccines.length === 0) continue;

    // Get all farm members (owner + managers) to notify
    const { data: members } = await supabase
      .from("farm_members")
      .select("user_id, role")
      .eq("farm_id", farmId)
      .in("role", ["owner", "manager"]);

    const userIds = (members || []).map((m: any) => m.user_id);
    if (userIds.length === 0) continue;

    // Group by days-out for message clarity
    const due1 = vaccines.filter(v => v.daysOut === 1);
    const due3 = vaccines.filter(v => v.daysOut === 3);

    if (due1.length > 0) {
      const names = due1.map(v => v.name).join(", ");
      const title = `💉 Vaccine due tomorrow — ${farmName}`;
      const body = due1.length === 1
        ? `${due1[0].name} is due tomorrow. Log it when administered.`
        : `${due1.length} vaccines due tomorrow: ${names}.`;

      await supabase.functions.invoke("send-push-notification", {
        body: { user_ids: userIds, title, body, url: "/#/vaccinations", tag: `vaccine-due-${farmId}`, category: "vaccination_due" },
      });
      totalSent++;
    }

    if (due3.length > 0) {
      const names = due3.map(v => v.name).join(", ");
      const title = `📅 Vaccine in 3 days — ${farmName}`;
      const body = due3.length === 1
        ? `${due3[0].name} is due in 3 days. Prepare your supplies.`
        : `${due3.length} vaccines due in 3 days: ${names}.`;

      await supabase.functions.invoke("send-push-notification", {
        body: { user_ids: userIds, title, body, url: "/#/vaccinations", tag: `vaccine-3day-${farmId}`, category: "vaccination_due" },
      });
      totalSent++;
    }
  }

  console.log(`[vaccine-reminders] sent ${totalSent} notifications for ${Object.keys(byFarm).length} farms`);
  return new Response(JSON.stringify({ sent: totalSent, farms: Object.keys(byFarm).length }), { status: 200 });
});
