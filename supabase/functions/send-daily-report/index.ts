import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Edentrack Reports <reports@edentrack.app>";

interface ReportData {
  farmName: string;
  date: string;
  currency: string;
  flocks: any[];
  tasks: any[];
  birdSales: any[];
  eggSales: any[];
  expenses: any[];
  inventory: any[];
  eggInventory: any;
  eggCollections: any[];
  mortalityLogs: any[];
  feedUsage: any[];
  vaccinations: any[];
  weightLogs: any[];
  inventoryMovements: any[];
  revenues: any[];
  prevWeekBirdSales: any[];
  prevWeekEggSales: any[];
  prevWeekExpenses: any[];
  prevWeekMortality: any[];
  upcomingVaccinations: any[];
  monthBirdSales: any[];
  monthEggSales: any[];
  monthExpenses: any[];
}

async function generateDailyReport(
  supabase: any,
  farmId: string,
  farmName: string,
  currency = "CFA"
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().split("T")[0];
  const weekStart = new Date(new Date(today).getTime() - 6 * 86400000).toISOString().split("T")[0];
  const prevWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86400000).toISOString().split("T")[0];
  const nextWeekEnd = new Date(new Date(today).getTime() + 8 * 86400000).toISOString().split("T")[0];
  const monthStart = today.substring(0, 8) + "01";

  try {
    const [
      flocksData, tasksData, birdSalesData, eggSalesData, expensesData,
      inventoryData, eggInventoryData, eggCollectionsData, mortalityData,
      feedUsageData, vaccinationsData, weightLogsData, revenuesData,
      prevBirdSalesData, prevEggSalesData, prevExpensesData, prevMortalityData,
      upcomingVacsData, monthBirdSalesData, monthEggSalesData, monthExpensesData,
    ] = await Promise.all([
      supabase.from("flocks").select("*").eq("farm_id", farmId).eq("status", "active"),
      supabase.from("tasks").select("*, task_templates(title, category)").eq("farm_id", farmId).gte("created_at", weekStart).lt("created_at", tomorrow),
      supabase.from("bird_sales").select("*").eq("farm_id", farmId).gte("sale_date", weekStart).lt("sale_date", tomorrow),
      supabase.from("egg_sales").select("*").eq("farm_id", farmId).gte("sale_date", weekStart).lt("sale_date", tomorrow),
      supabase.from("expenses").select("*").eq("farm_id", farmId).gte("incurred_on", weekStart).lt("incurred_on", tomorrow),
      supabase.from("feed_stock").select("*").eq("farm_id", farmId).order("feed_type"),
      supabase.from("egg_inventory").select("*").eq("farm_id", farmId).maybeSingle(),
      supabase.from("egg_collections").select("*, flocks(name)").eq("farm_id", farmId).gte("collected_on", weekStart).lt("collected_on", tomorrow),
      supabase.from("mortality_logs").select("*, flocks(name)").eq("farm_id", farmId).gte("event_date", weekStart).lt("event_date", tomorrow),
      supabase.from("inventory_usage").select("*, feed_types(name, unit)").eq("farm_id", farmId).gte("usage_date", weekStart).lt("usage_date", tomorrow),
      supabase.from("vaccinations").select("*, flocks(name)").eq("farm_id", farmId).gte("scheduled_date", weekStart).lt("scheduled_date", tomorrow),
      supabase.from("weight_logs").select("*, flocks(name)").eq("farm_id", farmId).gte("date", weekStart).lt("date", tomorrow),
      supabase.from("revenues").select("*, flocks(name)").eq("farm_id", farmId).gte("revenue_date", weekStart).lt("revenue_date", tomorrow),
      // Previous week for week-over-week comparison
      supabase.from("bird_sales").select("*").eq("farm_id", farmId).gte("sale_date", prevWeekStart).lt("sale_date", weekStart),
      supabase.from("egg_sales").select("*").eq("farm_id", farmId).gte("sale_date", prevWeekStart).lt("sale_date", weekStart),
      supabase.from("expenses").select("*").eq("farm_id", farmId).gte("incurred_on", prevWeekStart).lt("incurred_on", weekStart),
      supabase.from("mortality_logs").select("*").eq("farm_id", farmId).gte("event_date", prevWeekStart).lt("event_date", weekStart),
      // Upcoming vaccinations (next 7 days)
      supabase.from("vaccinations").select("*, flocks(name)").eq("farm_id", farmId).gt("scheduled_date", today).lte("scheduled_date", nextWeekEnd).order("scheduled_date"),
      // Month-to-date
      supabase.from("bird_sales").select("*").eq("farm_id", farmId).gte("sale_date", monthStart).lt("sale_date", tomorrow),
      supabase.from("egg_sales").select("*").eq("farm_id", farmId).gte("sale_date", monthStart).lt("sale_date", tomorrow),
      supabase.from("expenses").select("*").eq("farm_id", farmId).gte("incurred_on", monthStart).lt("incurred_on", tomorrow),
    ]);

    const data: ReportData = {
      farmName,
      date: `${weekStart} – ${today}`,
      currency,
      flocks: flocksData.data || [],
      tasks: tasksData.data || [],
      birdSales: birdSalesData.data || [],
      eggSales: eggSalesData.data || [],
      expenses: expensesData.data || [],
      inventory: inventoryData.data || [],
      eggInventory: eggInventoryData.data,
      eggCollections: eggCollectionsData.data || [],
      mortalityLogs: mortalityData.data || [],
      feedUsage: feedUsageData.data || [],
      vaccinations: vaccinationsData.data || [],
      weightLogs: weightLogsData.data || [],
      inventoryMovements: await (async () => {
        const { data, error } = await supabase.from("other_inventory_movements").select("*, other_inventory_items(item_name, category)").eq("farm_id", farmId);
        if (error) return [];
        return data || [];
      })().catch(() => []),
      revenues: revenuesData.data || [],
      prevWeekBirdSales: prevBirdSalesData.data || [],
      prevWeekEggSales: prevEggSalesData.data || [],
      prevWeekExpenses: prevExpensesData.data || [],
      prevWeekMortality: prevMortalityData.data || [],
      upcomingVaccinations: upcomingVacsData.data || [],
      monthBirdSales: monthBirdSalesData.data || [],
      monthEggSales: monthEggSalesData.data || [],
      monthExpenses: monthExpensesData.data || [],
    };

    return formatDailyReport(data);
  } catch (error) {
    console.error("Error generating daily report:", error);
    throw new Error("Failed to generate daily report");
  }
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? " (new this week)" : "";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return curr >= prev ? ` +${pct}% vs last week` : ` ${pct}% vs last week`;
}

