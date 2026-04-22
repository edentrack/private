import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Eden <alerts@edentrack.app>";

// Spike threshold: today's rate must be this multiple of the 7-day average
const SPIKE_THRESHOLD = 2.0;
// Minimum deaths to trigger (avoid noise on tiny flocks)
const MIN_DEATHS_TO_ALERT = 3;

interface AlertResult {
  farm_id: string;
  farm_name: string;
  flock_name: string;
  today_deaths: number;
  avg_daily_deaths: number;
  spike_ratio: number;
  likely_causes: string[];
}

async function sendAlertEmail(to: string, farmName: string, alerts: AlertResult[]) {
  if (!RESEND_API_KEY) return;

  const alertLines = alerts.map(a => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${a.flock_name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;color:#dc2626;font-weight:bold;">${a.today_deaths} deaths today</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${a.avg_daily_deaths.toFixed(1)} avg/day</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${a.spike_ratio.toFixed(1)}× spike</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${a.likely_causes.join(', ')}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#5C3D2E;padding:20px;border-radius:12px 12px 0 0;">
        <h1 style="color:#F5A623;margin:0;font-size:20px;">⚠️ Mortality Spike Alert — ${farmName}</h1>
        <p style="color:#fff;margin:8px 0 0;font-size:14px;">Eden detected unusual mortality rates on your farm</p>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9f9f9;">
              <th style="padding:8px;text-align:left;">Flock</th>
              <th style="padding:8px;text-align:left;">Today</th>
              <th style="padding:8px;text-align:left;">7-day avg</th>
              <th style="padding:8px;text-align:left;">Spike</th>
              <th style="padding:8px;text-align:left;">Likely causes</th>
            </tr>
          </thead>
          <tbody>${alertLines}</tbody>
        </table>
        <div style="margin-top:20px;padding:16px;background:#FEF3C7;border-radius:8px;">
          <p style="margin:0;font-size:14px;color:#92400E;">
            <strong>Immediate actions:</strong> Isolate affected birds, check water/feed quality,
            improve ventilation, remove dead birds immediately. If deaths continue, contact your vet.
          </p>
        </div>
        <p style="margin-top:16px;font-size:12px;color:#999;">
          Open Edentrack and ask Eden AI about the symptoms for a diagnosis.
          This alert was sent by Eden, your farm advisor.
        </p>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject: `⚠️ Mortality spike detected on ${farmName} — take action now`,
      html,
    }),
  });
}

Deno.serve(async (req: Request) => {
  // Allow manual trigger via POST for testing
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // Get all active farms with at least pro tier
    const { data: farms } = await supabase
      .from("farms")
      .select("id, name")
      .eq("is_active", true);

    if (!farms?.length) return new Response(JSON.stringify({ checked: 0 }));

    let totalAlerts = 0;

    for (const farm of farms) {
      // Get active flocks for this farm
      const { data: flocks } = await supabase
        .from("flocks")
        .select("id, name, current_count, type")
        .eq("farm_id", farm.id)
        .eq("status", "active");

      if (!flocks?.length) continue;

      // Get mortality logs for last 8 days
      const { data: mortality } = await supabase
        .from("mortality_logs")
        .select("flock_id, count, date")
        .eq("farm_id", farm.id)
        .gte("date", sevenDaysAgo)
        .lte("date", today);

      if (!mortality?.length) continue;

      const alerts: AlertResult[] = [];

      for (const flock of flocks) {
        const flockMortality = mortality.filter((m: any) => m.flock_id === flock.id);
        if (!flockMortality.length) continue;

        const todayDeaths = flockMortality
          .filter((m: any) => m.date === today)
          .reduce((s: number, m: any) => s + m.count, 0);

        if (todayDeaths < MIN_DEATHS_TO_ALERT) continue;

        // 7-day average excluding today
        const prevDeaths = flockMortality
          .filter((m: any) => m.date >= sevenDaysAgo && m.date < today)
          .reduce((s: number, m: any) => s + m.count, 0);
        const avgDailyDeaths = prevDeaths / 7;

        // Only alert if meaningful spike vs baseline
        if (avgDailyDeaths < 0.5) {
          // No baseline — alert if deaths > 1% of flock in one day
          const flockSize = flock.current_count || 100;
          if (todayDeaths / flockSize < 0.01) continue;
        } else {
          const ratio = todayDeaths / avgDailyDeaths;
          if (ratio < SPIKE_THRESHOLD) continue;

          const likelyCauses = getLikelyCauses(flock.type, todayDeaths, avgDailyDeaths);

          alerts.push({
            farm_id: farm.id,
            farm_name: farm.name,
            flock_name: flock.name,
            today_deaths: todayDeaths,
            avg_daily_deaths: avgDailyDeaths,
            spike_ratio: ratio,
            likely_causes: likelyCauses,
          });
        }
      }

      if (!alerts.length) continue;

      // Save alerts to DB
      for (const alert of alerts) {
        await supabase.from("mortality_spike_alerts").insert({
          farm_id: farm.id,
          flock_name: alert.flock_name,
          today_deaths: alert.today_deaths,
          avg_daily_deaths: alert.avg_daily_deaths,
          spike_ratio: alert.spike_ratio,
          likely_causes: alert.likely_causes,
          alert_date: today,
          acknowledged: false,
        });
      }

      // Get farm owner email
      const { data: owner } = await supabase
        .from("farm_members")
        .select("profiles(email)")
        .eq("farm_id", farm.id)
        .eq("role", "owner")
        .eq("is_active", true)
        .maybeSingle();

      const ownerEmail = (owner as any)?.profiles?.email;
      if (ownerEmail) {
        await sendAlertEmail(ownerEmail, farm.name, alerts);
      }

      totalAlerts += alerts.length;
    }

    return new Response(JSON.stringify({ ok: true, alerts_sent: totalAlerts, farms_checked: farms.length }));
  } catch (err) {
    console.error("mortality-alerts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function getLikelyCauses(flockType: string, todayDeaths: number, avgDeaths: number): string[] {
  const causes = [];
  const ratio = avgDeaths > 0 ? todayDeaths / avgDeaths : 10;

  if (ratio >= 5) {
    causes.push("Newcastle disease", "Avian Influenza (rule out first)", "Acute poisoning");
  } else if (ratio >= 3) {
    causes.push("Gumboro/IBD", "Fowl Typhoid", "Heat stress", "Water contamination");
  } else {
    causes.push("Coccidiosis", "CRD/Mycoplasma", "Overcrowding stress", "Feed quality issue");
  }

  return causes;
}
