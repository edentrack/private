import { supabase } from '../lib/supabaseClient';
import { InventoryType, MovementDirection, MovementSourceType } from '../types/database';

interface CreateMovementParams {
  farmId: string;
  inventoryType: InventoryType;
  inventoryItemId: string;
  direction: MovementDirection;
  quantity: number;
  unit: string;
  sourceType: MovementSourceType;
  sourceId?: string;
  createdBy: string;
}

export async function createInventoryMovement(params: CreateMovementParams) {
  if (params.inventoryType === 'feed') {
    const { error } = await supabase.from('feed_usage_logs').insert({
      farm_id: params.farmId,
      feed_type_id: params.inventoryItemId,
      quantity_used: params.direction === 'out' ? params.quantity : -params.quantity,
      notes: `${params.sourceType} - ${params.direction === 'in' ? 'Added' : 'Used'} ${params.quantity} ${params.unit}`,
      created_by: params.createdBy,
    });

    if (error) {
      console.error('Error creating feed movement:', error);
      throw error;
    }
  } else if (params.inventoryType === 'other') {
    const { error } = await supabase.from('other_inventory_movements').insert({
      farm_id: params.farmId,
      item_id: params.inventoryItemId,
      quantity_change: params.direction === 'in' ? params.quantity : -params.quantity,
      reason: `${params.sourceType}`,
      source: params.sourceType,
      reference_id: params.sourceId || null,
    });

    if (error) {
      console.error('Error creating inventory movement:', error);
      throw error;
    }
  }
}

export async function updateInventoryStock(
  inventoryType: InventoryType,
  inventoryItemId: string,
  quantityChange: number
) {
  if (inventoryType === 'feed') {
    const { data: currentItem } = await supabase
      .from('feed_inventory')
      .select('quantity')
      .eq('feed_type_id', inventoryItemId)
      .single();

    if (currentItem) {
      const newStock = Math.max(0, currentItem.quantity + quantityChange);

      const { error } = await supabase
        .from('feed_inventory')
        .update({
          quantity: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq('feed_type_id', inventoryItemId);

      if (error) throw error;
    }
  } else if (inventoryType === 'other') {
    const { data: currentItem } = await supabase
      .from('other_inventory_items')
      .select('quantity')
      .eq('id', inventoryItemId)
      .single();

    if (currentItem) {
      const newQuantity = Math.max(0, currentItem.quantity + quantityChange);

      const { error } = await supabase
        .from('other_inventory_items')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', inventoryItemId);

      if (error) throw error;
    }
  }
}

export async function recordInventoryIncrease(
  farmId: string,
  userId: string,
  inventoryType: InventoryType,
  inventoryItemId: string,
  quantity: number,
  unit: string,
  sourceType: MovementSourceType,
  sourceId?: string
) {
  await createInventoryMovement({
    farmId,
    inventoryType,
    inventoryItemId,
    direction: 'in',
    quantity,
    unit,
    sourceType,
    sourceId,
    createdBy: userId,
  });

  await updateInventoryStock(inventoryType, inventoryItemId, quantity);
}

export async function recordInventoryDecrease(
  farmId: string,
  userId: string,
  inventoryType: InventoryType,
  inventoryItemId: string,
  quantity: number,
  unit: string,
  sourceType: MovementSourceType,
  sourceId?: string
) {
  await createInventoryMovement({
    farmId,
    inventoryType,
    inventoryItemId,
    direction: 'out',
    quantity,
    unit,
    sourceType,
    sourceId,
    createdBy: userId,
  });

  await updateInventoryStock(inventoryType, inventoryItemId, -quantity);
}