function formatDailyReport(data: ReportData): string {
  const lines: string[] = [];
  const {
    farmName, date, currency, flocks, tasks, birdSales, eggSales, expenses, inventory,
    eggInventory, eggCollections, mortalityLogs, feedUsage, vaccinations,
    weightLogs, revenues, prevWeekBirdSales, prevWeekEggSales, prevWeekExpenses,
    prevWeekMortality, upcomingVaccinations, monthBirdSales, monthEggSales, monthExpenses,
  } = data;

  const [startDateStr, endDateStr] = date.split(" – ");
  const formatShort = (d: string) => {
    const dt = new Date(d + "T00:00:00Z");
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  };
  const yearStr = new Date(endDateStr + "T00:00:00Z").getUTCFullYear();
  const dateRange = `${formatShort(startDateStr)} – ${formatShort(endDateStr)}, ${yearStr}`;

  lines.push("📊 WEEKLY FARM REPORT");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`📅 Week: ${dateRange}`);
  lines.push(`🏢 Farm: ${farmName}`);
  lines.push("");

  // Pre-calculate key metrics
  const mortalityByFlock: Record<string, number> = mortalityLogs.reduce(
    (acc: Record<string, number>, log: any) => { acc[log.flock_id] = (acc[log.flock_id] || 0) + log.count; return acc; }, {}
  );
  const eggsByFlock: Record<string, number> = eggCollections.reduce(
    (acc: Record<string, number>, c: any) => { acc[c.flock_id] = (acc[c.flock_id] || 0) + (c.total_eggs || 0); return acc; }, {}
  );
  const totalBirds = flocks.reduce((sum: number, f: any) => sum + (f.current_count || 0), 0);
  const totalDeaths = Object.values(mortalityByFlock).reduce((sum: number, c: any) => sum + c, 0);
  const mortalityRate = totalBirds > 0 ? ((totalDeaths / totalBirds) * 100).toFixed(1) : "0.0";
  const prevTotalDeaths = prevWeekMortality.reduce((sum: number, m: any) => sum + (m.count || 0), 0);
  const completedTasks = tasks.filter((t: any) => t.status === "completed");
  const pendingTasks = tasks.filter((t: any) => t.status === "pending");
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  // 1. HEALTH ALERT — top of report if mortality > 2%
  if (parseFloat(mortalityRate) > 2) {
    lines.push("🚨 HEALTH ALERT");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push(`⚠️ Mortality rate is ${mortalityRate}% — above the 2% safe threshold`);
    lines.push(`   ${totalDeaths} birds died this week (vs ${prevTotalDeaths} last week). Investigate immediately.`);
    lines.push("");
  }

  // FLOCK SUMMARY
  lines.push("🐔 FLOCK SUMMARY");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`Total Birds: ${totalBirds.toLocaleString()} across ${flocks.length} active flock${flocks.length !== 1 ? "s" : ""}`);
  lines.push(`Mortality This Week: ${totalDeaths} birds (${mortalityRate}%)`);
  lines.push("");

  // Per-flock details with FCR and days-to-sale
  if (flocks.length > 0) {
    lines.push("Flock Details:");
    const totalFeedKgThisWeek = feedUsage.reduce((sum: number, f: any) => sum + (Number(f.quantity_used) || 0), 0);
    const broilerFlockCount = flocks.filter((f: any) =>
      f.purpose?.toLowerCase().includes("broil") || f.type?.toLowerCase().includes("broil")
    ).length;

    flocks.forEach((flock: any) => {
      const isBroiler = flock.purpose?.toLowerCase().includes("broil") || flock.type?.toLowerCase().includes("broil");
      const isLayer = flock.purpose?.toLowerCase().includes("lay") || flock.type?.toLowerCase().includes("lay");
      const arrivalDate = new Date((flock.arrival_date || flock.created_at) + "T00:00:00Z");
      const ageInDays = Math.max(0, Math.floor((Date.now() - arrivalDate.getTime()) / 86400000));
      const ageInWeeks = Math.max(1, Math.floor(ageInDays / 7));
      const deathsThisWeek = mortalityByFlock[flock.id] || 0;
      const eggsThisWeek = eggsByFlock[flock.id] || 0;
      const survivalRate = flock.initial_count > 0
        ? ((flock.current_count / flock.initial_count) * 100).toFixed(1) : "100.0";

      lines.push(`• ${flock.name} (${flock.purpose || flock.type || "Unknown"})`);
      lines.push(`  → ${flock.current_count.toLocaleString()} birds | Age: ${ageInWeeks}w (${ageInDays}d) | Survival: ${survivalRate}%`);

      if (deathsThisWeek > 0) {
        lines.push(`  → Deaths this week: ${deathsThisWeek}`);
        const causes = mortalityLogs
          .filter((m: any) => m.flock_id === flock.id)
          .map((m: any) => m.cause).filter(Boolean);
        if (causes.length) lines.push(`  → Causes: ${[...new Set(causes)].join(", ")}`);
      }

      if (isLayer && eggsThisWeek > 0) {
        const dailyProdRate = flock.current_count > 0
          ? ((eggsThisWeek / (flock.current_count * 7)) * 100).toFixed(1) : "0.0";
        lines.push(`  → Eggs this week: ${eggsThisWeek.toLocaleString()} (avg ${dailyProdRate}%/day production rate)`);
      }

      // 2. FCR + days-to-sale for broilers
      if (isBroiler) {
        const flockWeightLogs = weightLogs.filter((w: any) => w.flock_id === flock.id);
        if (flockWeightLogs.length > 0) {
          const latest = flockWeightLogs[flockWeightLogs.length - 1];
          const avgWeight = Number(latest.average_weight) || 0;
          lines.push(`  → Avg weight: ${avgWeight.toFixed(2)} kg`);

          const TARGET_KG = 2.0;
          const dailyGain = ageInDays > 7 ? (avgWeight - 0.04) / ageInDays : 0;

          if (avgWeight >= TARGET_KG) {
            lines.push(`  → ✅ Ready to sell! Target weight reached (${avgWeight.toFixed(2)} kg)`);
          } else if (dailyGain > 0) {
            const daysLeft = Math.ceil((TARGET_KG - avgWeight) / dailyGain);
            const saleDate = new Date(Date.now() + daysLeft * 86400000);
            const saleDateStr = saleDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
            lines.push(`  → Est. ${daysLeft} days to market weight (~${saleDateStr})`);
          }

          // FCR = feed consumed / weight gained this week
          const flockFeedKg = broilerFlockCount > 0 ? totalFeedKgThisWeek / broilerFlockCount : 0;
          const weeklyWeightGain = dailyGain * 7 * flock.current_count;
          if (flockFeedKg > 0 && weeklyWeightGain > 0) {
            const fcr = (flockFeedKg / weeklyWeightGain).toFixed(2);
            lines.push(`  → FCR (est.): ${fcr} ${parseFloat(fcr) < 2.0 ? "✅ excellent" : parseFloat(fcr) < 2.5 ? "👍 good" : "⚠️ above target"} (target <2.0)`);
          }
        }
        if (ageInWeeks >= 6) {
          lines.push(`  → ⚠️ ${ageInWeeks} weeks old — assess for sale`);
        }
      }
    });
    lines.push("");
  }

  // TASKS
  if (tasks.length > 0) {
    lines.push(`✅ TASKS (${completedTasks.length}/${tasks.length} — ${completionRate}%)`);
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (pendingTasks.length > 0) {
      pendingTasks.slice(0, 5).forEach((t: any) =>
        lines.push(`✗ ${t.title_override || t.task_templates?.title || t.title || "Task"}`)
      );
      if (pendingTasks.length > 5) lines.push(`... and ${pendingTasks.length - 5} more pending`);
    } else {
      lines.push("All tasks completed this week ✓");
    }
    lines.push("");
  }

  // 3. FINANCIAL SUMMARY with week-over-week + revenue per bird + month-to-date
  const totalBirdRevenue = birdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const totalEggRevenue = eggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const otherRevenue = revenues
    .filter((r: any) => r.source_type !== "egg_sale" && r.source_type !== "bird_sale")
    .reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const totalRevenue = totalBirdRevenue + totalEggRevenue + otherRevenue;
  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const net = totalRevenue - totalExpenses;

  const prevBirdRev = prevWeekBirdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const prevEggRev = prevWeekEggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const prevRevenue = prevBirdRev + prevEggRev;
  const prevExpensesTotal = prevWeekExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const prevNet = prevRevenue - prevExpensesTotal;

  const monthBirdRev = monthBirdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const monthEggRev = monthEggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const totalMonthRevenue = monthBirdRev + monthEggRev;
  const totalMonthExpenses = monthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
  const monthNet = totalMonthRevenue - totalMonthExpenses;

  if (totalRevenue > 0 || totalExpenses > 0) {
    lines.push("💰 FINANCIAL SUMMARY");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    lines.push("This Week:");

    if (totalBirdRevenue > 0) {
      const birdCount = birdSales.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      // 5. Revenue per bird
      const revenuePerBird = birdCount > 0 ? Math.round(totalBirdRevenue / birdCount) : 0;
      lines.push(`  🐔 Bird sales: ${totalBirdRevenue.toLocaleString()} ${currency}`);
      if (birdCount > 0) lines.push(`     ${birdCount} birds sold @ avg ${revenuePerBird.toLocaleString()} ${currency}/bird`);
    }
    if (totalEggRevenue > 0) {
      const totalEggsSold = eggSales.reduce((sum: number, s: any) =>
        sum + (s.small_eggs_sold || 0) + (s.medium_eggs_sold || 0) + (s.large_eggs_sold || 0) + (s.jumbo_eggs_sold || 0), 0);
      const revenuePerTray = totalEggsSold > 0 ? Math.round((totalEggRevenue / totalEggsSold) * 30) : 0;
      lines.push(`  🥚 Egg sales: ${totalEggRevenue.toLocaleString()} ${currency}`);
      if (totalEggsSold > 0) lines.push(`     ${totalEggsSold} eggs (${(totalEggsSold / 30).toFixed(1)} trays) @ avg ${revenuePerTray.toLocaleString()} ${currency}/tray`);
    }
    if (otherRevenue > 0) lines.push(`  💵 Other revenue: ${otherRevenue.toLocaleString()} ${currency}`);

    // 4. Week-over-week comparison
    lines.push(`  📥 Total Revenue: ${totalRevenue.toLocaleString()} ${currency}${pctChange(totalRevenue, prevRevenue)}`);

    if (totalExpenses > 0) {
      const expByCategory = expenses.reduce((acc: Record<string, number>, e: any) => {
        const cat = e.category || "Other";
        acc[cat] = (acc[cat] || 0) + (e.amount || 0);
        return acc;
      }, {});
      lines.push(`  📤 Expenses: ${totalExpenses.toLocaleString()} ${currency}${pctChange(totalExpenses, prevExpensesTotal)}`);
      Object.entries(expByCategory).forEach(([cat, amt]) =>
        lines.push(`     · ${cat}: ${(amt as number).toLocaleString()} ${currency}`)
      );
    }

    const netSign = net >= 0 ? "+" : "";
    lines.push(`  ${net >= 0 ? "📈" : "📉"} Net: ${netSign}${net.toLocaleString()} ${currency}${pctChange(net, prevNet)}`);
    lines.push("");

    // 6. Month-to-date
    if (totalMonthRevenue > 0 || totalMonthExpenses > 0) {
      lines.push("Month-to-Date:");
      lines.push(`  💵 Revenue: ${totalMonthRevenue.toLocaleString()} ${currency}`);
      lines.push(`  💸 Expenses: ${totalMonthExpenses.toLocaleString()} ${currency}`);
      const mtdSign = monthNet >= 0 ? "+" : "";
      lines.push(`  ${monthNet >= 0 ? "📈" : "📉"} Net: ${mtdSign}${monthNet.toLocaleString()} ${currency}`);
      lines.push("");
    }
  }

  // INVENTORY STATUS
  if (inventory.length > 0) {
    const CRITICAL = 2, LOW = 5;
    const emptyItems = inventory.filter((i: any) => Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0) <= 0);
    const critItems = inventory.filter((i: any) => { const b = Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0); return b > 0 && b <= CRITICAL; });
    const lowItems = inventory.filter((i: any) => { const b = Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0); return b > CRITICAL && b <= LOW; });
    const okItems = inventory.filter((i: any) => Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0) > LOW);

    lines.push("📦 INVENTORY STATUS");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    emptyItems.forEach((i: any) => lines.push(`🔴 ${i.feed_type}: OUT OF STOCK`));
    critItems.forEach((i: any) => { const b = Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0); lines.push(`⚠️ ${i.feed_type}: ${b} bag${b !== 1 ? "s" : ""} — order now`); });
    lowItems.forEach((i: any) => { const b = Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0); lines.push(`🟡 ${i.feed_type}: ${b} bags — order this week`); });
    okItems.forEach((i: any) => { const b = Number(i.current_stock_bags || i.bags_in_stock || i.current_quantity || 0); lines.push(`✅ ${i.feed_type}: ${b} bags`); });
    lines.push("");
  }

  // VACCINATIONS THIS WEEK
  if (vaccinations.length > 0) {
    lines.push("💉 VACCINATIONS THIS WEEK");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    vaccinations.forEach((v: any) => {
      lines.push(`• ${v.vaccine_name || "Vaccination"} — ${v.flocks?.name || "Unknown flock"}`);
      if (v.dosage) lines.push(`  → Dosage: ${v.dosage}`);
    });
    lines.push("");
  }

  // 7. UPCOMING VACCINATIONS
  if (upcomingVaccinations.length > 0) {
    lines.push("💉 UPCOMING VACCINATIONS (Next 7 Days)");
    lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    upcomingVaccinations.forEach((v: any) =>
      lines.push(`• ${v.scheduled_date}: ${v.vaccine_name || "Vaccination"} — ${v.flocks?.name || "Unknown flock"}`)
    );
    lines.push("");
  }

  // EGG INVENTORY
  if (eggInventory) {
    const totalEggs = (eggInventory.small_eggs || 0) + (eggInventory.medium_eggs || 0) +
      (eggInventory.large_eggs || 0) + (eggInventory.jumbo_eggs || 0);
    if (totalEggs > 0) {
      lines.push("🥚 EGG INVENTORY");
      lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      if (eggInventory.small_eggs > 0) lines.push(`• Small: ${eggInventory.small_eggs}`);
      if (eggInventory.medium_eggs > 0) lines.push(`• Medium: ${eggInventory.medium_eggs}`);
      if (eggInventory.large_eggs > 0) lines.push(`• Large: ${eggInventory.large_eggs}`);
      if (eggInventory.jumbo_eggs > 0) lines.push(`• Jumbo: ${eggInventory.jumbo_eggs}`);
      lines.push(`📊 Total: ${totalEggs.toLocaleString()} eggs in stock`);
      lines.push("");
    }
  }

  // FARM HEALTH
  const healthStatus = parseFloat(mortalityRate) < 2 && completionRate >= 70 ? "EXCELLENT ✨"
    : parseFloat(mortalityRate) < 3 && completionRate >= 50 ? "GOOD 👍"
    : "NEEDS ATTENTION ⚠️";
  const totalInitialBirds = flocks.reduce((sum: number, f: any) => sum + (f.initial_count || 0), 0);
  const survivalOverall = totalInitialBirds > 0 ? ((totalBirds / totalInitialBirds) * 100).toFixed(1) : "100.0";

  lines.push("📊 FARM HEALTH");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`Overall: ${healthStatus}`);
  lines.push(`📉 Mortality Rate: ${mortalityRate}% (target: <2%)${pctChange(totalDeaths, prevTotalDeaths)}`);
  if (tasks.length > 0) lines.push(`✅ Task Completion: ${completionRate}%`);
  lines.push(`📊 Overall Survival Rate: ${survivalOverall}%`);
  lines.push("");

  // RECOMMENDATIONS
  lines.push("💡 RECOMMENDATIONS");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const recs: string[] = [];

  if (parseFloat(mortalityRate) > 2) recs.push(`• Investigate mortality (${mortalityRate}% — above 2% threshold)`);
  if (pendingTasks.length > 0) recs.push(`• Complete ${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""}`);
  inventory.forEach((item: any) => {
    const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
    if (bags <= 0) recs.push(`• Order ${item.feed_type} urgently — out of stock`);
    else if (bags <= 2) recs.push(`• Order ${item.feed_type} now (${bags} bag${bags !== 1 ? "s" : ""} left)`);
  });
  flocks.forEach((flock: any) => {
    const ageInDays = Math.max(0, Math.floor((Date.now() - new Date((flock.arrival_date || flock.created_at) + "T00:00:00Z").getTime()) / 86400000));
    const isBroiler = flock.purpose?.toLowerCase().includes("broil") || flock.type?.toLowerCase().includes("broil");
    if (isBroiler && Math.floor(ageInDays / 7) >= 6) recs.push(`• ${flock.name} is ${Math.floor(ageInDays / 7)} weeks old — assess for sale`);
  });
  if (upcomingVaccinations.length > 0) recs.push(`• Prepare for ${upcomingVaccinations.length} vaccination${upcomingVaccinations.length > 1 ? "s" : ""} due next week`);
  if (completionRate < 70 && tasks.length > 0) recs.push(`• Improve task completion (currently ${completionRate}%)`);

  if (recs.length > 0) recs.forEach((r) => lines.push(r));
  else lines.push("• Farm is healthy — keep up the great work! 🎉");
  lines.push("");

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("Powered by EDENTRACK 🐔");
  lines.push("Professional Farm Management");

  return lines.join("\n");
}

