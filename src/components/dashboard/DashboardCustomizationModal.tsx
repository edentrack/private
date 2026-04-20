import { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AVAILABLE_WIDGETS, getDashboardPreferences, saveDashboardPreferences, toggleWidget } from '../../utils/dashboardPreferences';

interface Props {
  onClose: () => void;
}

export function DashboardCustomizationModal({ onClose }: Props) {
  const { t } = useTranslation();
  const [visibleWidgets, setVisibleWidgets] = useState<Set<string>>(new Set());

  useEffect(() => {
    const prefs = getDashboardPreferences();
    setVisibleWidgets(prefs);
  }, []);

  const handleToggle = (widgetId: string) => {
    const newVisible = new Set(visibleWidgets);
    if (newVisible.has(widgetId)) {
      newVisible.delete(widgetId);
    } else {
      newVisible.add(widgetId);
    }
    setVisibleWidgets(newVisible);
    toggleWidget(widgetId, newVisible.has(widgetId));
  };

  const handleSave = () => {
    saveDashboardPreferences(visibleWidgets);
    onClose();
  };

  const categories = Array.from(new Set(AVAILABLE_WIDGETS.map(w => w.category)));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {t('dashboard.customize') || 'Customize Dashboard'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {t('dashboard.choose_widgets') || 'Choose which widgets to display on your dashboard'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {categories.map(category => {
              const categoryWidgets = AVAILABLE_WIDGETS.filter(w => w.category === category);
              return (
                <div key={category}>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    {category.replace('_', ' ')}
                  </h3>
                  <div className="space-y-2">
                    {categoryWidgets.map(widget => {
                      const isVisible = visibleWidgets.has(widget.id);
                      return (
                        <label
                          key={widget.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => handleToggle(widget.id)}
                              className="sr-only"
                            />
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isVisible
                                  ? 'bg-[#3D5F42] border-[#3D5F42]'
                                  : 'border-gray-300 bg-white'
                              }`}
                            >
                              {isVisible && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </div>
                          <span className="text-sm font-medium text-gray-900 flex-1">
                            {widget.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('common.cancel') || 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-[#3D5F42] text-white rounded-lg hover:bg-[#2d4631] transition-colors"
          >
            {t('common.save') || 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}











