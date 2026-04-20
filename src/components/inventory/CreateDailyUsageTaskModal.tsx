import { useState } from 'react';
import { CheckCircle, X, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { InventoryType } from '../../types/database';

interface CreateDailyUsageTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  itemName: string;
  itemId: string;
  inventoryType: InventoryType;
  unit: string;
}

export function CreateDailyUsageTaskModal({
  isOpen,
  onClose,
  onSuccess,
  itemName,
  itemId,
  inventoryType,
  unit,
}: CreateDailyUsageTaskModalProps) {
  const { profile, currentFarm } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeOfDay, setTimeOfDay] = useState('17:00');

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!profile || !currentFarm) return;

    setLoading(true);
    setError('');

    try {
      const taskTemplatePayload = {
        farm_id: currentFarm.id,
        title: `Record usage of ${itemName}`,
        description: `Enter how much ${itemName} was used today.`,
        task_type: 'data',
        category: inventoryType === 'feed' ? 'Feed Management' : 'General Care',
        requires_input: true,
        input_fields: {
          fields: [
            {
              name: 'quantity',
              type: 'number',
              label: `Quantity Used (${unit})`,
              required: true,
              min: 0,
              step: 0.5,
              placeholder: '0',
            },
          ],
        },
        updates_inventory: true,
        inventory_link_type: inventoryType,
        inventory_type: inventoryType,
        inventory_item_id: itemId,
        inventory_effect: 'decrease',
        inventory_unit: unit,
        default_frequency: 'once_per_day',
        is_active: true,
        display_order: 100,
      };

      console.log('CREATE_TASK_TEMPLATE_PAYLOAD:', taskTemplatePayload);

      const { error: insertError } = await supabase.from('task_templates').insert(taskTemplatePayload);

      if (insertError) {
        console.error('CREATE_TASK_TEMPLATE_FAILED:', { error: insertError, payload: taskTemplatePayload });
        throw insertError;
      }

      onSuccess();
    } catch (err: any) {
      console.error('TASK_TEMPLATE_CREATE_ERROR:', err);

      const errorParts = [
        err?.message,
        err?.details,
        err?.hint,
        err?.code,
      ].filter(Boolean);

      const errorMessage = errorParts.length > 0
        ? `Failed to create task template: ${errorParts.join(' | ')}`
        : 'Failed to create task template';

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Track Daily Usage?</h2>
              <p className="text-sm text-gray-600 mt-1">For {itemName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4 mb-6">
          <p className="text-gray-700">
            Would you like to create a daily task to record usage of this item?
          </p>

          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">This will create a daily task that:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>Appears every day for workers to complete</li>
                  <li>Records how much {itemName} was used</li>
                  <li>Automatically updates inventory stock</li>
                  <li>Tracks usage history and trends</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-600">
            You can customize or disable this task anytime from the Daily Tasks page.
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            disabled={loading}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
          >
            Skip for Now
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex-1 bg-[#3D5F42] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#2d4632] transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Yes, Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
