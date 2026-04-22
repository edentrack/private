import { supabase } from '../lib/supabaseClient';

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

export async function generateDailyReport(farmId: string, farmName: string, currency = 'CFA'): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0];
  const weekStart = new Date(new Date(today).getTime() - 6 * 86400000).toISOString().split('T')[0];
  const prevWeekStart = new Date(new Date(weekStart).getTime() - 7 * 86400000).toISOString().split('T')[0];
  const nextWeekEnd = new Date(new Date(today).getTime() + 8 * 86400000).toISOString().split('T')[0];
  const monthStart = today.substring(0, 8) + '01';

  try {
    const [
      flocksData, tasksData, birdSalesData, eggSalesData, expensesData,
      inventoryData, eggInventoryData, eggCollectionsData, mortalityData,
      feedUsageData, vaccinationsData, weightLogsData, revenuesData,
      prevBirdSalesData, prevEggSalesData, prevExpensesData, prevMortalityData,
      upcomingVacsData, monthBirdSalesData, monthEggSalesData, monthExpensesData,
    ] = await Promise.all([
      supabase.from('flocks').select('*').eq('farm_id', farmId).eq('status', 'active'),
      supabase.from('tasks').select('*, task_templates(title, category)').eq('farm_id', farmId).gte('created_at', weekStart).lt('created_at', tomorrow),
      supabase.from('bird_sales').select('*').eq('farm_id', farmId).gte('sale_date', weekStart).lt('sale_date', tomorrow),
      supabase.from('egg_sales').select('*').eq('farm_id', farmId).gte('sale_date', weekStart).lt('sale_date', tomorrow),
      supabase.from('expenses').select('*').eq('farm_id', farmId).gte('incurred_on', weekStart).lt('incurred_on', tomorrow),
      supabase.from('feed_stock').select('*').eq('farm_id', farmId).order('feed_type'),
      supabase.from('egg_inventory').select('*').eq('farm_id', farmId).maybeSingle(),
      supabase.from('egg_collections').select('*, flocks(name)').eq('farm_id', farmId).gte('collected_on', weekStart).lt('collected_on', tomorrow),
      supabase.from('mortality_logs').select('*, flocks(name)').eq('farm_id', farmId).gte('event_date', weekStart).lt('event_date', tomorrow),
      supabase.from('inventory_usage').select('*, feed_types(name, unit)').eq('farm_id', farmId).gte('usage_date', weekStart).lt('usage_date', tomorrow),
      supabase.from('vaccinations').select('*, flocks(name)').eq('farm_id', farmId).gte('scheduled_date', weekStart).lt('scheduled_date', tomorrow),
      supabase.from('weight_logs').select('*, flocks(name)').eq('farm_id', farmId).gte('date', weekStart).lt('date', tomorrow),
      supabase.from('revenues').select('*, flocks(name)').eq('farm_id', farmId).gte('revenue_date', weekStart).lt('revenue_date', tomorrow),
      // Previous week
      supabase.from('bird_sales').select('*').eq('farm_id', farmId).gte('sale_date', prevWeekStart).lt('sale_date', weekStart),
      supabase.from('egg_sales').select('*').eq('farm_id', farmId).gte('sale_date', prevWeekStart).lt('sale_date', weekStart),
      supabase.from('expenses').select('*').eq('farm_id', farmId).gte('incurred_on', prevWeekStart).lt('incurred_on', weekStart),
      supabase.from('mortality_logs').select('*').eq('farm_id', farmId).gte('event_date', prevWeekStart).lt('event_date', weekStart),
      // Upcoming vaccinations
      supabase.from('vaccinations').select('*, flocks(name)').eq('farm_id', farmId).gt('scheduled_date', today).lte('scheduled_date', nextWeekEnd).order('scheduled_date'),
      // Month-to-date
      supabase.from('bird_sales').select('*').eq('farm_id', farmId).gte('sale_date', monthStart).lt('sale_date', tomorrow),
      supabase.from('egg_sales').select('*').eq('farm_id', farmId).gte('sale_date', monthStart).lt('sale_date', tomorrow),
      supabase.from('expenses').select('*').eq('farm_id', farmId).gte('incurred_on', monthStart).lt('incurred_on', tomorrow),
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
        const { data, error } = await supabase
          .from('other_inventory_movements')
          .select('*, other_inventory_items(item_name, category)')
          .eq('farm_id', farmId);
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
    console.error('Error generating daily report:', error);
    throw new Error('Failed to generate daily report');
  }
}

function pctChange(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? ' (new this week)' : '';
  const pct = Math.round(((curr - prev) / prev) * 100);
  return curr >= prev ? ` +${pct}% vs last week` : ` ${pct}% vs last week`;
}

function formatDailyReport(data: ReportData): string {
  const lines: string[] = [];
  const {
    farmName, date, currency, flocks, tasks, birdSales, eggSales, expenses, inventory,
    eggInventory, eggCollections, mortalityLogs, feedUsage, vaccinations,
    weightLogs, inventoryMovements, revenues, prevWeekBirdSales, prevWeekEggSales,
    prevWeekExpenses, prevWeekMortality, upcomingVaccinations, monthBirdSales,
    monthEggSales, monthExpenses,
  } = data;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  const formatTime = () => {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const mins = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${mins} ${ampm}`;
  };

  // date is "YYYY-MM-DD – YYYY-MM-DD" after the data fetching update
  const [startDateStr, endDateStr] = date.includes(' – ') ? date.split(' – ') : [date, date];
  const formatShortDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
  const displayDate = date.includes(' – ')
    ? `${formatShortDate(startDateStr)} – ${formatShortDate(endDateStr)}, ${new Date(endDateStr + 'T00:00:00').getFullYear()}`
    : formatDate(date);

  lines.push('📊 WEEKLY FARM REPORT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📅 Week: ${displayDate}`);
  lines.push(`🏢 Farm: ${farmName}`);
  lines.push('');

  const mortalityByFlock = mortalityLogs.reduce((acc: Record<string, number>, log: any) => {
    acc[log.flock_id] = (acc[log.flock_id] || 0) + log.count;
    return acc;
  }, {});

  const eggsByFlock = eggCollections.reduce((acc: Record<string, number>, collection: any) => {
    acc[collection.flock_id] = (acc[collection.flock_id] || 0) + (collection.total_eggs || 0);
    return acc;
  }, {});

  const totalBirds = flocks.reduce((sum: number, f: any) => sum + (f.current_count || 0), 0);
  const totalDeaths = Object.values(mortalityByFlock).reduce((sum: number, count: any) => sum + count, 0);
  const mortalityRate = totalBirds > 0 ? ((totalDeaths / totalBirds) * 100).toFixed(1) : '0.0';
  const prevTotalDeaths = prevWeekMortality.reduce((sum: number, m: any) => sum + (m.count || 0), 0);

  // 1. HEALTH ALERT — show at top if mortality > 2%
  if (parseFloat(mortalityRate) > 2) {
    lines.push('🚨 HEALTH ALERT');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`⚠️ Mortality rate is ${mortalityRate}% — above the 2% safe threshold`);
    lines.push(`   ${totalDeaths} birds died this week (vs ${prevTotalDeaths} last week). Investigate immediately.`);
    lines.push('');
  }

  lines.push('🐔 FLOCK SUMMARY');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Total Birds: ${totalBirds.toLocaleString()}`);
  lines.push(`Active Flocks: ${flocks.length}`);
  if (totalDeaths > 0) {
    lines.push(`Mortality Today: ${totalDeaths} birds (${mortalityRate}%)`);
  } else {
    lines.push('Mortality Today: 0 birds (0%)');
  }
  lines.push('');

  if (flocks.length > 0) {
    lines.push('Flock Details:');
    flocks.forEach((flock: any) => {
      const arrivalDate = new Date(flock.arrival_date || flock.created_at);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      arrivalDate.setHours(0, 0, 0, 0);
      const ageInDays = Math.floor((today.getTime() - arrivalDate.getTime()) / (24 * 60 * 60 * 1000));
      // Use Math.floor + 1 to get the current week (consistent with other calculations)
      const ageInWeeks = Math.max(1, Math.floor(ageInDays / 7) + 1);
      const deathsToday = mortalityByFlock[flock.id] || 0;
      const eggsToday = eggsByFlock[flock.id] || 0;
      const flockExpenses = expenses.filter(e => e.flock_id === flock.id);
      const totalFlockExpenses = flockExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      // Note: Feed usage is tracked at farm level, not per flock
      const totalFeedUsed = 0; // Will be shown in overall feed usage section
      const survivalRate = flock.initial_count > 0 
        ? (((flock.current_count / flock.initial_count) * 100)).toFixed(1)
        : '100.0';
      // Use initial_count: expenses were incurred for all birds started, not just survivors
      const costPerBird = flock.initial_count > 0
        ? (totalFlockExpenses / flock.initial_count).toFixed(0)
        : '0';

      lines.push(`• ${flock.name} (${flock.type || 'Unknown'})`);
      lines.push(`  → ${flock.current_count.toLocaleString()} birds | Age: ${ageInWeeks} weeks (${ageInDays} days)`);
      lines.push(`  → Initial: ${flock.initial_count?.toLocaleString() || 'N/A'} | Survival: ${survivalRate}%`);
      
      if (deathsToday > 0) {
        const alivePercent = flock.current_count > 0
          ? (((flock.current_count - deathsToday) / flock.current_count) * 100).toFixed(1)
          : '100.0';
        lines.push(`  → ${deathsToday} died today | ${(flock.current_count - deathsToday).toLocaleString()} alive (${alivePercent}%)`);
        const deathReasons = mortalityLogs
          .filter(m => m.flock_id === flock.id)
          .map(m => m.cause || 'Unknown')
          .join(', ');
        if (deathReasons) {
          lines.push(`  → Causes: ${deathReasons}`);
        }
      }

      if ((flock.type?.toLowerCase() === 'layer' || flock.purpose === 'layers') && eggsToday > 0) {
        const productionRate = flock.current_count > 0
          ? ((eggsToday / flock.current_count * 100) / 7).toFixed(1)
          : '0.0';
        lines.push(`  → Eggs: ${eggsToday.toLocaleString()} collected (avg ${productionRate}%/day production rate)`);
      }

      // 2. FCR + days-to-sale for broilers
      const isBroiler = flock.type?.toLowerCase().includes('broil') || flock.purpose?.toLowerCase().includes('broil');
      if (isBroiler) {
        const flockWeightLogs = weightLogs.filter((w: any) => w.flock_id === flock.id);
        if (flockWeightLogs.length > 0) {
          const latest = flockWeightLogs[flockWeightLogs.length - 1];
          const avgWeight = Number(latest.average_weight) || 0;
          const TARGET_KG = 2.0;
          const dailyGain = ageInDays > 7 ? (avgWeight - 0.04) / ageInDays : 0;

          if (avgWeight >= TARGET_KG) {
            lines.push(`  → ✅ Ready to sell! Avg weight ${avgWeight.toFixed(2)} kg (target 2.0 kg reached)`);
          } else if (dailyGain > 0) {
            const daysLeft = Math.ceil((TARGET_KG - avgWeight) / dailyGain);
            const saleDate = new Date(Date.now() + daysLeft * 86400000);
            const saleDateStr = saleDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            lines.push(`  → Avg weight: ${avgWeight.toFixed(2)} kg | Est. ${daysLeft} days to market (~${saleDateStr})`);
          } else {
            lines.push(`  → Avg weight: ${avgWeight.toFixed(2)} kg`);
          }

          // FCR estimate: total farm feed / total broiler weight gain this week
          const broilerCount = flocks.filter((fl: any) => fl.type?.toLowerCase().includes('broil') || fl.purpose?.toLowerCase().includes('broil')).length;
          const totalFeedKg = feedUsage.reduce((sum: number, f: any) => sum + (Number(f.quantity_used) || 0), 0);
          const flockFeedKg = broilerCount > 0 ? totalFeedKg / broilerCount : 0;
          const weeklyWeightGain = dailyGain * 7 * flock.current_count;
          if (flockFeedKg > 0 && weeklyWeightGain > 0) {
            const fcr = (flockFeedKg / weeklyWeightGain).toFixed(2);
            const fcrLabel = parseFloat(fcr) < 2.0 ? '✅ excellent' : parseFloat(fcr) < 2.5 ? '👍 good' : '⚠️ above target';
            lines.push(`  → FCR (est.): ${fcr} ${fcrLabel} (target <2.0)`);
          }
        }
        if (ageInWeeks >= 6) lines.push(`  → ⚠️ ${ageInWeeks} weeks old — assess for sale`);
      }

      if (totalFlockExpenses > 0) {
        lines.push(`  → Expenses Today: ${totalFlockExpenses.toLocaleString()} ${currency} (${costPerBird} ${currency}/bird)`);
      }
    });
    lines.push('');
  }

  const completedTasks = tasks.filter((t: any) => t.status === 'completed');
  const pendingTasks = tasks.filter((t: any) => t.status === 'pending');
  const taskCompletionRate = tasks.length > 0
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0;

  if (tasks.length > 0) {
    lines.push(`✅ TASKS COMPLETED (${completedTasks.length}/${tasks.length})`);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (completedTasks.length > 0) {
      completedTasks.slice(0, 8).forEach((task: any) => {
        const title = task.title_override || task.task_templates?.title || task.title || 'Task';
        lines.push(`✓ ${title}`);
      });
      if (completedTasks.length > 8) {
        lines.push(`... and ${completedTasks.length - 8} more`);
      }
    } else {
      lines.push('No tasks completed today');
    }
    lines.push('');

    if (pendingTasks.length > 0) {
      lines.push(`❌ PENDING TASKS (${pendingTasks.length})`);
      pendingTasks.slice(0, 5).forEach((task: any) => {
        const title = task.title_override || task.task_templates?.title || task.title || 'Task';
        lines.push(`✗ ${title}`);
      });
      if (pendingTasks.length > 5) {
        lines.push(`... and ${pendingTasks.length - 5} more`);
      }
      lines.push('');
    }
  }

  const totalBirdRevenue = birdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const totalEggRevenue = eggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const totalRevenue = totalBirdRevenue + totalEggRevenue;

  if (totalRevenue > 0) {
    lines.push('💰 SALES THIS WEEK');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (birdSales.length > 0) {
      const totalBirdCount = birdSales.reduce((sum: number, s: any) => sum + (s.quantity || 0), 0);
      // 5. Revenue per bird
      const revenuePerBird = totalBirdCount > 0 ? Math.round(totalBirdRevenue / totalBirdCount) : 0;
      lines.push('🐔 Bird Sales:');
      birdSales.forEach((sale: any) => {
        const pricePerBird = sale.quantity > 0 ? Math.round(sale.total_amount / sale.quantity) : 0;
        lines.push(`  → ${sale.quantity} birds sold @ ${pricePerBird.toLocaleString()} ${currency} each`);
        lines.push(`  → Total: ${sale.total_amount.toLocaleString()} ${currency}`);
        if (sale.customer_name) lines.push(`  → Customer: ${sale.customer_name}`);
      });
      if (totalBirdCount > 0) lines.push(`  → Avg revenue per bird: ${revenuePerBird.toLocaleString()} ${currency}`);
      lines.push('');
    }

    if (eggSales.length > 0) {
      const totalEggsSold = eggSales.reduce((sum: number, s: any) =>
        sum + (s.small_eggs_sold || 0) + (s.medium_eggs_sold || 0) + (s.large_eggs_sold || 0) + (s.jumbo_eggs_sold || 0), 0);
      const revenuePerTray = totalEggsSold > 0 ? Math.round((totalEggRevenue / totalEggsSold) * 30) : 0;
      const revenuePerEgg = totalEggsSold > 0 ? Math.round(totalEggRevenue / totalEggsSold) : 0;
      lines.push('🥚 Egg Sales:');
      eggSales.forEach((sale: any) => {
        const saleEggs = (sale.small_eggs_sold || 0) + (sale.medium_eggs_sold || 0) +
                         (sale.large_eggs_sold || 0) + (sale.jumbo_eggs_sold || 0);
        const trays = (saleEggs / 30).toFixed(1);
        lines.push(`  → ${saleEggs} eggs (${trays} trays) sold`);
        lines.push(`  → Total: ${sale.total_amount.toLocaleString()} ${currency}`);
        if (sale.customer_name) lines.push(`  → Customer: ${sale.customer_name}`);
      });
      if (totalEggsSold > 0) {
        lines.push(`  → Avg: ${revenuePerTray.toLocaleString()} ${currency}/tray | ${revenuePerEgg.toLocaleString()} ${currency}/egg`);
      }
      lines.push('');
    }

  // 4. Week-over-week comparison
  const prevBirdRev = prevWeekBirdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const prevEggRev = prevWeekEggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
  const prevRevenue = prevBirdRev + prevEggRev;
  const prevExpensesTotal = prevWeekExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    lines.push(`💵 Total Revenue: ${totalRevenue.toLocaleString()} ${currency}${pctChange(totalRevenue, prevRevenue)}`);
    lines.push('');
  }

  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  if (totalExpenses > 0) {
    lines.push('💸 EXPENSES THIS WEEK');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const expensesByCategory = expenses.reduce((acc: Record<string, number>, exp: any) => {
      const cat = exp.category || 'Other';
      acc[cat] = (acc[cat] || 0) + (exp.amount || 0);
      return acc;
    }, {});

    Object.entries(expensesByCategory).forEach(([category, amount]) => {
      const icon = category === 'feed' ? '🌾' :
                   category === 'medication' ? '💊' :
                   category === 'labor' ? '👷' :
                   category === 'utilities' ? '⚡' :
                   category === 'repairs' ? '🔧' : '💰';
      lines.push(`${icon} ${category}: ${amount.toLocaleString()} ${currency}`);
    });
    lines.push('');
    lines.push(`💵 Total Expenses: ${totalExpenses.toLocaleString()} ${currency}${pctChange(totalExpenses, prevExpensesTotal)}`);
    lines.push('');
  }

  const otherRevenue = revenues
    .filter(r => r.source_type !== 'egg_sale' && r.source_type !== 'bird_sale')
    .reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const totalRevenueWithOther = totalRevenue + otherRevenue;
  const prevNet = prevRevenue - prevExpensesTotal;

  if (totalRevenueWithOther > 0 || totalExpenses > 0) {
    const net = totalRevenueWithOther - totalExpenses;
    const sign = net >= 0 ? '+' : '';
    const emoji = net >= 0 ? '📈' : '📉';
    lines.push(`${emoji} Net This Week: ${sign}${net.toLocaleString()} ${currency}${pctChange(net, prevNet)}`);
    if (otherRevenue > 0) lines.push(`  → Includes ${otherRevenue.toLocaleString()} ${currency} from other revenue sources`);
    lines.push('');

    // 6. Month-to-date
    const monthBirdRev = monthBirdSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
    const monthEggRev = monthEggSales.reduce((sum: number, s: any) => sum + (s.total_amount || 0), 0);
    const totalMonthRevenue = monthBirdRev + monthEggRev;
    const totalMonthExpenses = monthExpenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    if (totalMonthRevenue > 0 || totalMonthExpenses > 0) {
      const monthNet = totalMonthRevenue - totalMonthExpenses;
      const mtdSign = monthNet >= 0 ? '+' : '';
      lines.push('📆 MONTH-TO-DATE');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`💵 Revenue: ${totalMonthRevenue.toLocaleString()} ${currency}`);
      lines.push(`💸 Expenses: ${totalMonthExpenses.toLocaleString()} ${currency}`);
      lines.push(`${monthNet >= 0 ? '📈' : '📉'} Net: ${mtdSign}${monthNet.toLocaleString()} ${currency}`);
      lines.push('');
    }
  }

  // Detailed Expense Breakdown by Flock
  if (expenses.length > 0) {
    const expensesByFlock = expenses.reduce((acc: Record<string, any[]>, exp: any) => {
      const flockId = exp.flock_id || 'unassigned';
      if (!acc[flockId]) acc[flockId] = [];
      acc[flockId].push(exp);
      return acc;
    }, {});

    const hasMultipleFlocks = Object.keys(expensesByFlock).length > 1;
    if (hasMultipleFlocks) {
      lines.push('💸 DETAILED EXPENSES BY FLOCK');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      Object.entries(expensesByFlock).forEach(([flockId, flockExpenses]) => {
        const flock = flocks.find(f => f.id === flockId);
        const flockName = flock?.name || 'Unassigned Expenses';
        const flockTotal = flockExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        lines.push(`• ${flockName}: ${flockTotal.toLocaleString()} ${currency}`);
        flockExpenses.slice(0, 5).forEach((exp: any) => {
          const icon = exp.category === 'feed' ? '🌾' :
                       exp.category === 'medication' ? '💊' :
                       exp.category === 'labor' ? '👷' :
                       exp.category === 'utilities' ? '⚡' :
                       exp.category === 'repairs' ? '🔧' : '💰';
          lines.push(`  ${icon} ${exp.category || 'Other'}: ${exp.amount?.toLocaleString() || '0'} ${currency}`);
          if (exp.description) {
            lines.push(`    → ${exp.description}`);
          }
        });
        if (flockExpenses.length > 5) {
          lines.push(`    ... and ${flockExpenses.length - 5} more expenses`);
        }
      });
      lines.push('');
    }
  }

  // Feed Usage Details
  if (feedUsage.length > 0) {
    lines.push('🌾 FEED USAGE THIS WEEK');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const feedByType = feedUsage.reduce((acc: Record<string, { quantity: number; unit: string }>, usage: any) => {
      const feedName = usage.feed_types?.name || 'Unknown Feed';
      const unit = usage.feed_types?.unit || 'bags';
      
      if (!acc[feedName]) {
        acc[feedName] = { quantity: 0, unit };
      }
      acc[feedName].quantity += Number(usage.quantity_used) || 0;
      
      return acc;
    }, {});

    Object.entries(feedByType).forEach(([feedName, data]) => {
      lines.push(`• ${feedName}: ${data.quantity.toLocaleString()} ${data.unit}`);
    });
    
    const totalFeedUsed = feedUsage.reduce((sum: number, f: any) => sum + (Number(f.quantity_used) || 0), 0);
    lines.push(`📊 Total Feed Used: ${totalFeedUsed.toLocaleString()} ${feedUsage[0]?.feed_types?.unit || 'bags'}`);
    lines.push('');
  }

  // Vaccination Records
  if (vaccinations.length > 0) {
    lines.push('💉 VACCINATIONS THIS WEEK');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    vaccinations.forEach((vacc: any) => {
      lines.push(`• ${vacc.vaccine_name || 'Vaccination'}`);
      lines.push(`  → Flock: ${vacc.flocks?.name || 'Unknown'}`);
      if (vacc.dosage) lines.push(`  → Dosage: ${vacc.dosage}`);
      if (vacc.notes) lines.push(`  → Notes: ${vacc.notes}`);
    });
    lines.push('');
  }

  // 7. Upcoming vaccinations (next 7 days)
  if (upcomingVaccinations.length > 0) {
    lines.push('💉 UPCOMING VACCINATIONS (Next 7 Days)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    upcomingVaccinations.forEach((vacc: any) => {
      lines.push(`• ${vacc.scheduled_date}: ${vacc.vaccine_name || 'Vaccination'} — ${vacc.flocks?.name || 'Unknown flock'}`);
    });
    lines.push('');
  }

  // Weight Tracking (Broilers)
  if (weightLogs.length > 0) {
    lines.push('⚖️ WEIGHT TRACKING (BROILERS)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const weightsByFlock = weightLogs.reduce((acc: Record<string, any[]>, log: any) => {
      const flockId = log.flock_id || 'unassigned';
      if (!acc[flockId]) acc[flockId] = [];
      acc[flockId].push(log);
      return acc;
    }, {});

    Object.entries(weightsByFlock).forEach(([flockId, logs]) => {
      const flock = flocks.find(f => f.id === flockId);
      const flockName = flock?.name || logs[0]?.flocks?.name || 'Unknown Flock';
      const avgWeight = logs.reduce((sum: number, l: any) => sum + (l.average_weight || 0), 0) / logs.length;
      const totalWeight = logs.reduce((sum: number, l: any) => sum + (l.total_weight || 0), 0);
      const birdsWeighed = logs.reduce((sum: number, l: any) => sum + (l.birds_weighed || 0), 0);
      
      lines.push(`• ${flockName}`);
      lines.push(`  → Average Weight: ${avgWeight.toFixed(2)} kg`);
      if (totalWeight > 0) {
        lines.push(`  → Total Weight: ${totalWeight.toFixed(2)} kg`);
      }
      if (birdsWeighed > 0) {
        lines.push(`  → Birds Weighed: ${birdsWeighed}`);
      }
    });
    lines.push('');
  }

  // Inventory Movements
  if (inventoryMovements.length > 0) {
    lines.push('📦 INVENTORY MOVEMENTS THIS WEEK');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const movementsByType = inventoryMovements.reduce((acc: Record<string, any[]>, mov: any) => {
      const type = mov.movement_type || 'unknown';
      if (!acc[type]) acc[type] = [];
      acc[type].push(mov);
      return acc;
    }, {});

    Object.entries(movementsByType).forEach(([type, movements]) => {
      const typeLabel = type === 'in' ? '📥 ADDED' : type === 'out' ? '📤 REMOVED' : '🔄 ADJUSTED';
      lines.push(`${typeLabel}:`);
      movements.forEach((mov: any) => {
        const itemName = mov.other_inventory_items?.item_name || 'Unknown Item';
        const category = mov.other_inventory_items?.category || '';
        lines.push(`  → ${itemName}${category ? ` (${category})` : ''}: ${mov.quantity} ${mov.unit || 'units'}`);
        if (mov.notes) lines.push(`    Notes: ${mov.notes}`);
      });
    });
    lines.push('');
  }

  if (inventory.length > 0) {
    // Use a sensible default threshold (5 bags) since minimum_quantity doesn't exist in feed_stock
    const DEFAULT_LOW_THRESHOLD = 5;
    const DEFAULT_CRITICAL_THRESHOLD = 2;
    
    const criticalItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags > 0 && bags <= DEFAULT_CRITICAL_THRESHOLD;
    });
    const lowItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags > DEFAULT_CRITICAL_THRESHOLD && bags <= DEFAULT_LOW_THRESHOLD;
    });
    const okItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags > DEFAULT_LOW_THRESHOLD;
    });
    const emptyItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags <= 0;
    });

    lines.push('📦 INVENTORY STATUS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (emptyItems.length > 0) {
      lines.push('🔴 OUT OF STOCK');
      emptyItems.forEach((item: any) => {
        const unit = item.unit || 'bags';
        lines.push(`• ${item.feed_type}: 0 ${unit} (OUT OF STOCK)`);
      });
      lines.push('');
    }

    if (criticalItems.length > 0) {
      lines.push('⚠️ CRITICAL (Order Now!)');
      criticalItems.forEach((item: any) => {
        const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
        const unit = item.unit || 'bags';
        lines.push(`• ${item.feed_type}: ${bags.toLocaleString()} ${unit} left`);
      });
      lines.push('');
    }

    if (lowItems.length > 0) {
      lines.push('🟡 LOW (Order This Week)');
      lowItems.forEach((item: any) => {
        const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
        const unit = item.unit || 'bags';
        lines.push(`• ${item.feed_type}: ${bags.toLocaleString()} ${unit} left`);
      });
      lines.push('');
    }

    if (okItems.length > 0) {
      lines.push('✅ GOOD STOCK LEVELS');
      okItems.forEach((item: any) => {
        const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
        const unit = item.unit || 'bags';
        lines.push(`• ${item.feed_type}: ${bags.toLocaleString()} ${unit}`);
      });
      lines.push('');
    }

    if (inventory.length === 0 || (criticalItems.length === 0 && lowItems.length === 0 && okItems.length === 0 && emptyItems.length === 0)) {
      lines.push('⚠️ No inventory data available');
      lines.push('');
    }
  }

  if (eggInventory) {
    const totalEggs = (eggInventory.small_eggs || 0) + (eggInventory.medium_eggs || 0) +
                     (eggInventory.large_eggs || 0) + (eggInventory.jumbo_eggs || 0);

    if (totalEggs > 0) {
      lines.push('🥚 EGG INVENTORY');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (eggInventory.small_eggs > 0) lines.push(`• Small: ${eggInventory.small_eggs} eggs`);
      if (eggInventory.medium_eggs > 0) lines.push(`• Medium: ${eggInventory.medium_eggs} eggs`);
      if (eggInventory.large_eggs > 0) lines.push(`• Large: ${eggInventory.large_eggs} eggs`);
      if (eggInventory.jumbo_eggs > 0) lines.push(`• Jumbo: ${eggInventory.jumbo_eggs} eggs`);
      lines.push(`📊 Total: ${totalEggs.toLocaleString()} eggs in stock`);
      lines.push('');
    }
  }

  // Production Metrics
  const layerFlocks = flocks.filter(f => f.type?.toLowerCase() === 'layer' || f.purpose === 'layers');
  const broilerFlocks = flocks.filter(f => f.type?.toLowerCase() === 'broiler' || f.purpose === 'broilers');
  
  if (layerFlocks.length > 0 || broilerFlocks.length > 0) {
    lines.push('📈 PRODUCTION METRICS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (layerFlocks.length > 0) {
      const totalLayerBirds = layerFlocks.reduce((sum, f) => sum + (f.current_count || 0), 0);
      const totalEggsCollected = eggCollections.reduce((sum, c) => sum + (c.total_eggs || (c.trays || 0) * 30), 0);
      const productionRate = totalLayerBirds > 0
        ? ((totalEggsCollected / totalLayerBirds) * 100).toFixed(1)
        : '0.0';

      lines.push(`🥚 Layer Production:`);
      lines.push(`  → Total Layer Birds: ${totalLayerBirds.toLocaleString()}`);
      lines.push(`  → Eggs Collected: ${totalEggsCollected.toLocaleString()} (${(totalEggsCollected / 30).toFixed(1)} trays)`);
      lines.push(`  → Production Rate: ${productionRate}%`);
    }
    
    if (broilerFlocks.length > 0) {
      const totalBroilerBirds = broilerFlocks.reduce((sum, f) => sum + (f.current_count || 0), 0);
      const avgWeight = weightLogs.length > 0
        ? (weightLogs.reduce((sum, w) => sum + (w.average_weight || 0), 0) / weightLogs.length).toFixed(2)
        : 'N/A';
      
      lines.push(`🍗 Broiler Production:`);
      lines.push(`  → Total Broiler Birds: ${totalBroilerBirds.toLocaleString()}`);
      if (avgWeight !== 'N/A') {
        lines.push(`  → Average Weight: ${avgWeight} kg`);
      }
    }
    lines.push('');
  }

  lines.push('📊 FARM HEALTH');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const healthStatus = parseFloat(mortalityRate) < 2 && taskCompletionRate >= 70 ? 'EXCELLENT ✨' :
                       parseFloat(mortalityRate) < 3 && taskCompletionRate >= 50 ? 'GOOD 👍' :
                       'NEEDS ATTENTION ⚠️';

  lines.push(`✅ Overall Health: ${healthStatus}`);
  lines.push(`📉 Mortality Rate: ${mortalityRate}% (target: <2%)${pctChange(totalDeaths, prevTotalDeaths)}`);
  if (tasks.length > 0) {
    lines.push(`✅ Task Completion: ${taskCompletionRate}%`);
  }

  if (pendingTasks.length > 0) {
    lines.push(`⚠️ Pending Actions: ${pendingTasks.length} task${pendingTasks.length > 1 ? 's' : ''}`);
  }

  // Calculate overall survival rate
  const totalInitialBirds = flocks.reduce((sum, f) => sum + (f.initial_count || 0), 0);
  const overallSurvivalRate = totalInitialBirds > 0
    ? ((totalBirds / totalInitialBirds) * 100).toFixed(1)
    : '100.0';
  lines.push(`📊 Overall Survival Rate: ${overallSurvivalRate}%`);
  lines.push('');

  lines.push('💡 RECOMMENDATIONS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const recommendations: string[] = [];

  if (inventory.length > 0) {
    const CRITICAL_BAGS = 2;
    const criticalItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags > 0 && bags <= CRITICAL_BAGS;
    });
    const emptyItems = inventory.filter((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      return bags <= 0;
    });
    emptyItems.forEach((item: any) => {
      recommendations.push(`• Order ${item.feed_type} URGENTLY — out of stock`);
    });
    criticalItems.forEach((item: any) => {
      const bags = Number(item.current_stock_bags || item.bags_in_stock || item.current_quantity || 0);
      recommendations.push(`• Order ${item.feed_type} NOW (only ${bags} bag${bags !== 1 ? 's' : ''} left)`);
    });
  }

  if (pendingTasks.length > 0) {
    recommendations.push(`• Complete ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}`);
  }

  flocks.forEach((flock: any) => {
    const ageInDays = Math.floor(
      (new Date().getTime() - new Date(flock.arrival_date).getTime()) / (24 * 60 * 60 * 1000)
    );
    const ageInWeeks = Math.floor(ageInDays / 7) + 1;

    if (flock.purpose === 'broilers' && ageInWeeks >= 6) {
      recommendations.push(`• ${flock.name} ready to sell (${ageInWeeks} weeks old)`);
    }
  });

  if (parseFloat(mortalityRate) > 2) {
    recommendations.push(`• Investigate high mortality rate (${mortalityRate}%)`);
  }

  if (upcomingVaccinations.length > 0) {
    recommendations.push(`• Prepare for ${upcomingVaccinations.length} vaccination${upcomingVaccinations.length > 1 ? 's' : ''} due next week`);
  }

  if (tasks.length > 0 && taskCompletionRate < 70) {
    recommendations.push(`• Improve task completion (currently ${taskCompletionRate}%)`);
  }

  if (recommendations.length > 0) {
    recommendations.forEach(rec => lines.push(rec));
  } else {
    lines.push('• Keep up the great work! Farm is healthy. 🎉');
  }
  lines.push('');

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`Generated: ${formatTime()}`);
  lines.push('Powered by EDENTRACK 🐔');
  lines.push('Professional Farm Management Worldwide');

  return lines.join('\n');
}
