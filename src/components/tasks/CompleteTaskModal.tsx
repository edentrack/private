import { useState, useEffect } from 'react';
import { X, Camera, CheckCircle, Package, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { Task, TaskTemplate } from '../../types/database';
import { recordInventoryDecrease, recordInventoryIncrease } from '../../utils/inventoryMovements';
import { useTranslation } from 'react-i18next';
import { useOfflineWrite } from '../../hooks/useOfflineWrite';

interface CompleteTaskModalProps {
  task: Task;
  onClose: () => void;
  onSuccess: () => void;
}

export function CompleteTaskModal({ task, onClose, onSuccess }: CompleteTaskModalProps) {
  const { t } = useTranslation();
  const { user, currentFarm } = useAuth();
  const { tryWrite, isNetworkError } = useOfflineWrite();
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [taskTemplate, setTaskTemplate] = useState<TaskTemplate | null>(null);
  const [inventoryQuantity, setInventoryQuantity] = useState('');
  const [inventoryItemName, setInventoryItemName] = useState('');

  useEffect(() => {
    loadTaskTemplate();
  }, [task]);

  const loadTaskTemplate = async () => {
    if (!task.template_id) return;

    const { data: template } = await supabase
      .from('task_templates')
      .select('*')
      .eq('id', task.template_id)
      .maybeSingle();

    if (template && template.inventory_effect !== 'none') {
      setTaskTemplate(template);

      if (template.inventory_item_id) {
        if (template.inventory_type === 'feed') {
          const { data: feedItem } = await supabase
            .from('feed_stock')
            .select('feed_type')
            .eq('id', template.inventory_item_id)
            .maybeSingle();

          if (feedItem) {
            setInventoryItemName(feedItem.feed_type);
          }
        } else if (template.inventory_type === 'other') {
          const { data: otherItem } = await supabase
            .from('other_inventory')
            .select('item_name')
            .eq('id', template.inventory_item_id)
            .maybeSingle();

          if (otherItem) {
            setInventoryItemName(otherItem.item_name);
          }
        }
      }
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentFarm?.id) {
      setError('User or farm not found. Please refresh and try again.');
      return;
    }

    if (taskTemplate && taskTemplate.inventory_effect !== 'none') {
      if (!inventoryQuantity || parseFloat(inventoryQuantity) <= 0) {
        setError('Please enter a valid quantity');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      let photoUrl: string | null = null;

      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${currentFarm.id}/${task.flock_id || 'general'}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('task-photos')
          .upload(fileName, photo);

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from('task-photos')
            .getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      }

      if (taskTemplate && taskTemplate.inventory_effect !== 'none' && taskTemplate.inventory_item_id && taskTemplate.inventory_type) {
        const quantity = parseFloat(inventoryQuantity);

        try {
          if (taskTemplate.inventory_effect === 'decrease') {
            await recordInventoryDecrease(
              currentFarm.id,
              user.id,
              taskTemplate.inventory_type,
              taskTemplate.inventory_item_id,
              quantity,
              taskTemplate.inventory_unit || 'units',
              'task',
              task.id
            );
          } else if (taskTemplate.inventory_effect === 'increase') {
            await recordInventoryIncrease(
              currentFarm.id,
              user.id,
              taskTemplate.inventory_type,
              taskTemplate.inventory_item_id,
              quantity,
              taskTemplate.inventory_unit || 'units',
              'task',
              task.id
            );
          }
        } catch (invError: any) {
          console.error('Inventory update error:', invError);
        }
      }

      const completionNotes = taskTemplate && inventoryQuantity
        ? `${notes ? notes + '\n\n' : ''}Used ${inventoryQuantity} ${taskTemplate.inventory_unit || 'units'} of ${inventoryItemName}`
        : notes;

      const updateData: Record<string, any> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completed_by: user.id,
      };

      if (completionNotes) {
        updateData.completion_notes = completionNotes;
      }
      if (photoUrl) {
        updateData.completion_photo_url = photoUrl;
      }

      const { error: updateError, data: updateResult } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', task.id)
        .select();

      if (updateError) {
        if (isNetworkError(updateError)) {
          // Queue for offline sync
          await tryWrite('tasks', 'update', updateData, task.id);
        } else {
          console.error('Task completion error:', {
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
            code: updateError.code,
          });
          setError(updateError.message || 'Failed to complete task');
          setLoading(false);
          return;
        }
      }

      const taskTitle = task.title_override || task.title || 'Task';
      const activityMessage = taskTemplate && inventoryQuantity
        ? `Completed task: ${taskTitle} (Used ${inventoryQuantity} ${taskTemplate.inventory_unit} of ${inventoryItemName})`
        : `Completed task: ${taskTitle}`;

      await supabase.from('activity_logs').insert({
        user_id: user.id,
        farm_id: currentFarm.id,
        action: activityMessage,
        entity_type: 'task',
        entity_id: task.id,
        details: {
          title: taskTitle,
          completion_photo_url: photoUrl,
          notes: completionNotes,
          inventory_used: inventoryQuantity ? parseFloat(inventoryQuantity) : null,
          inventory_unit: taskTemplate?.inventory_unit || null,
        },
      }).then(({ error: logError }) => {
        if (logError) {
          console.error('Activity log error:', logError);
        }
      });

      onSuccess();
    } catch (err: any) {
      console.error('Unexpected error:', err);
      setError(err?.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const taskTitle = task.title_override || task.title || 'Task';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold text-gray-900">{t('tasks.mark_complete')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 mb-4">
          <h3 className="font-semibold text-gray-900">{taskTitle}</h3>
          {task.notes && (
            <p className="text-sm text-gray-600 mt-1">{task.notes}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {taskTemplate && taskTemplate.inventory_effect !== 'none' && (
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-blue-600" />
                <h4 className="font-medium text-blue-900 text-sm">Inventory Update</h4>
              </div>

              <p className="text-xs text-blue-700 mb-2">
                {taskTemplate.inventory_effect === 'decrease' ? 'How much was used?' : 'How much was added?'}
                {inventoryItemName && <span className="block mt-0.5">Item: {inventoryItemName}</span>}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="inventoryQuantity" className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity *
                  </label>
                  <input
                    id="inventoryQuantity"
                    type="number"
                    step="0.5"
                    min="0"
                    value={inventoryQuantity}
                    onChange={(e) => setInventoryQuantity(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42]"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={taskTemplate.inventory_unit || 'units'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-600 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#3D5F42]/20 focus:border-[#3D5F42] resize-none"
              placeholder="Any notes about completing this task..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photo (Optional)
            </label>
            <label className="flex items-center justify-center gap-2 w-full px-3 py-2 border-2 border-dashed border-gray-300 rounded-xl hover:border-[#3D5F42] transition-colors cursor-pointer">
              <Camera className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                {photo ? photo.name : t('tasks.upload_photo')}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-medium disabled:opacity-50 text-sm"
            >
              {loading ? t('tasks.completing') : t('tasks.mark_complete')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
