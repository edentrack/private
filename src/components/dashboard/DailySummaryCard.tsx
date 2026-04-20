import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Calendar, Egg, ShoppingBag, Package, AlertTriangle, ChevronLeft, ChevronRight, Scale, X, TrendingUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeSubscription } from '../../contexts/RealtimeContext';
import { formatEggsWithTotal } from '../../utils/eggFormatting';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface FeedPrediction {
  dailyUsage: number;
  daysUntilEmpty: number | null;
  lastGiven: string | null;
  nextFeedingEstimate: string | null;
  currentStock: number;
  feedTypeName: string;
  usageTrend: number; // Positive = increasing, Negative = decreasing
  weeklyAverage: number; // Average over last 7 days
}

interface FeedUsageRecord {
  feedTypeName: string;
  quantity: number;
  unit: string;
  recordedAt: string;
  time: string; // Just the time portion
}

interface DailySummary {
  date: string;
  eggsCollectedTrays: number;
  eggsCollectedCount: number;
  eggsSoldTrays: number;
  eggsSoldCount: number;
  feedUsedBags: number;
  mortalityCount: number;
  revenue: number;
  expenses: number;
  estimatedProfit: number;
  hasLayerFlocks: boolean;
  hasBroilerFlocks: boolean;
  avgWeight: number;
}

interface DailySummaryCardProps {
  /** When this value changes, summary (including egg counts) is refetched without full loading state */
  refreshTrigger?: number;
}