function buildEmailHtml(farmName: string, reportText: string, date: string): string {
  // Split into sections on separator lines, preserving section title as first non-empty line
  const rawSections = reportText.split(/\n?━+\n?/);

  function lineColor(line: string): string {
    if (/🔴|OUT OF STOCK|CRITICAL/.test(line)) return "#dc2626";
    if (/⚠️|❌|PENDING|📉/.test(line)) return "#d97706";
    if (/✅|✓|EXCELLENT|📈/.test(line)) return "#16a34a";
    if (/→/.test(line)) return "#6b7280";
    return "#374151";
  }

  function sectionBorderColor(title: string): string {
    if (/💰|💵|📈/.test(title)) return "#3b82f6";
    if (/💸|📉/.test(title)) return "#f59e0b";
    if (/🔴|⚠️|CRITICAL|PENDING/.test(title)) return "#ef4444";
    if (/✅|HEALTH|EXCELLENT/.test(title)) return "#22c55e";
    if (/🐔|FLOCK/.test(title)) return "#8b5cf6";
    if (/📦|INVENTORY/.test(title)) return "#0ea5e9";
    if (/💉|VACCINATION/.test(title)) return "#ec4899";
    if (/⚖️|WEIGHT/.test(title)) return "#64748b";
    return "#3D5F42";
  }

  const sectionCards = rawSections.map((section) => {
    const lines = section.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return "";

    const title = lines[0];
    const bodyLines = lines.slice(1);
    const border = sectionBorderColor(title);

    // Skip the plain header lines at top (WEEKLY FARM REPORT, 📅 Week, 🏢 Farm)
    if (!bodyLines.length) {
      return `<tr><td style="padding:4px 0 8px;font-size:14px;font-weight:600;color:#111827;">${title}</td></tr>`;
    }

    const bodyHtml = bodyLines.map((line) => {
      const indent = line.startsWith("    ") ? "24px" : line.startsWith("  ") ? "12px" : "0";
      const color = lineColor(line);
      const fw = line.match(/^[•🐔🥚🍗📦💉⚖️💰💸📈📉✅❌⚠️]/) ? "500" : "400";
      return `<div style="padding:2px 0 2px ${indent};font-size:13px;color:${color};font-weight:${fw};line-height:1.5;">${line}</div>`;
    }).join("");

    return `
      <tr><td style="padding:0 0 12px;">
        <table width="100%" cellpadding="12" cellspacing="0"
          style="border-left:4px solid ${border};background:#f9fafb;border-radius:0 6px 6px 0;">
          <tr><td style="padding:10px 14px;">
            <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:8px;">${title}</div>
            ${bodyHtml}
          </td></tr>
        </table>
      </td></tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f0;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
        style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#3D5F42 0%,#2F4A34 100%);padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;background:#ffe833;border-radius:9px;font-weight:900;font-size:20px;color:#1a1a1a;margin-bottom:10px;">E</div>
                  <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">EDENTRACK</div>
                  <div style="font-size:13px;color:#a7c5aa;margin-top:3px;">Weekly Farm Report</div>
                </td>
                <td align="right" style="vertical-align:top;padding-top:4px;">
                  <div style="font-size:12px;color:#a7c5aa;margin-bottom:4px;">${date}</div>
                  <div style="font-size:16px;font-weight:700;color:#ffffff;">${farmName}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${sectionCards}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:18px 28px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
              Weekly report for <strong style="color:#6b7280;">${farmName}</strong>.<br>
              Manage settings in the Edentrack app → Settings → Weekly Report.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  farmName: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.error("[EMAIL] RESEND_API_KEY is not set — email not sent.");
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const html = buildEmailHtml(farmName, body, date);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
      text: body,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[EMAIL] Resend error ${res.status}:`, errText);
    return { success: false, error: `Resend API error ${res.status}: ${errText}` };
  }

  const data = await res.json();
  console.log(`[EMAIL] Sent successfully to ${to}, id: ${data.id}`);
  return { success: true };
}

