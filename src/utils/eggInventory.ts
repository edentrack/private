import { supabase } from '../lib/supabaseClient';
import { EggCollection, EggSale } from '../types/database';

export interface EggInventoryData {
  totalEggsCollected: number;
  totalEggsSold: number;
  eggsInStock: number;
  traysInStock: number;
  eggsInStockRemainder: number;
  lastCollectionDate: string | null;
  lastSaleDate: string | null;
}

export async function calculateEggInventory(
  farmId: string,
  flockId: string | null,
  eggsPerTray: number
): Promise<EggInventoryData> {
  let collectionsQuery = supabase
    .from('egg_collections')
    .select('*')
    .eq('farm_id', farmId);

  if (flockId) {
    collectionsQuery = collectionsQuery.eq('flock_id', flockId);
  }

  let salesQuery = supabase
    .from('egg_sales')
    .select('*')
    .eq('farm_id', farmId);

  if (flockId) {
    salesQuery = salesQuery.eq('flock_id', flockId);
  }

  const [collectionsResult, salesResult] = await Promise.all([
    collectionsQuery,
    salesQuery,
  ]);

  const collections = (collectionsResult.data || []) as any[];
  const sales = (salesResult.data || []) as any[];

  const totalEggsCollected = collections.reduce((sum, c) => {
    const total = Number(c.total_eggs ?? 0);
    if (total > 0) return sum + total;
    return sum + Math.max(0, Number(c.trays || 0) * eggsPerTray - Number(c.broken || 0));
  }, 0);

  const totalEggsSold = sales.reduce((sum, s) => {
    const total = Number(s.total_eggs ?? 0);
    if (total > 0) return sum + total;
    return sum + Number(s.trays || 0) * eggsPerTray;
  }, 0);

  const eggsInStock = totalEggsCollected - totalEggsSold;
  const traysInStock = Math.floor(eggsInStock / eggsPerTray);
  const eggsInStockRemainder = eggsInStock % eggsPerTray;

  const lastCollection = collections.sort((a, b) =>
    new Date(b.collected_on).getTime() - new Date(a.collected_on).getTime()
  )[0];

  const lastSale = sales.sort((a, b) =>
    new Date(b.sold_on).getTime() - new Date(a.sold_on).getTime()
  )[0];

  return {
    totalEggsCollected,
    totalEggsSold,
    eggsInStock,
    traysInStock,
    eggsInStockRemainder,
    lastCollectionDate: lastCollection?.collected_on || null,
    lastSaleDate: lastSale?.sold_on || null,
  };
}
export async function createEggSaleWithRevenue(
  sale: Omit<EggSale, 'id' | 'revenue_id' | 'created_at'>,
  eggsPerTray: number,
  currencyCode: string
): Promise<{ saleId: string; revenueId: string }> {
  const totalQuantity = sale.trays_sold * eggsPerTray;
  const grossAmount = totalQuantity * sale.unit_price;
  const netAmount = grossAmount - sale.transport_cost;

  const { data: revenueData, error: revenueError } = await supabase
    .from('revenues')
    .insert({
      farm_id: sale.farm_id,
      flock_id: sale.flock_id,
      source_type: 'egg_sale',
      source_id: null,
      amount: netAmount,
      currency: currencyCode,
      description: sale.buyer_name
        ? `Egg sale to ${sale.buyer_name} - ${sale.trays_sold} trays`
        : `Egg sale - ${sale.trays_sold} trays`,
      revenue_date: sale.date,
    })
    .select()
    .single();

  if (revenueError) throw revenueError;

  const { data: saleData, error: saleError } = await supabase
    .from('egg_sales')
    .insert({
      ...sale,
      revenue_id: revenueData.id,
    })
    .select()
    .single();

  if (saleError) throw saleError;

  return {
    saleId: saleData.id,
    revenueId: revenueData.id,
  };
}

