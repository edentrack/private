import { supabase } from '../lib/supabaseClient';

interface ReportData {
  farmName: string;
  date: string;
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
}

export async function generateDailyReport(farmId: string, farmName: string): Promise<string> {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0];

  try {
    const [
      flocksData,
      tasksData,
      birdSalesData,
      eggSalesData,
      expensesData,
      inventoryData,
      eggInventoryData,
      eggCollectionsData,
      mortalityData,
      feedUsageData,
      vaccinationsData,
      weightLogsData,
      revenuesData,
    ] = await Promise.all([
      supabase
        .from('flocks')
        .select('*')
        .eq('farm_id', farmId)
        .eq('status', 'active'),

      supabase
        .from('tasks')
        .select('*, task_templates(title, category)')
        .eq('farm_id', farmId)
        .gte('created_at', today)
        .lt('created_at', tomorrow),

      supabase
        .from('bird_sales')
        .select('*')
        .eq('farm_id', farmId)
        .gte('sale_date', today)
        .lt('sale_date', tomorrow),

      supabase
        .from('egg_sales')
        .select('*')
        .eq('farm_id', farmId)
        .gte('sale_date', today)
        .lt('sale_date', tomorrow),

      supabase
        .from('expenses')
        .select('*')
        .eq('farm_id', farmId)
        .gte('incurred_on', today)
        .lt('incurred_on', tomorrow),

      supabase
        .from('feed_stock')
        .select('*')
        .eq('farm_id', farmId)
        .order('feed_type'),

      supabase
        .from('egg_inventory')
        .select('*')
        .eq('farm_id', farmId)
        .maybeSingle(),

      supabase
        .from('egg_collections')
        .select('*, flocks(name)')
        .eq('farm_id', farmId)
        .gte('collected_on', today)
        .lt('collected_on', tomorrow),

      supabase
        .from('mortality_logs')
        .select('*, flocks(name)')
        .eq('farm_id', farmId)
        .gte('event_date', today)
        .lt('event_date', tomorrow),

      supabase
        .from('inventory_usage')
        .select('*, feed_types(name, unit)')
        .eq('farm_id', farmId)
        .eq('usage_date', today),

      supabase
        .from('vaccinations')
        .select('*, flocks(name)')
        .eq('farm_id', farmId)
        .eq('scheduled_date', today),

      supabase
        .from('weight_logs')
        .select('*, flocks(name)')
        .eq('farm_id', farmId)
        .eq('date', today),

      supabase
        .from('revenues')
        .select('*, flocks(name)')
        .eq('farm_id', farmId)
        .gte('revenue_date', today)
        .lt('revenue_date', tomorrow),
    ]);

    const data: ReportData = {
      farmName,
      date: today,
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
    };

    return formatDailyReport(data);
  } catch (error) {
    console.error('Error generating daily report:', error);
    throw new Error('Failed to generate daily report');
  }
}

