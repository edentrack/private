import { supabase } from '../lib/supabaseClient';
import { ProductType, ReceiptItem } from '../types/database';

interface CreateReceiptData {
  farmId: string;
  flockId: string | null;
  customerName: string | null;
  saleDate: string;
  paymentMethod: string;
  notes: string | null;
  items: {
    productType: ProductType;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];
  userId: string;
}

interface ReceiptResult {
  success: boolean;
  receiptId?: string;
  receiptNumber?: string;
  error?: string;
}

export async function createReceipt(data: CreateReceiptData): Promise<ReceiptResult> {
  try {
    const subtotal = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const receiptNumber = await generateReceiptNumber(data.farmId);

    const { data: receipt, error: receiptError } = await supabase
      .from('sales_receipts')
      .insert({
        farm_id: data.farmId,
        receipt_number: receiptNumber,
        flock_id: data.flockId,
        customer_name: data.customerName,
        sale_date: data.saleDate,
        subtotal,
        total: subtotal,
        payment_method: data.paymentMethod,
        notes: data.notes,
        created_by: data.userId,
      })
      .select()
      .single();

    if (receiptError) throw receiptError;

    for (const item of data.items) {
      const itemTotal = item.quantity * item.unitPrice;

      const { data: receiptItem, error: itemError } = await supabase
        .from('receipt_items')
        .insert({
          receipt_id: receipt.id,
          product_type: item.productType,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unitPrice,
          total: itemTotal,
          inventory_deducted: false,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      if (item.productType === 'eggs') {
        await deductEggInventory(
          data.farmId,
          data.flockId,
          item.quantity,
          receipt.id,
          receiptItem.id,
          data.userId
        );
      } else if (item.productType === 'broilers' || item.productType === 'chickens') {
        await deductBroilerInventory(
          data.farmId,
          data.flockId,
          item.quantity,
          receipt.id,
          data.userId
        );
      }
    }

    await createRevenueRecord(
      data.farmId,
      data.flockId,
      data.userId,
      subtotal,
      data.saleDate,
      data.items,
      receipt.id
    );

    return {
      success: true,
      receiptId: receipt.id,
      receiptNumber: receipt.receipt_number,
    };
  } catch (error: any) {
    console.error('Error creating receipt:', error);
    return {
      success: false,
      error: error.message || 'Failed to create receipt',
    };
  }
}

async function generateReceiptNumber(farmId: string): Promise<string> {
  const { data: lastReceipt } = await supabase
    .from('sales_receipts')
    .select('receipt_number')
    .eq('farm_id', farmId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastReceipt) {
    const lastNumber = parseInt(lastReceipt.receipt_number.replace(/\D/g, '')) || 0;
    return `RCP-${String(lastNumber + 1).padStart(6, '0')}`;
  }

  return 'RCP-000001';
}

async function deductEggInventory(
  farmId: string,
  flockId: string | null,
  quantity: number,
  receiptId: string,
  receiptItemId: string,
  userId: string
): Promise<void> {
  const { data: eggInventory } = await supabase
    .from('egg_collections')
    .select('id, flock_id, trays')
    .eq('farm_id', farmId)
    .order('collected_on', { ascending: false });

  if (!eggInventory || eggInventory.length === 0) return;

  let remaining = quantity;

  for (const collection of eggInventory) {
    if (remaining <= 0) break;

    const availableInCollection = collection.trays;
    if (availableInCollection <= 0) continue;

    const toDeduct = Math.min(remaining, availableInCollection);

    const { error } = await supabase
      .from('egg_collections')
      .update({
        trays: collection.trays - toDeduct,
      })
      .eq('id', collection.id);

    if (error) throw error;

    await supabase.from('inventory_movements').insert({
      farm_id: farmId,
      inventory_type: 'eggs',
      inventory_item_id: collection.flock_id,
      direction: 'out',
      quantity: toDeduct,
      unit: 'trays',
      source_type: 'manual',
      source_id: receiptId,
      created_by: userId,
    });

    remaining -= toDeduct;
  }

  await supabase
    .from('receipt_items')
    .update({ inventory_deducted: true })
    .eq('id', receiptItemId);
}

async function deductBroilerInventory(
  farmId: string,
  flockId: string | null,
  quantity: number,
  receiptId: string,
  userId: string
): Promise<void> {
  if (!flockId) {
    const { data: anyFlock } = await supabase
      .from('flocks')
      .select('id')
      .eq('farm_id', farmId)
      .eq('type', 'Broiler')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!anyFlock) return;
    flockId = anyFlock.id;
  }

  const { data: flock } = await supabase
    .from('flocks')
    .select('id, current_count')
    .eq('id', flockId)
    .single();

  if (!flock) return;

  const newCount = Math.max(0, flock.current_count - quantity);

  const { error } = await supabase
    .from('flocks')
    .update({
      current_count: newCount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', flockId);

  if (error) throw error;

  await supabase.from('inventory_movements').insert({
    farm_id: farmId,
    inventory_type: 'other',
    inventory_item_id: flockId,
    direction: 'out',
    quantity,
    unit: 'birds',
    source_type: 'manual',
    source_id: receiptId,
    created_by: userId,
  });
}

async function createRevenueRecord(
  farmId: string,
  flockId: string | null,
  userId: string,
  amount: number,
  date: string,
  items: any[],
  receiptId: string
): Promise<void> {
  const description = items.map(i => `${i.quantity} ${i.unit} ${i.description}`).join(', ');

  if (!flockId) {
    const { data: anyFlock } = await supabase
      .from('flocks')
      .select('id')
      .eq('farm_id', farmId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!anyFlock) {
      throw new Error('No active flock found. Please create a flock first.');
    }
    flockId = anyFlock.id;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('currency_preference')
    .eq('id', userId)
    .single();

  await supabase.from('revenues').insert({
    farm_id: farmId,
    flock_id: flockId,
    source_type: 'receipt_sale',
    source_id: receiptId,
    amount,
    currency: profile?.currency_preference || 'CFA',
    description: `Sale: ${description}`,
    revenue_date: date,
  });
}

interface ProcessRefundData {
  receiptId: string;
  farmId: string;
  refundAmount: number;
  refundReason: string;
  itemsRefunded: any[];
  restoreInventory: boolean;
  userId: string;
}

export async function processRefund(data: ProcessRefundData): Promise<ReceiptResult> {
  try {
    const { data: receipt } = await supabase
      .from('sales_receipts')
      .select('*, receipt_items(*)')
      .eq('id', data.receiptId)
      .single();

    if (!receipt) throw new Error('Receipt not found');

    const { data: refund, error: refundError } = await supabase
      .from('receipt_refunds')
      .insert({
        receipt_id: data.receiptId,
        farm_id: data.farmId,
        refund_amount: data.refundAmount,
        refund_reason: data.refundReason,
        items_refunded: data.itemsRefunded,
        inventory_restored: data.restoreInventory,
        revenue_reversed: true,
        refunded_by: data.userId,
      })
      .select()
      .single();

    if (refundError) throw refundError;

    const { data: profile } = await supabase
      .from('profiles')
      .select('currency_preference')
      .eq('id', data.userId)
      .single();

    await supabase.from('revenues').insert({
      farm_id: data.farmId,
      flock_id: receipt.flock_id,
      source_type: 'refund',
      source_id: refund.id,
      amount: -data.refundAmount,
      currency: profile?.currency_preference || 'CFA',
      description: `Refund: ${data.refundReason} (Receipt #${receipt.receipt_number})`,
      revenue_date: new Date().toISOString().split('T')[0],
    });

    if (data.restoreInventory) {
      for (const item of data.itemsRefunded) {
        if (item.product_type === 'eggs') {
          const mostRecentCollection = await supabase
            .from('egg_collections')
            .select('id, flock_id, trays')
            .eq('farm_id', data.farmId)
            .order('collected_on', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (mostRecentCollection.data) {
            await supabase
              .from('egg_collections')
              .update({
                trays: mostRecentCollection.data.trays + item.quantity,
              })
              .eq('id', mostRecentCollection.data.id);

            await supabase.from('inventory_movements').insert({
              farm_id: data.farmId,
              inventory_type: 'eggs',
              inventory_item_id: mostRecentCollection.data.flock_id,
              direction: 'in',
              quantity: item.quantity,
              unit: item.unit,
              source_type: 'manual',
              source_id: refund.id,
              created_by: data.userId,
            });
          }
        } else if ((item.product_type === 'broilers' || item.product_type === 'chickens') && receipt.flock_id) {
          const { data: flock } = await supabase
            .from('flocks')
            .select('id, current_count')
            .eq('id', receipt.flock_id)
            .maybeSingle();

          if (flock) {
            await supabase
              .from('flocks')
              .update({
                current_count: flock.current_count + item.quantity,
                updated_at: new Date().toISOString(),
              })
              .eq('id', flock.id);

            await supabase.from('inventory_movements').insert({
              farm_id: data.farmId,
              inventory_type: 'other',
              inventory_item_id: receipt.flock_id,
              direction: 'in',
              quantity: item.quantity,
              unit: item.unit || 'birds',
              source_type: 'manual',
              source_id: refund.id,
              created_by: data.userId,
            });
          }
        }
      }
    }

    return {
      success: true,
      receiptId: data.receiptId,
    };
  } catch (error: any) {
    console.error('Error processing refund:', error);
    return {
      success: false,
      error: error.message || 'Failed to process refund',
    };
  }
}

export async function calculateAvailableEggStock(farmId: string, flockId?: string): Promise<number> {
  let query = supabase
    .from('egg_collections')
    .select('trays')
    .eq('farm_id', farmId);

  if (flockId) {
    query = query.eq('flock_id', flockId);
  }

  const { data } = await query;

  if (!data) return 0;

  return data.reduce((sum, collection) => sum + (collection.trays || 0), 0);
}