Deno.serve(async (_req: Request) => {
  console.log("[send-daily-report] Edge Function triggered");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get all farms due for daily report send
    const { data: farmsDue, error: queryError } = await supabase.rpc(
      "get_farms_due_for_daily_report"
    );

    if (queryError) {
      console.error("[send-daily-report] Error querying farms:", queryError);
      return new Response(
        JSON.stringify({
          error: "Failed to query farms",
          details: queryError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!farmsDue || farmsDue.length === 0) {
      console.log("[send-daily-report] No farms due for report send");
      return new Response(
        JSON.stringify({ message: "No farms due for daily report" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[send-daily-report] Processing ${farmsDue.length} farm(s) for daily report`
    );

    const results = [];

    for (const farm of farmsDue) {
      try {
        console.log(`[send-daily-report] Generating report for farm: ${farm.farm_id}`);

        // Fetch farm currency
        const { data: farmRow } = await supabase
          .from("farms")
          .select("currency_code, currency")
          .eq("id", farm.farm_id)
          .single();
        const farmCurrency = farmRow?.currency_code || farmRow?.currency || "CFA";

        // Generate daily report
        const reportText = await generateDailyReport(
          supabase,
          farm.farm_id,
          farm.farm_name,
          farmCurrency
        );

        const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

        // Send email via Resend
        const emailResult = await sendEmail(
          farm.owner_email,
          `Weekly Farm Report — ${farm.farm_name} — ${today}`,
          reportText,
          farm.farm_name,
          today
        );

        if (emailResult.success) {
          // Log successful send
          await supabase.rpc("log_report_send", {
            p_farm_id: farm.farm_id,
            p_status: "success",
            p_channel: "email",
          });

          results.push({
            farm_id: farm.farm_id,
            status: "success",
            email: farm.owner_email,
          });

          console.log(
            `[send-daily-report] Successfully sent report to ${farm.owner_email}`
          );
        } else {
          throw new Error(emailResult.error || "Unknown email error");
        }
      } catch (error: any) {
        console.error(`[send-daily-report] Error processing farm ${farm.farm_id}:`, error);

        // Log failed send
        await supabase.rpc("log_report_send", {
          p_farm_id: farm.farm_id,
          p_status: "failed",
          p_error_message: error.message,
          p_channel: "email",
        });

        results.push({
          farm_id: farm.farm_id,
          status: "failed",
          error: error.message,
        });
      }
    }

    console.log("[send-daily-report] Completed processing");

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[send-daily-report] Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Edge function error",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