function formatDailyReport(data: ReportData): string {
  const lines: string[] = [];
  const { farmName, date, flocks, tasks, birdSales, eggSales, expenses, inventory, eggInventory, eggCollections, mortalityLogs, feedUsage, vaccinations, weightLogs, inventoryMovements, revenues } = data;

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

  lines.push('📊 DAILY FARM REPORT');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📅 Date: ${formatDate(date)}`);
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
      const costPerBird = flock.current_count > 0 
        ? (totalFlockExpenses / flock.current_count).toFixed(0)
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
          ? ((eggsToday / flock.current_count) * 100).toFixed(1)
          : '0.0';
        lines.push(`  → Eggs: ${eggsToday.toLocaleString()} collected (${productionRate}% production rate)`);
      }


      if (totalFlockExpenses > 0) {
        lines.push(`  → Expenses Today: ${totalFlockExpenses.toLocaleString()} CFA (${costPerBird} CFA/bird)`);
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
    lines.push('💰 SALES TODAY');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (birdSales.length > 0) {
      lines.push('🐔 Bird Sales:');
      birdSales.forEach((sale: any) => {
        const pricePerBird = sale.quantity > 0 ? (sale.total_amount / sale.quantity) : 0;
        lines.push(`  → ${sale.quantity} birds sold @ ${pricePerBird.toLocaleString()} CFA each`);
        lines.push(`  → Total: ${sale.total_amount.toLocaleString()} CFA`);
        if (sale.customer_name) {
          lines.push(`  → Customer: ${sale.customer_name}`);
        }
      });
      lines.push('');
    }

    if (eggSales.length > 0) {
      lines.push('🥚 Egg Sales:');
      eggSales.forEach((sale: any) => {
        const totalEggs = (sale.small_eggs_sold || 0) + (sale.medium_eggs_sold || 0) +
                         (sale.large_eggs_sold || 0) + (sale.jumbo_eggs_sold || 0);
        lines.push(`  → ${totalEggs} eggs sold`);
        lines.push(`  → Total: ${sale.total_amount.toLocaleString()} CFA`);
        if (sale.customer_name) {
          lines.push(`  → Customer: ${sale.customer_name}`);
        }
      });
      lines.push('');
    }

    lines.push(`💵 Total Revenue: ${totalRevenue.toLocaleString()} CFA`);
    lines.push('');
  }

  const totalExpenses = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  if (totalExpenses > 0) {
    lines.push('💸 EXPENSES TODAY');
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
      lines.push(`${icon} ${category}: ${amount.toLocaleString()} CFA`);
    });
    lines.push('');
    lines.push(`💵 Total Expenses: ${totalExpenses.toLocaleString()} CFA`);
    lines.push('');
  }

  // Add other revenue sources
  const otherRevenue = revenues
    .filter(r => r.source_type !== 'egg_sale' && r.source_type !== 'bird_sale')
    .reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
  const totalRevenueWithOther = totalRevenue + otherRevenue;

  if (totalRevenueWithOther > 0 || totalExpenses > 0) {
    const net = totalRevenueWithOther - totalExpenses;
    const sign = net >= 0 ? '+' : '';
    const emoji = net >= 0 ? '📈' : '📉';
    lines.push(`${emoji} Net Today: ${sign}${net.toLocaleString()} CFA`);
    if (otherRevenue > 0) {
      lines.push(`  → Includes ${otherRevenue.toLocaleString()} CFA from other revenue sources`);
    }
    lines.push('');
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
        
        lines.push(`• ${flockName}: ${flockTotal.toLocaleString()} CFA`);
        flockExpenses.slice(0, 5).forEach((exp: any) => {
          const icon = exp.category === 'feed' ? '🌾' :
                       exp.category === 'medication' ? '💊' :
                       exp.category === 'labor' ? '👷' :
                       exp.category === 'utilities' ? '⚡' :
                       exp.category === 'repairs' ? '🔧' : '💰';
          lines.push(`  ${icon} ${exp.category || 'Other'}: ${exp.amount?.toLocaleString() || '0'} CFA`);
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
    lines.push('🌾 FEED USAGE TODAY');
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
    lines.push('💉 VACCINATIONS TODAY');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    vaccinations.forEach((vacc: any) => {
      lines.push(`• ${vacc.vaccine_name || 'Vaccination'}`);
      lines.push(`  → Flock: ${vacc.flocks?.name || 'Unknown'}`);
      if (vacc.dosage) lines.push(`  → Dosage: ${vacc.dosage}`);
      if (vacc.notes) lines.push(`  → Notes: ${vacc.notes}`);
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
    lines.push('📦 INVENTORY MOVEMENTS TODAY');
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
      const totalEggsCollected = eggCollections.reduce((sum, c) => sum + (c.trays || 0) * 30, 0);
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
  lines.push(`📉 Mortality Rate: ${mortalityRate}% (Target: <2%)`);
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
    const criticalItems = inventory.filter((item: any) =>
      item.current_quantity <= item.minimum_quantity
    );
    if (criticalItems.length > 0) {
      criticalItems.forEach((item: any) => {
        recommendations.push(`• Order ${item.feed_type} TODAY (only ${item.current_quantity} kg left)`);
      });
    }
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
