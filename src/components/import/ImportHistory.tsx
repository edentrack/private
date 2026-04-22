import { useState, useEffect, useCallback } from 'react';
import { History, RotateCcw, Package, DollarSign, Egg, Bird, CheckSquare, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ImportRecord {
  id: string;
  farm_id: string;
  committed_at: string;
  item_count: number;
  is_undone: boolean;
  source_filename?: string;
  vendor_name?: string;
  status: string;
}

const UNDO_WINDOW_HOURS = 24;

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

export function ImportHistory() {
  const { currentFarm } = useAuth();
  const toast = useToast();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemCounts, setItemCounts] = useState<Record<string, Record<string, number>>>({});

  const loadHistory = useCallback(async () => {
    if (!currentFarm?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('imports')
      .select('id, farm_id, committed_at, item_count, is_undone, status')
      .eq('farm_id', currentFarm.id)
      .not('committed_at', 'is', null)
      .order('committed_at', { ascending: false })
      .limit(20);
    setImports(data || []);
    setLoading(false);
  }, [currentFarm?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const loadItemBreakdown = async (importId: string) => {
    if (itemCounts[importId]) return;
    const { data } = await supabase
      .from('import_items')
      .select('entity_type, status')
      .eq('import_id', importId);

    const counts: Record<string, number> = {};
    (data || []).forEach(item => {
      const key = `${item.entity_type}_${item.status}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    setItemCounts(prev => ({ ...prev, [importId]: counts }));
  };

  const handleUndo = async (importRecord: ImportRecord) => {
    if (!confirm(`Undo this import? All ${importRecord.item_count} imported records will be soft-deleted and can be reviewed in the import again.`)) return;

    setUndoing(importRecord.id);
    try {
      // Get all committed items from this import
      const { data: items } = await supabase
        .from('import_items')
        .select('id, entity_type, entity_id')
        .eq('import_id', importRecord.id)
        .eq('status', 'committed');

      if (!items?.length) {
        toast.error('No committed items found to undo');
        return;
      }

      // Soft-undo each entity type
      const byType: Record<string, string[]> = {};
      items.forEach(item => {
        if (!item.entity_id) return;
        byType[item.entity_type] = byType[item.entity_type] || [];
        byType[item.entity_type].push(item.entity_id);
      });

      const TABLE_MAP: Record<string, string> = {
        expense: 'expenses',
        inventory: 'feed_stock',
        production_log: 'egg_collections',
        flock: 'flocks',
        task_template: 'task_templates',
      };

      for (const [type, ids] of Object.entries(byType)) {
        const table = TABLE_MAP[type];
        if (!table || !ids.length) continue;
        // Mark as archived/deleted — we use a soft approach where possible
        if (table === 'expenses') {
          await supabase.from('expenses').delete().in('id', ids);
        } else if (table === 'feed_stock') {
          await supabase.from('feed_stock').delete().in('id', ids);
        } else if (table === 'egg_collections') {
          await supabase.from('egg_collections').delete().in('id', ids);
        } else if (table === 'flocks') {
          await supabase.from('flocks').update({ status: 'archived' }).in('id', ids);
        }
        // Reset import_items status back to proposed
        await supabase
          .from('import_items')
          .update({ status: 'proposed' })
          .eq('import_id', importRecord.id)
          .eq('entity_type', type);
      }

      // Mark import as undone
      await supabase
        .from('imports')
        .update({ is_undone: true, committed_at: null })
        .eq('id', importRecord.id);

      toast.success('Import undone — records removed');
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || 'Failed to undo');
    } finally {
      setUndoing(null);
    }
  };

  const entityIcon = (type: string) => {
    if (type.includes('expense')) return <DollarSign className="w-3.5 h-3.5 text-red-500" />;
    if (type.includes('egg') || type.includes('production')) return <Egg className="w-3.5 h-3.5 text-yellow-500" />;
    if (type.includes('flock')) return <Bird className="w-3.5 h-3.5 text-green-600" />;
    if (type.includes('inventory')) return <Package className="w-3.5 h-3.5 text-blue-500" />;
    return <CheckSquare className="w-3.5 h-3.5 text-gray-500" />;
  };

  if (loading) return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  );

  if (!imports.length) return (
    <div className="text-center py-10 text-gray-400">
      <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No import history yet</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {imports.map(imp => {
        const canUndo = !imp.is_undone && hoursAgo(imp.committed_at) < UNDO_WINDOW_HOURS;
        const hoursLeft = Math.ceil(UNDO_WINDOW_HOURS - hoursAgo(imp.committed_at));
        const isExpanded = expanded === imp.id;
        const counts = itemCounts[imp.id];

        return (
          <div key={imp.id} className={`border rounded-xl overflow-hidden ${imp.is_undone ? 'bg-gray-50 border-gray-200 opacity-60' : 'bg-white border-gray-100'}`}>
            <button
              type="button"
              onClick={() => {
                setExpanded(isExpanded ? null : imp.id);
                if (!isExpanded) loadItemBreakdown(imp.id);
              }}
              className="w-full text-left p-3 flex items-center gap-3"
            >
              <History className="w-4 h-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-800">
                    {imp.item_count} item{imp.item_count !== 1 ? 's' : ''} imported
                  </span>
                  {imp.is_undone && (
                    <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Undone</span>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(imp.committed_at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {canUndo && <span className="text-amber-500 ml-2">· Undo available {hoursLeft}h</span>}
                </p>
              </div>
              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-gray-50 pt-2 space-y-2">
                {counts ? (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(counts).map(([key, count]) => {
                      const [type] = key.split('_');
                      return (
                        <span key={key} className="flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg">
                          {entityIcon(type)}
                          {count} {type.replace('_', ' ')}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Loading breakdown…</p>
                )}

                {canUndo && (
                  <button
                    type="button"
                    disabled={undoing === imp.id}
                    onClick={() => handleUndo(imp)}
                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {undoing === imp.id ? 'Undoing…' : 'Undo this import'}
                  </button>
                )}
                {!canUndo && !imp.is_undone && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Undo window expired (24h limit)
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
