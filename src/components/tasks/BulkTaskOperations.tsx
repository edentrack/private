import { useState } from 'react';
import { CheckSquare, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { Task } from '../../types/database';

interface BulkTaskOperationsProps {
  selectedTasks: Task[];
  onComplete: () => void;
  onCancel: () => void;
}

export function BulkTaskOperations({ selectedTasks, onComplete, onCancel }: BulkTaskOperationsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBulkComplete = async () => {
    setLoading(true);
    setError('');

    try {
      const taskIds = selectedTasks.map((t) => t.id);
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'completed',
        })
        .in('id', taskIds);

      if (updateError) throw updateError;
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to complete tasks');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedTasks.length} tasks? This cannot be undone.`)) return;

    setLoading(true);
    setError('');

    try {
      const taskIds = selectedTasks.map((t) => t.id);
      const { error: deleteError } = await supabase
        .from('tasks')
        .delete()
        .in('id', taskIds);

      if (deleteError) throw deleteError;
      onComplete();
    } catch (err: any) {
      setError(err.message || 'Failed to delete tasks');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-white rounded-2xl shadow-2xl border-2 border-gray-200 p-4 z-50 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <CheckSquare className="w-5 h-5 text-[#3D5F42]" />
        <span className="font-medium text-gray-900">
          {selectedTasks.length} task{selectedTasks.length > 1 ? 's' : ''} selected
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleBulkComplete}
          disabled={loading}
          className="px-4 py-2 bg-[#3D5F42] text-white rounded-lg font-medium hover:bg-[#2F4A34] disabled:opacity-50 transition-colors"
        >
          Mark Complete
        </button>
        <button
          onClick={handleBulkDelete}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
        <button
          onClick={onCancel}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
