import { useState, useEffect } from 'react';
import { Check, X, AlertTriangle, Edit2, ChevronDown, Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

interface ImportItem {
  id: string;
  entity_type: string;
  payload: Record<string, any>;
  confidence: number;
  needs_review: boolean;
  source_excerpt: string;
  status: string;
  linked_flock_id: string | null;
  error_message: string | null;
}

interface Flock {
  id: string;
  name: string;
  purpose: string;
}

interface Props {
  importId: string;
  farmId: string;
  onComplete: () => void;
  onCancel: () => void;
}

type TabType = 'flocks' | 'expenses' | 'inventory' | 'production' | 'task_template' | 'warnings';

const TABS: { id: TabType; label: string }[] = [
  { id: 'flocks', label: 'Flocks' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'production', label: 'Production' },
  { id: 'task_template', label: 'Tasks' },
  { id: 'warnings', label: 'Warnings' },
];

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="w-3 h-3" />
        High
      </span>
    );
  }
  if (confidence >= 0.5) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <AlertCircle className="w-3 h-3" />
        Med
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
      <XCircle className="w-3 h-3" />
      Low
    </span>
  );
}

export function ProposedImportReview({ importId, farmId, onComplete, onCancel }: Props) {
  const { currentRole } = useAuth();
  const [items, setItems] = useState<ImportItem[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('expenses');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<ImportItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCommit = currentRole === 'owner' || currentRole === 'manager';

  useEffect(() => {
    loadData();
  }, [importId]);

  async function loadData() {
    setLoading(true);
    try {
      const [itemsRes, flocksRes] = await Promise.all([
        supabase
          .from('import_items')
          .select('*')
          .eq('import_id', importId)
          .neq('status', 'discarded')
          .order('entity_type'),
        supabase
          .from('flocks')
          .select('id, name, purpose')
          .eq('farm_id', farmId)
          .eq('is_archived', false)
          .order('name'),
      ]);

      if (itemsRes.data) {
        setItems(itemsRes.data);
        const allIds = new Set(itemsRes.data.filter(i => i.status !== 'discarded').map(i => i.id));
        setSelectedIds(allIds);

        const firstTabWithItems = TABS.find(tab =>
          tab.id !== 'warnings' && itemsRes.data.some(i => i.entity_type === (tab.id === 'flocks' ? 'flock' : tab.id))
        );
        if (firstTabWithItems) setActiveTab(firstTabWithItems.id);

        const extractedWarnings: string[] = [];
        itemsRes.data.forEach(item => {
          if (item.payload?.warnings) {
            extractedWarnings.push(...item.payload.warnings);
          }
        });
        setWarnings(extractedWarnings);
      }
      if (flocksRes.data) setFlocks(flocksRes.data);
    } catch (err) {
      setError('Failed to load import data');
    } finally {
      setLoading(false);
    }
  }

  function getItemsForTab(tab: TabType): ImportItem[] {
    if (tab === 'warnings') return [];
    const entityType = tab === 'flocks' ? 'flock' : tab;
    return items.filter(i => i.entity_type === entityType);
  }

  function toggleItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(tab: TabType) {
    const tabItems = getItemsForTab(tab);
    setSelectedIds(prev => {
      const next = new Set(prev);
      tabItems.forEach(i => next.add(i.id));
      return next;
    });
  }

  function deselectAll(tab: TabType) {
    const tabItems = getItemsForTab(tab);
    setSelectedIds(prev => {
      const next = new Set(prev);
      tabItems.forEach(i => next.delete(i.id));
      return next;
    });
  }

  async function updateItemFlock(itemId: string, flockId: string | null) {
    await supabase
      .from('import_items')
      .update({ linked_flock_id: flockId })
      .eq('id', itemId);

    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, linked_flock_id: flockId } : i
    ));
  }

  async function handleCommit(selectedOnly: boolean = false) {
    if (!canCommit) {
      setError('Only owners and managers can commit imports');
      return;
    }

    setCommitting(true);
    setError(null);

    try {
      const idsToCommit = selectedOnly ? Array.from(selectedIds) : undefined;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-import/commit`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            import_id: importId,
            selected_item_ids: idsToCommit,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Commit failed');
      }

      const result = await response.json();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit import');
    } finally {
      setCommitting(false);
    }
  }

  async function handleSaveDraft() {
    const discardedIds = items
      .filter(i => !selectedIds.has(i.id))
      .map(i => i.id);

    if (discardedIds.length > 0) {
      await supabase
        .from('import_items')
        .update({ status: 'discarded' })
        .in('id', discardedIds);
    }

    onCancel();
  }

  async function handleDiscard() {
    await supabase
      .from('imports')
      .update({ status: 'failed' })
      .eq('id', importId);
    onCancel();
  }

  function renderExpenseRow(item: ImportItem) {
    const p = item.payload;
    const questions = p.verification_questions || [];
    return (
      <>
        <tr key={item.id} className={!selectedIds.has(item.id) ? 'opacity-50' : ''}>
          <td className="px-4 py-3">
            <input
              type="checkbox"
              checked={selectedIds.has(item.id)}
              onChange={() => toggleItem(item.id)}
              className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
            />
          </td>
          <td className="px-4 py-3 text-sm">{p.incurred_on}</td>
          <td className="px-4 py-3 text-sm">{p.category}</td>
          <td className="px-4 py-3 text-sm font-medium">
            {p.currency} {Number(p.amount).toLocaleString()}
          </td>
          <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{p.description}</td>
          <td className="px-4 py-3">
            <ConfidenceBadge confidence={item.confidence} />
          </td>
          <td className="px-4 py-3">
            <select
              value={item.linked_flock_id || ''}
              onChange={(e) => updateItemFlock(item.id, e.target.value || null)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="">No flock</option>
              {flocks.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </td>
          <td className="px-4 py-3">
            <button
              onClick={() => setEditingItem(item)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Edit2 className="w-4 h-4 text-gray-500" />
            </button>
          </td>
        </tr>
        {questions.length > 0 && (
          <tr>
            <td colSpan={8} className="px-4 py-2 bg-blue-50 border-l-4 border-blue-400">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-blue-900 mb-1">Verification Questions:</p>
                  <ul className="list-disc list-inside text-xs text-blue-800 space-y-0.5">
                    {questions.map((q: string, idx: number) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }

  function renderInventoryRow(item: ImportItem) {
    const p = item.payload;
    return (
      <tr key={item.id} className={!selectedIds.has(item.id) ? 'opacity-50' : ''}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleItem(item.id)}
            className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
          />
        </td>
        <td className="px-4 py-3 text-sm capitalize">{p.inventory_type}</td>
        <td className="px-4 py-3 text-sm font-medium">{p.item_name}</td>
        <td className="px-4 py-3 text-sm">{p.quantity} {p.unit}</td>
        <td className="px-4 py-3 text-sm">{p.purchased_on}</td>
        <td className="px-4 py-3 text-sm">
          {p.cost ? `${p.currency} ${Number(p.cost).toLocaleString()}` : '-'}
        </td>
        <td className="px-4 py-3">
          <ConfidenceBadge confidence={item.confidence} />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditingItem(item)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
        </td>
      </tr>
    );
  }

  function renderProductionRow(item: ImportItem) {
    const p = item.payload;
    return (
      <tr key={item.id} className={!selectedIds.has(item.id) ? 'opacity-50' : ''}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleItem(item.id)}
            className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
          />
        </td>
        <td className="px-4 py-3 text-sm capitalize">{p.log_type?.replace('_', ' ')}</td>
        <td className="px-4 py-3 text-sm">{p.logged_on}</td>
        <td className="px-4 py-3 text-sm font-medium">{p.value} {p.unit}</td>
        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{p.notes}</td>
        <td className="px-4 py-3">
          <ConfidenceBadge confidence={item.confidence} />
        </td>
        <td className="px-4 py-3">
          <select
            value={item.linked_flock_id || ''}
            onChange={(e) => updateItemFlock(item.id, e.target.value || null)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="">No flock</option>
            {flocks.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditingItem(item)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
        </td>
      </tr>
    );
  }

  function renderFlockRow(item: ImportItem) {
    const p = item.payload;
    return (
      <tr key={item.id} className={!selectedIds.has(item.id) ? 'opacity-50' : ''}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleItem(item.id)}
            className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
          />
        </td>
        <td className="px-4 py-3 text-sm font-medium">{p.name}</td>
        <td className="px-4 py-3 text-sm capitalize">{p.type}</td>
        <td className="px-4 py-3 text-sm">{p.bird_count?.toLocaleString()}</td>
        <td className="px-4 py-3 text-sm">{p.start_date}</td>
        <td className="px-4 py-3">
          <ConfidenceBadge confidence={item.confidence} />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditingItem(item)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
        </td>
      </tr>
    );
  }

  function renderTaskRow(item: ImportItem) {
    const p = item.payload;
    return (
      <tr key={item.id} className={!selectedIds.has(item.id) ? 'opacity-50' : ''}>
        <td className="px-4 py-3">
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleItem(item.id)}
            className="w-4 h-4 text-[#3D5F42] rounded border-gray-300 focus:ring-[#3D5F42]"
          />
        </td>
        <td className="px-4 py-3 text-sm font-medium">{p.title}</td>
        <td className="px-4 py-3 text-sm capitalize">{p.kind}</td>
        <td className="px-4 py-3 text-sm">{p.category}</td>
        <td className="px-4 py-3 text-sm capitalize">{p.flock_type}</td>
        <td className="px-4 py-3 text-sm">{p.default_time}</td>
        <td className="px-4 py-3">
          <ConfidenceBadge confidence={item.confidence} />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => setEditingItem(item)}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
        </td>
      </tr>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#3D5F42] animate-spin" />
      </div>
    );
  }

  const tabCounts: Record<TabType, number> = {
    flocks: getItemsForTab('flocks').length,
    expenses: getItemsForTab('expenses').length,
    inventory: getItemsForTab('inventory').length,
    production: getItemsForTab('production').length,
    task_template: getItemsForTab('task_template').length,
    warnings: warnings.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Review Import</h1>
          <p className="text-gray-600 mt-1">
            Review and edit extracted data before importing
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {selectedIds.size} of {items.length} items selected
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <div className="flex overflow-x-auto">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#3D5F42] text-[#3D5F42]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tabCounts[tab.id] > 0 && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.id
                      ? 'bg-[#3D5F42]/10 text-[#3D5F42]'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tabCounts[tab.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {activeTab === 'warnings' ? (
            <div className="space-y-2">
              {warnings.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No warnings</p>
              ) : (
                warnings.map((warning, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-800 text-sm">{warning}</p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  <button
                    onClick={() => selectAll(activeTab)}
                    className="text-sm text-[#3D5F42] hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => deselectAll(activeTab)}
                    className="text-sm text-gray-500 hover:underline"
                  >
                    Deselect all
                  </button>
                </div>
              </div>

              {getItemsForTab(activeTab).length === 0 ? (
                <p className="text-gray-500 text-center py-8">No items extracted</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Include
                        </th>
                        {activeTab === 'expenses' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flock</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                          </>
                        )}
                        {activeTab === 'inventory' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cost</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                          </>
                        )}
                        {activeTab === 'production' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Value</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flock</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                          </>
                        )}
                        {activeTab === 'flocks' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Birds</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                          </>
                        )}
                        {activeTab === 'task_template' && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flock Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Edit</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {activeTab === 'expenses' && getItemsForTab('expenses').map(renderExpenseRow)}
                      {activeTab === 'inventory' && getItemsForTab('inventory').map(renderInventoryRow)}
                      {activeTab === 'production' && getItemsForTab('production').map(renderProductionRow)}
                      {activeTab === 'flocks' && getItemsForTab('flocks').map(renderFlockRow)}
                      {activeTab === 'task_template' && getItemsForTab('task_template').map(renderTaskRow)}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={handleDiscard}
          className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Discard All
        </button>
        <div className="flex gap-3">
          <button
            onClick={handleSaveDraft}
            className="px-6 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Save Draft
          </button>
          {canCommit && (
            <>
              <button
                onClick={() => handleCommit(true)}
                disabled={committing || selectedIds.size === 0}
                className="px-6 py-2.5 text-[#3D5F42] bg-white border border-[#3D5F42] rounded-lg hover:bg-[#3D5F42]/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Commit Selected ({selectedIds.size})
              </button>
              <button
                onClick={() => handleCommit(false)}
                disabled={committing || items.length === 0}
                className="px-6 py-2.5 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Commit All
              </button>
            </>
          )}
          {!canCommit && (
            <p className="text-sm text-gray-500 self-center">
              Only owners and managers can commit imports
            </p>
          )}
        </div>
      </div>

      {editingItem && (
        <EditItemModal
          item={editingItem}
          flocks={flocks}
          onSave={async (updated) => {
            await supabase
              .from('import_items')
              .update({
                payload: updated.payload,
                linked_flock_id: updated.linked_flock_id,
                status: 'edited',
              })
              .eq('id', updated.id);
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
            setEditingItem(null);
          }}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}

function EditItemModal({
  item,
  flocks,
  onSave,
  onClose
}: {
  item: ImportItem;
  flocks: Flock[];
  onSave: (item: ImportItem) => void;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState(item.payload);
  const [linkedFlockId, setLinkedFlockId] = useState(item.linked_flock_id || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...item,
      payload,
      linked_flock_id: linkedFlockId || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Edit {item.entity_type}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {Object.entries(payload).map(([key, value]) => {
            if (key === 'warnings' || key === 'input_fields') return null;
            return (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {key.replace(/_/g, ' ')}
                </label>
                <input
                  type={typeof value === 'number' ? 'number' : 'text'}
                  value={value ?? ''}
                  onChange={(e) => setPayload(prev => ({
                    ...prev,
                    [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value
                  }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
                />
              </div>
            );
          })}

          {(item.entity_type === 'expense' || item.entity_type === 'production') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link to Flock
              </label>
              <select
                value={linkedFlockId}
                onChange={(e) => setLinkedFlockId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3D5F42]"
              >
                <option value="">No flock</option>
                {flocks.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          )}

          {item.source_excerpt && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Excerpt
              </label>
              <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg italic">
                "{item.source_excerpt}"
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
