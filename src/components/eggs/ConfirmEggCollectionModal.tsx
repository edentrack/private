import { X, Egg } from 'lucide-react';

interface ConfirmEggCollectionModalProps {
  isOpen: boolean;
  totals: { small: number; medium: number; large: number; jumbo: number };
  totalGood: number;
  damaged: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmEggCollectionModal({
  isOpen,
  totals,
  totalGood,
  damaged,
  onConfirm,
  onCancel,
}: ConfirmEggCollectionModalProps) {
  if (!isOpen) return null;

  const sizes = [
    { label: 'Small', value: totals.small },
    { label: 'Medium', value: totals.medium },
    { label: 'Large', value: totals.large },
    { label: 'Jumbo', value: totals.jumbo },
  ].filter((s) => s.value > 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <Egg className="w-5 h-5 text-amber-600" />
            </div>
            <h2 className="text-base font-bold text-gray-900">Confirm Collection</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">Review the totals below before saving.</p>

          {/* Good / Damaged */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#3D5F42]/5 border border-[#3D5F42]/20 rounded-2xl px-4 py-3">
              <p className="text-xs text-[#3D5F42] font-semibold mb-0.5">Good eggs</p>
              <p className="text-2xl font-extrabold text-gray-900">{totalGood.toLocaleString()}</p>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-red-500 font-semibold mb-0.5">Damaged</p>
              <p className="text-2xl font-extrabold text-gray-900">{damaged}</p>
            </div>
          </div>

          {/* By size */}
          {sizes.length > 0 && (
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">By size</p>
              </div>
              <div className="divide-y divide-gray-100">
                {sizes.map((s) => (
                  <div key={s.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-gray-600">{s.label}</span>
                    <span className="text-sm font-bold text-gray-900">{s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-3 border border-gray-200 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-[#3D5F42] text-white rounded-xl font-semibold text-sm hover:bg-[#2d4632] transition-colors"
          >
            Save Record
          </button>
        </div>
      </div>
    </div>
  );
}
