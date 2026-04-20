import { supabase } from '../lib/supabaseClient';
import { Flock } from '../types/database';

interface UpsertChickExpensesParams {
  flock: Flock;
  userId: string;
  farmId: string;
  currencyCode: string;
}

export async function upsertChickExpenses({
  flock,
  userId,
  farmId,
  currencyCode
}: UpsertChickExpensesParams): Promise<void> {
  const purchasePricePerBird = flock.purchase_price_per_bird || 0;
  const transportCost = flock.purchase_transport_cost || 0;
  const initialBirds = flock.initial_count || 0;

  if (purchasePricePerBird > 0 && initialBirds > 0) {
    const totalPurchase = purchasePricePerBird * initialBirds;

    const { data: existingPurchaseExpense } = await supabase
      .from('expenses')
      .select('id')
      .eq('flock_id', flock.id)
      .eq('kind', 'chicks_purchase')
      .maybeSingle();

    if (existingPurchaseExpense) {
      await supabase
        .from('expenses')
        .update({
          amount: totalPurchase,
          description: `Purchase of ${initialBirds} ${flock.type} chicks at ${purchasePricePerBird} per bird`,
          incurred_on: flock.arrival_date,
          date: flock.arrival_date,
          currency: currencyCode as any,
        })
        .eq('id', existingPurchaseExpense.id);
    } else {
      await supabase.from('expenses').insert({
        user_id: userId,
        farm_id: farmId,
        flock_id: flock.id,
        kind: 'chicks_purchase',
        category: 'chicks purchase',
        amount: totalPurchase,
        currency: currencyCode as any,
        description: `Purchase of ${initialBirds} ${flock.type} chicks at ${purchasePricePerBird} per bird`,
        incurred_on: flock.arrival_date,
        date: flock.arrival_date,
      });
    }
  } else {
    const { data: existingPurchaseExpense } = await supabase
      .from('expenses')
      .select('id')
      .eq('flock_id', flock.id)
      .eq('kind', 'chicks_purchase')
      .maybeSingle();

    if (existingPurchaseExpense) {
      await supabase.from('expenses').delete().eq('id', existingPurchaseExpense.id);
    }
  }

  if (transportCost > 0) {
    const { data: existingTransportExpense } = await supabase
      .from('expenses')
      .select('id')
      .eq('flock_id', flock.id)
      .eq('kind', 'chicks_transport')
      .maybeSingle();

    if (existingTransportExpense) {
      await supabase
        .from('expenses')
        .update({
          amount: transportCost,
          category: 'transport', // Update to "transport" category for all transport expenses
          description: `Transport cost for ${initialBirds} ${flock.type} chicks`,
          incurred_on: flock.arrival_date,
          date: flock.arrival_date,
          currency: currencyCode as any,
        })
        .eq('id', existingTransportExpense.id);
    } else {
      await supabase.from('expenses').insert({
        user_id: userId,
        farm_id: farmId,
        flock_id: flock.id,
        kind: 'chicks_transport',
        category: 'transport', // Use "transport" category for all transport expenses
        amount: transportCost,
        currency: currencyCode as any,
        description: `Transport cost for ${initialBirds} ${flock.type} chicks`,
        incurred_on: flock.arrival_date,
        date: flock.arrival_date,
      });
    }
  } else {
    const { data: existingTransportExpense } = await supabase
      .from('expenses')
      .select('id')
      .eq('flock_id', flock.id)
      .eq('kind', 'chicks_transport')
      .maybeSingle();

    if (existingTransportExpense) {
      await supabase.from('expenses').delete().eq('id', existingTransportExpense.id);
    }
  }
}