export function DailySummaryCard({ refreshTrigger }: DailySummaryCardProps) {
  const { profile, currentFarm } = useAuth();
  const { subscribeToTable } = useRealtimeSubscription();
  const { t } = useTranslation();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const summaryRef = useRef<DailySummary | null>(null);
  const isInitialLoadRef = useRef(true);
  
  const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
  };
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedPredictions, setFeedPredictions] = useState<FeedPrediction[]>([]);
  const [feedUsageRecords, setFeedUsageRecords] = useState<FeedUsageRecord[]>([]);

  const eggsPerTray = useMemo(() => currentFarm?.eggs_per_tray || 30, [currentFarm?.eggs_per_tray]);

  type LoadOptions = { silent?: boolean };

  const loadFeedUsageRecords = useCallback(async () => {
    if (!currentFarm?.id) return;

    try {
      const startOfDay = `${selectedDate}T00:00:00`;
      const endOfDay = `${selectedDate}T23:59:59`;

      // Get feed usage records ONLY from inventory_usage table (the usage widget)
      // This represents actual usage when chickens finish feed from buckets
      let records: FeedUsageRecord[] = [];

      const { data: usageRecords } = await supabase
        .from('inventory_usage')
        .select(`
          quantity_used,
          created_at,
          feed_type:feed_types(name, unit)
        `)
        .eq('farm_id', currentFarm.id)
        .eq('item_type', 'feed')
        .eq('usage_date', selectedDate)
        .order('created_at', { ascending: false });

      if (usageRecords && usageRecords.length > 0) {
        // Group by feed type and time (round to nearest 5 minutes)
        const grouped: Record<string, { feedTypeName: string; quantity: number; unit: string; recordedAt: string; time: string }> = {};
        
        usageRecords
          .filter(r => r.feed_type)
          .forEach(r => {
            const feedTypeName = r.feed_type.name;
            const unit = r.feed_type.unit || 'bags';
            const date = new Date(r.created_at);
            // Round to nearest 5 minutes for grouping
            const minutes = date.getMinutes();
            const roundedMinutes = Math.floor(minutes / 5) * 5;
            date.setMinutes(roundedMinutes, 0, 0);
            const timeKey = `${feedTypeName}_${date.toISOString()}`;
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            
            if (grouped[timeKey]) {
              grouped[timeKey].quantity += Number(r.quantity_used) || 0;
            } else {
              grouped[timeKey] = {
                feedTypeName,
                quantity: Number(r.quantity_used) || 0,
                unit,
                recordedAt: r.created_at,
                time: timeStr,
              };
            }
          });
        
        records = Object.values(grouped);
      }

      setFeedUsageRecords(records);
    } catch (error) {
      console.error('Error loading feed usage records:', error);
      setFeedUsageRecords([]);
    }
  }, [currentFarm?.id, selectedDate]);

  const loadSummary = useCallback(async (options: LoadOptions = {}) => {
    if (!currentFarm?.id) return;

    // Avoid UI flicker: realtime + interval refresh should not flip the whole card into "Loading..."
    // Only show loading on first load / explicit date change.
    const shouldShowLoading = !options.silent || isInitialLoadRef.current || !summaryRef.current;
    if (shouldShowLoading) setLoading(true);
    try {
      // Get eggsPerTray from currentFarm directly to avoid dependency issues
      const eggsPerTrayValue = currentFarm?.eggs_per_tray || 30;

      const { data: flocks } = await supabase
        .from('flocks')
        .select('id, type')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active');

      const hasLayerFlocks = (flocks || []).some(f => f.type?.toLowerCase() === 'layer');
      const hasBroilerFlocks = (flocks || []).some(f => f.type?.toLowerCase() === 'broiler');
      const layerFlockIds = (flocks || []).filter(f => f.type?.toLowerCase() === 'layer').map(f => f.id);
      const broilerFlockIds = (flocks || []).filter(f => f.type?.toLowerCase() === 'broiler').map(f => f.id);

      let eggsCollectedTrays = 0;
      let eggsCollectedCount = 0;
      let eggsSoldTrays = 0;
      let eggsSoldCount = 0;

      if (hasLayerFlocks && layerFlockIds.length > 0) {
        const { data: collections } = await supabase
          .from('egg_collections')
          .select('trays, broken, total_eggs, collected_on')
          .eq('farm_id', currentFarm.id)
          .eq('collected_on', selectedDate)
          .in('flock_id', layerFlockIds);

        let totalTrays = 0;
        let totalEggs = 0;
        (collections || []).forEach((c: any) => {
          const trays = Number(c.trays || 0);
          const broken = Number(c.broken || 0);
          const explicitTotal = Number(c.total_eggs ?? 0);
          totalTrays += trays;
          if (explicitTotal > 0) {
            totalEggs += explicitTotal;
          } else {
            totalEggs += Math.max(0, trays * eggsPerTrayValue - broken);
          }
        });

        eggsCollectedTrays = totalTrays;
        eggsCollectedCount = totalEggs;

        const { data: sales } = await supabase
          .from('egg_sales')
          .select('trays, total_eggs, sold_on')
          .eq('farm_id', currentFarm.id)
          .eq('sold_on', selectedDate);

        eggsSoldTrays = (sales || []).reduce((sum: number, s: any) => sum + Number(s.trays || 0), 0);
        eggsSoldCount = (sales || []).reduce((sum: number, s: any) => {
          const trays = Number(s.trays || 0);
          const explicitTotal = Number(s.total_eggs ?? 0);
          if (explicitTotal > 0) return sum + explicitTotal;
          return sum + trays * eggsPerTrayValue;
        }, 0);
      }

      let avgWeight = 0;
      if (hasBroilerFlocks && broilerFlockIds.length > 0) {
        const { data: weights } = await supabase
          .from('weight_logs')
          .select('average_weight')
          .in('flock_id', broilerFlockIds)
          .eq('date', selectedDate);

        if (weights && weights.length > 0) {
          avgWeight = weights.reduce((sum, w) => sum + (w.average_weight || 0), 0) / weights.length;
        }
      }

      const startOfDay = `${selectedDate}T00:00:00`;
      const endOfDay = `${selectedDate}T23:59:59`;

      // Get feed usage ONLY from inventory_usage table (the usage widget)
      // This represents actual usage when chickens finish feed from buckets
      const { data: feedUsage } = await supabase
        .from('inventory_usage')
        .select('quantity_used, feed_type:feed_types(unit)')
        .eq('farm_id', currentFarm.id)
        .eq('item_type', 'feed')
        .eq('usage_date', selectedDate);

      let feedUsedBags = 0;
      if (feedUsage) {
        const { getFeedConversionSettings, convertFeedToKg, convertKgToFeedUnit } = await import('../../utils/feedConversions');
        const feedSettings = await getFeedConversionSettings(currentFarm.id);
        
        feedUsage.forEach(record => {
          const qty = Number(record.quantity_used || 0);
          const unit = (record.feed_type as any)?.unit || feedSettings.feedUnit;
          
          // Convert to kg first, then to bags using farm settings
          const kg = convertFeedToKg(qty, unit, feedSettings);
          const { quantity: bags } = convertKgToFeedUnit(kg, feedSettings);
          feedUsedBags += bags;
        });
      }

      const { data: mortality } = await supabase
        .from('mortality_logs')
        .select('count')
        .eq('farm_id', currentFarm.id)
        .eq('event_date', selectedDate);

      const mortalityCount = (mortality || []).reduce((sum, m) => sum + (m.count || 0), 0);

      const { data: revenue } = await supabase
        .from('revenues')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .eq('revenue_date', selectedDate);

      const totalRevenue = (revenue || []).reduce((sum, r) => sum + (r.amount || 0), 0);

      const { data: expenses } = await supabase
        .from('expenses')
        .select('amount')
        .eq('farm_id', currentFarm.id)
        .eq('incurred_on', selectedDate);

      const totalExpenses = (expenses || []).reduce((sum, e) => sum + (e.amount || 0), 0);

      const newSummary = {
        date: selectedDate,
        eggsCollectedTrays,
        eggsCollectedCount,
        eggsSoldTrays,
        eggsSoldCount,
        feedUsedBags,
        mortalityCount,
        revenue: totalRevenue,
        expenses: totalExpenses,
        estimatedProfit: totalRevenue - totalExpenses,
        hasLayerFlocks,
        hasBroilerFlocks,
        avgWeight,
      };
      setSummary(newSummary);
      summaryRef.current = newSummary;
      isInitialLoadRef.current = false;
    } catch (error) {
      console.error('Error loading daily summary:', error);
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  }, [currentFarm?.id, selectedDate]);

  // Feed graph moved to weight page - function removed

  const loadFeedPredictions = useCallback(async () => {
    if (!currentFarm?.id) return;

    try {
      // Get all feed inventory items
      const { data: feedInventory, error: feedError } = await supabase
        .from('feed_inventory')
        .select(`
          id,
          quantity,
          feed_type:feed_types(id, name, unit)
        `)
        .eq('farm_id', currentFarm.id);

      if (feedError) {
        console.error('Error loading feed inventory:', feedError);
      }

      // If feed_inventory doesn't exist, try feed_stock (old table)
      let feedItems = feedInventory || [];
      
      if (feedItems.length === 0) {
        const { data: feedStock } = await supabase
          .from('feed_stock')
          .select('id, current_stock_bags, feed_type')
          .eq('farm_id', currentFarm.id);
        
        if (feedStock && feedStock.length > 0) {
          // Convert feed_stock to feedPredictions format
          const predictions: FeedPrediction[] = feedStock.map(item => ({
            dailyUsage: 0,
            daysUntilEmpty: null,
            lastGiven: null,
            nextFeedingEstimate: null,
            currentStock: Number(item.current_stock_bags) || 0,
            feedTypeName: item.feed_type || 'Feed',
            usageTrend: 0,
            weeklyAverage: 0,
          }));
          setFeedPredictions(predictions);
          return;
        }
      }

      if (!feedInventory || feedInventory.length === 0) {
        setFeedPredictions([]);
        return;
      }

      const predictions: FeedPrediction[] = [];

      for (const feedItem of feedInventory) {
        if (!feedItem.feed_type) continue;

        const feedTypeId = feedItem.feed_type.id;
        const feedTypeName = feedItem.feed_type.name;
        const currentStock = Number(feedItem.quantity) || 0;

        // Get last 10 feed givings to calculate trends
        let givings: any[] = [];
        try {
          const { data: givingsData } = await supabase
            .from('feed_givings')
            .select('quantity_given, given_at')
            .eq('farm_id', currentFarm.id)
            .eq('feed_type_id', feedTypeId)
            .order('given_at', { ascending: false })
            .limit(10);
          
          givings = givingsData || [];
        } catch (error) {
          // feed_givings table might not exist yet, try expenses as fallback
          try {
            // Try to find expenses linked to this feed type
            // First, check if expenses link to feed_stock or feed_inventory
            const { data: feedExpenses } = await supabase
              .from('expenses')
              .select('inventory_quantity, incurred_on, date, inventory_item_id')
              .eq('farm_id', currentFarm.id)
              .eq('inventory_link_type', 'feed')
              .not('inventory_quantity', 'is', null)
              .order('incurred_on', { ascending: false })
              .limit(20);

            if (feedExpenses && feedExpenses.length > 0) {
              // Try to match by feed_inventory id or feed_stock id
              const matchingExpenses = feedExpenses.filter(e => {
                // Check if this expense's inventory_item_id matches our feedItem.id
                return e.inventory_item_id === feedItem.id;
              });

              if (matchingExpenses.length > 0) {
                // Convert expenses to givings format for calculation
                givings = matchingExpenses.map(e => ({
                  quantity_given: e.inventory_quantity,
                  given_at: e.incurred_on || e.date,
                }));
              }
            }
          } catch (expenseError) {
            // Both failed, that's okay - feed_givings table might not exist
          }
        }

        if (!givings || givings.length === 0) {
          predictions.push({
            dailyUsage: 0,
            daysUntilEmpty: null,
            lastGiven: null,
            nextFeedingEstimate: null,
            currentStock,
            feedTypeName,
            usageTrend: 0,
            weeklyAverage: 0,
          });
          continue;
        }

        // Calculate daily usage from time between feedings
        let totalDays = 0;
        let totalQuantity = 0;
        const sortedGivings = [...givings].sort((a, b) => 
          new Date(a.given_at).getTime() - new Date(b.given_at).getTime()
        );

        // Calculate recent vs older usage for trend
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        
        let recentDays = 0;
        let recentQuantity = 0;
        let olderDays = 0;
        let olderQuantity = 0;

        for (let i = 1; i < sortedGivings.length; i++) {
          const prev = new Date(sortedGivings[i - 1].given_at);
          const curr = new Date(sortedGivings[i].given_at);
          const daysDiff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
          
          if (daysDiff > 0 && daysDiff < 30) {
            totalDays += daysDiff;
            totalQuantity += Number(sortedGivings[i].quantity_given);
            
            // Categorize by time period for trend
            if (curr >= sevenDaysAgo) {
              recentDays += daysDiff;
              recentQuantity += Number(sortedGivings[i].quantity_given);
            } else if (curr >= fourteenDaysAgo) {
              olderDays += daysDiff;
              olderQuantity += Number(sortedGivings[i].quantity_given);
            }
          }
        }

        const dailyUsage = totalDays > 0 ? totalQuantity / totalDays : 0;
        const recentDailyUsage = recentDays > 0 ? recentQuantity / recentDays : 0;
        const olderDailyUsage = olderDays > 0 ? olderQuantity / olderDays : 0;
        const usageTrend = recentDailyUsage > 0 && olderDailyUsage > 0 
          ? ((recentDailyUsage - olderDailyUsage) / olderDailyUsage) * 100 
          : 0;
        const weeklyAverage = recentDailyUsage || dailyUsage;

        const lastGiven = sortedGivings[sortedGivings.length - 1].given_at;
        const daysUntilEmpty = dailyUsage > 0 && currentStock > 0
          ? Math.floor(currentStock / dailyUsage)
          : null;

        // Estimate next feeding based on average days between feedings
        const avgDaysBetween = sortedGivings.length > 1 && totalDays > 0
          ? totalDays / (sortedGivings.length - 1)
          : null;
        
        // Calculate next feeding estimate - ensure it's always in the future
        let nextFeedingEstimate: string | null = null;
        if (avgDaysBetween && lastGiven) {
          const lastGivenDate = new Date(lastGiven);
          const estimatedDate = new Date(lastGivenDate.getTime() + avgDaysBetween * 24 * 60 * 60 * 1000);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          // If the estimated date is in the past, add another cycle
          if (estimatedDate < today) {
            estimatedDate.setTime(estimatedDate.getTime() + avgDaysBetween * 24 * 60 * 60 * 1000);
          }
          
          nextFeedingEstimate = estimatedDate.toISOString().split('T')[0];
        }

        predictions.push({
          dailyUsage,
          daysUntilEmpty,
          lastGiven,
          nextFeedingEstimate,
          currentStock,
          feedTypeName,
          usageTrend,
          weeklyAverage,
        });
      }

      setFeedPredictions(predictions);
    } catch (error) {
      console.error('Error loading feed predictions:', error);
    }
  }, [currentFarm?.id]);

  // Refs to hold latest load functions - allows subscription effect to avoid depending on them
  // This prevents effect re-runs when callbacks get new refs (which can cause subscribe/unsubscribe loops)
  const loadSummaryRef = useRef(loadSummary);
  const loadFeedPredictionsRef = useRef(loadFeedPredictions);
  const loadFeedUsageRecordsRef = useRef(loadFeedUsageRecords);
  loadSummaryRef.current = loadSummary;
  loadFeedPredictionsRef.current = loadFeedPredictions;
  loadFeedUsageRecordsRef.current = loadFeedUsageRecords;

  // Load data when farm or date changes
  useEffect(() => {
    if (currentFarm?.id) {
      isInitialLoadRef.current = true;
      loadSummary({ silent: false });
      loadFeedPredictions();
      loadFeedUsageRecords();
    }
  }, [currentFarm?.id, selectedDate, loadSummary, loadFeedPredictions, loadFeedUsageRecords]);

  // Refetch summary when parent signals (e.g. after saving egg collection on dashboard)
  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0 && currentFarm?.id) {
      loadSummary({ silent: true });
    }
  }, [refreshTrigger, currentFarm?.id, loadSummary]);

  // Refresh when mounting if inventory was modified from another view (e.g. Weight page)
  useEffect(() => {
    const needsRefresh = sessionStorage.getItem('inventory_needs_refresh');
    if (needsRefresh && currentFarm?.id) {
      const ts = parseInt(needsRefresh, 10);
      if (Date.now() - ts < 5 * 60 * 1000) {
        loadFeedPredictions();
        loadFeedUsageRecords();
      }
      sessionStorage.removeItem('inventory_needs_refresh');
    }
  }, [currentFarm?.id, loadFeedPredictions, loadFeedUsageRecords]);

  // Set up real-time subscriptions and auto-refresh for today
  useEffect(() => {
    if (!currentFarm?.id) return;

    const todayStr = getToday();
    const isViewingToday = selectedDate === todayStr;

    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }

    // Set up auto-refresh every 30 seconds if viewing today
    if (isViewingToday) {
      refreshIntervalRef.current = setInterval(() => {
        loadSummaryRef.current({ silent: true });
        loadFeedPredictionsRef.current();
        loadFeedUsageRecordsRef.current();
      }, 30000); // Refresh every 30 seconds
    }

    // Set up real-time subscriptions for today's data
    // Use refs for load functions to avoid effect re-runs when they change - prevents
    // subscribe/unsubscribe loops that caused "Maximum update depth exceeded"
    if (isViewingToday) {
      const unsubscribers: (() => void)[] = [];

      // Debounce function to prevent rapid-fire updates
      const debouncedReload = (callback: () => void) => {
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
        debounceTimeoutRef.current = setTimeout(() => {
          callback();
        }, 1000); // Wait 1 second before reloading to batch updates
      };

      // Subscribe to inventory_usage to refresh feed stock when bags are used
      const unsubInventory = subscribeToTable('inventory_usage', () => {
        debouncedReload(() => {
          loadFeedPredictionsRef.current();
          loadFeedUsageRecordsRef.current();
          loadSummaryRef.current({ silent: true });
        });
      });
      unsubscribers.push(unsubInventory);

      // Subscribe to feed_inventory changes
      const unsubFeedInventory = subscribeToTable('feed_inventory', () => {
        debouncedReload(() => {
          loadFeedPredictionsRef.current();
        });
      });
      unsubscribers.push(unsubFeedInventory);

      // Subscribe to feed_stock changes (legacy table)
      const unsubFeedStock = subscribeToTable('feed_stock', () => {
        debouncedReload(() => {
          loadFeedPredictionsRef.current();
        });
      });
      unsubscribers.push(unsubFeedStock);

      // Subscribe to egg collections
      const unsubEggs = subscribeToTable('egg_collections', () => {
        debouncedReload(() => loadSummaryRef.current({ silent: true }));
      });
      unsubscribers.push(unsubEggs);

      // Listen for custom inventory-updated event
      const handleInventoryUpdate = () => {
        loadFeedPredictionsRef.current();
        loadFeedUsageRecordsRef.current();
      };
      window.addEventListener('inventory-updated', handleInventoryUpdate);

      // Subscribe to feed givings
      const unsubFeedGivings = subscribeToTable('feed_givings', () => {
        debouncedReload(() => {
          loadFeedPredictionsRef.current();
          loadFeedUsageRecordsRef.current();
          loadSummaryRef.current({ silent: true });
        });
      });
      unsubscribers.push(unsubFeedGivings);

      // Subscribe to egg sales
      const unsubEggSales = subscribeToTable('egg_sales', () => {
        debouncedReload(() => loadSummaryRef.current({ silent: true }));
      });
      unsubscribers.push(unsubEggSales);

      // Subscribe to revenues
      const unsubRevenues = subscribeToTable('revenues', () => {
        debouncedReload(() => loadSummaryRef.current({ silent: true }));
      });
      unsubscribers.push(unsubRevenues);

      // Subscribe to expenses
      const unsubExpenses = subscribeToTable('expenses', () => {
        debouncedReload(() => loadSummaryRef.current({ silent: true }));
      });
      unsubscribers.push(unsubExpenses);

      // Subscribe to mortality logs
      const unsubMortality = subscribeToTable('mortality_logs', () => {
        debouncedReload(() => loadSummaryRef.current({ silent: true }));
      });
      unsubscribers.push(unsubMortality);

      // Cleanup
      return () => {
        unsubscribers.forEach(unsub => unsub());
        window.removeEventListener('inventory-updated', handleInventoryUpdate);
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
          debounceTimeoutRef.current = null;
        }
      };
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [currentFarm?.id, selectedDate, subscribeToTable]);

  const goToPreviousDay = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const getTodayString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const goToNextDay = () => {
    const todayStr = getTodayString();
    
    // If selected date is before today, allow moving forward
    if (selectedDate < todayStr) {
      const nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split('T')[0];
      
      // Only move forward if we haven't reached today yet
      if (nextDateStr <= todayStr) {
        setSelectedDate(nextDateStr);
      }
    }
  };

  const todayStr = getTodayString();
  const isToday = selectedDate === todayStr;
  const canGoNext = selectedDate < todayStr;

  if (loading) {
    return (
      <div className="rounded-3xl px-0 py-1">
        <div className="text-center text-gray-500">Loading summary...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-3xl px-0 py-1">
        <div className="text-center text-gray-500">No data available</div>
      </div>
    );
  }

  const eggCollectedDisplay = formatEggsWithTotal(summary.eggsCollectedCount, eggsPerTray);
  const eggSoldDisplay = formatEggsWithTotal(summary.eggsSoldCount, eggsPerTray);

  return (
    <div className="rounded-3xl px-0 py-1 animate-fade-in">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-sm font-semibold text-gray-900">Daily Farm Summary</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(getToday())}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
              selectedDate === getToday() ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('dashboard.today')}
          </button>
          <button
            onClick={goToPreviousDay}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="Previous day"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
            <Calendar className="w-3 h-3 text-gray-600" />
            <span className="text-sm font-medium text-gray-900">
              {(() => {
                // Parse date as local time to avoid timezone issues
                const [year, month, day] = selectedDate.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                return date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });
              })()}
            </span>
          </div>
          <button
            onClick={goToNextDay}
            disabled={!canGoNext}
            className={`p-1.5 rounded-lg transition-colors ${
              canGoNext ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'
            }`}
            title="Next day"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 auto-rows-fr">
        {summary.hasLayerFlocks && (
          <>
            <div className="border-2 border-blue-200 bg-blue-50 rounded-xl p-2.5 h-[118px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-blue-600 rounded-lg">
                  <Egg className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">{t('dashboard.eggs_collected')}</h3>
              </div>
              <div className="text-base font-bold text-blue-600">{eggCollectedDisplay.primary}</div>
            </div>

            <div className="border-2 border-green-200 bg-green-50 rounded-xl p-2.5 h-[118px]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-green-600 rounded-lg">
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-sm font-bold text-gray-900">{t('dashboard.eggs_sold')}</h3>
              </div>
              <div className="text-base font-bold text-green-600">{eggSoldDisplay.primary}</div>
            </div>
          </>
        )}

        {summary.hasBroilerFlocks && (
          <div className="border-2 border-amber-200 bg-amber-50 rounded-xl p-2.5 h-[118px]">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-600 rounded-lg">
                <Scale className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">{t('dashboard.avg_weight')}</h3>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-amber-600">
                {summary.avgWeight > 0 ? summary.avgWeight.toFixed(2) : '-'}
              </span>
              <span className="text-xs text-gray-600">kg/bird</span>
            </div>
          </div>
        )}

        <div className="border-2 border-orange-200 bg-orange-50 rounded-xl p-2.5 h-[118px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-orange-600 rounded-lg">
              <Package className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">{t('dashboard.feed_used')}</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-orange-600">{summary.feedUsedBags.toFixed(1)}</span>
            <span className="text-xs text-gray-600">bags</span>
          </div>
        </div>

        <div className="border-2 border-red-200 bg-red-50 rounded-xl p-2.5 h-[118px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-red-600 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">{t('dashboard.mortality')}</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-red-600">{summary.mortalityCount}</span>
            <span className="text-xs text-gray-600">birds</span>
          </div>
        </div>

      </div>
    </div>
  );
}
